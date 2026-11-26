// Sincronização dos dados (JSONs + fotos) com a branch `dados` do GitHub.
//
// Funciona como um "git pull + push" simplificado, sem precisar do Git:
//   1. lê o estado da última sincronização (.sync/estado.json): o commit e o
//      SHA de cada arquivo naquele momento — é a "base" do merge de 3 vias;
//   2. compara base × local × remoto, arquivo por arquivo (fotos) e item por
//      item (JSONs, via lib/merge.js);
//   3. se houver conflito que precisa de decisão do usuário, PARA sem mudar
//      nada e devolve os conflitos; a interface chama de novo com as escolhas;
//   4. aplica o que veio do remoto, grava os JSONs mesclados e envia o que
//      mudou localmente num único commit;
//   5. se outra máquina enviou algo no meio do caminho (o GitHub recusa o
//      update da branch), repete — o merge de 3 vias é idempotente.
//
// Ficam fora da sincronização: data/auth.json (senha de cada máquina),
// backups .bak, a pasta .sync e a configuração com o token.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { shaBlob } = require('./github');
const { mergeDados } = require('./merge');
const { sanitizarCodigo } = require('./ids');

const ARQUIVOS_JSON = {
  produtos: 'data/produtos.json',
  categorias: 'data/categorias.json',
  intro: 'data/intro.json',
};
const CAMINHOS_JSON = new Set(Object.values(ARQUIVOS_JSON));
const IGNORAR = /(^|\/)(\.|Thumbs\.db$|desktop\.ini$)|:/i; // ocultos, lixo do Windows, :Zone.Identifier

function entraNaSync(rel) {
  if (CAMINHOS_JSON.has(rel)) return true;
  return rel.startsWith('uploads/') && !IGNORAR.test(rel);
}

/* ---------- Estado local ---------- */

function pastaSync(dir) { return path.join(dir, 'data', '.sync'); }

function lerEstado(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(pastaSync(dir), 'estado.json'), 'utf8'));
  } catch {
    return { commit: null, tree: null, arquivos: {}, cache: {} };
  }
}

function gravarAtomico(arquivo, conteudo) {
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  const tmp = `${arquivo}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, conteudo);
  fs.renameSync(tmp, arquivo);
}

function gravarEstado(dir, estado) {
  gravarAtomico(path.join(pastaSync(dir), 'estado.json'), JSON.stringify(estado));
}

function lerBase(dir, rel) {
  try { return JSON.parse(fs.readFileSync(path.join(pastaSync(dir), 'base', rel), 'utf8')); } catch { return null; }
}

function gravarBase(dir, rel, doc) {
  const arq = path.join(pastaSync(dir), 'base', rel);
  if (doc === null) { fs.rmSync(arq, { force: true }); return; }
  gravarAtomico(arq, JSON.stringify(doc));
}

function lerJsonLocal(dir, rel) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, rel), 'utf8')); } catch { return null; }
}

const serializar = (doc) => Buffer.from(JSON.stringify(doc, null, 2));

/* ---------- Arquivos locais ---------- */

// Varre uploads/ e calcula o SHA de cada arquivo. O cache (tamanho + data de
// modificação) evita reler as fotos que não mudaram desde a última vez.
function escanearUploads(dir, cacheAntigo) {
  const mapa = {};
  const cache = {};
  const raiz = path.join(dir, 'uploads');
  const andar = (abs) => {
    let itens;
    try { itens = fs.readdirSync(abs, { withFileTypes: true }); } catch { return; }
    for (const it of itens) {
      const a = path.join(abs, it.name);
      const rel = path.relative(dir, a).split(path.sep).join('/');
      if (it.isDirectory()) { if (!IGNORAR.test(rel)) andar(a); continue; }
      if (!it.isFile() || !entraNaSync(rel)) continue;
      const st = fs.statSync(a);
      const c = cacheAntigo[rel];
      const sha = c && c.tamanho === st.size && c.mtime === st.mtimeMs ? c.sha : shaBlob(fs.readFileSync(a));
      mapa[rel] = sha;
      cache[rel] = { tamanho: st.size, mtime: st.mtimeMs, sha };
    }
  };
  andar(raiz);
  return { mapa, cache };
}

/* ---------- Plano de arquivos (fotos) ---------- */

function planejarArquivos({ base, local, remoto, resolucoes }) {
  const plano = { baixar: [], excluirLocal: [], enviar: [], excluirRemoto: [], conflitos: [] };
  const caminhos = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remoto)]);
  for (const p of caminhos) {
    if (CAMINHOS_JSON.has(p)) continue;
    const b = base[p];
    const l = local[p];
    const r = remoto[p];
    if (l === r) continue;
    if (l === b) { (r ? plano.baixar : plano.excluirLocal).push(p); continue; }
    if (r === b) { (l ? plano.enviar : plano.excluirRemoto).push(p); continue; }
    const escolha = resolucoes[`arquivo:${p}`];
    if (escolha === 'local') { (l ? plano.enviar : plano.excluirRemoto).push(p); continue; }
    if (escolha === 'remoto') { (r ? plano.baixar : plano.excluirLocal).push(p); continue; }
    plano.conflitos.push({
      chave: `arquivo:${p}`, tipo: 'arquivo', id: p, caminho: p,
      localExiste: !!l, remotoExiste: !!r, remotoSha: r || null,
    });
  }
  return plano;
}

// Produto dono de uma foto (para a janela de conflito mostrar o cadastro
// completo, e não só a imagem). Procura pelo campo `foto`; se nenhum produto
// aponta para o arquivo, tenta pelo código no nome (uploads/produtos/CM-001.webp).
function produtoDaFoto(doc, caminho) {
  const lista = (doc && doc.produtos) || [];
  const url = `/${caminho}`;
  const porFoto = lista.find((p) => String(p.foto || '').split('?')[0] === url);
  if (porFoto) return porFoto;
  if (!caminho.startsWith('uploads/produtos/')) return null;
  const nome = path.posix.basename(caminho, path.posix.extname(caminho));
  return lista.find((p) => p.codigo && sanitizarCodigo(p.codigo) === nome) || null;
}

/* ---------- Sincronização ---------- */

// Trava por pasta de dados (no app real só existe uma; nos testes, duas
// "máquinas" rodam no mesmo processo).
const emAndamento = new Set();
function sincronizando() { return emAndamento.size > 0; }

async function sincronizar(opcoes) {
  if (emAndamento.has(opcoes.dir)) {
    const e = new Error('Já existe uma sincronização em andamento.');
    e.codigo = 'EM_ANDAMENTO';
    throw e;
  }
  emAndamento.add(opcoes.dir);
  try {
    for (let tentativa = 1; ; tentativa += 1) {
      const r = await tentarSincronizar(opcoes);
      if (r.status !== 'repetir') return r;
      if (tentativa >= 4) throw new Error('A outra máquina está sincronizando ao mesmo tempo. Tente de novo em instantes.');
    }
  } finally {
    emAndamento.delete(opcoes.dir);
  }
}

async function tentarSincronizar({ dir, gh, branch, resolucoes = {}, nomeMaquina = os.hostname(), aoProgresso = () => {} }) {
  const estado = lerEstado(dir);

  // Remoto
  aoProgresso('Consultando o GitHub…');
  const remotoCommit = await gh.getRef(branch);
  let remotoTree = null;
  let remotoMapa = {};
  if (remotoCommit && remotoCommit === estado.commit) {
    remotoTree = estado.tree;
    remotoMapa = { ...estado.arquivos };
  } else if (remotoCommit) {
    remotoTree = (await gh.getCommit(remotoCommit)).treeSha;
    for (const e of await gh.getTree(remotoTree)) {
      if (entraNaSync(e.path)) remotoMapa[e.path] = e.sha;
    }
  }

  // JSONs: base, local e remoto (só baixa o remoto se mudou desde a base)
  const docs = { base: {}, local: {}, remoto: {} };
  for (const [nome, rel] of Object.entries(ARQUIVOS_JSON)) {
    docs.base[nome] = lerBase(dir, rel);
    docs.local[nome] = lerJsonLocal(dir, rel);
    const shaR = remotoMapa[rel];
    if (!shaR) docs.remoto[nome] = null;
    else if (shaR === estado.arquivos[rel] && docs.base[nome]) docs.remoto[nome] = docs.base[nome];
    else docs.remoto[nome] = JSON.parse((await gh.getBlob(shaR)).toString('utf8'));
  }
  // Proteção: arquivo de dados sumido (ou lista esvaziada) nesta máquina NÃO
  // significa "apaguei tudo" — é muito mais provável ter sido um acidente
  // (git apagando arquivos não rastreados, pasta copiada pela metade...).
  // Nesses casos o local é tratado como "sem mudanças" e o remoto é baixado,
  // em vez de propagar a exclusão em massa para a outra máquina.
  const recuperados = [];
  const locaisOriginais = { ...docs.local };
  for (const nome of Object.keys(ARQUIVOS_JSON)) {
    const base = docs.base[nome];
    if (!base) continue;
    const local = docs.local[nome];
    const vazio = (d) => (nome === 'intro' ? !d || !Object.keys(d).length : !d || !(d[nome] || []).length);
    if (vazio(local) && !vazio(base)) {
      docs.local[nome] = base;
      recuperados.push(ARQUIVOS_JSON[nome]);
    }
  }

  const merge = mergeDados({ base: docs.base, local: docs.local, remoto: docs.remoto, resolucoes });

  // Fotos: o plano já considera as fotos locais que vão ser renomeadas
  // (código que colidiu) como se já estivessem no caminho novo.
  const { mapa: localMapa, cache } = escanearUploads(dir, estado.cache || {});
  // Mesma proteção para a pasta de fotos: se ela sumiu inteira, baixa de novo
  // em vez de apagar todas as fotos do GitHub.
  const fotosBase = Object.keys(estado.arquivos).filter((p) => !CAMINHOS_JSON.has(p));
  if (!fs.existsSync(path.join(dir, 'uploads')) && fotosBase.length) {
    for (const p of fotosBase) localMapa[p] = estado.arquivos[p];
    recuperados.push('uploads/');
  }
  const renomeacoes = merge.renomearFotos.filter((r) => localMapa[r.de] && !fs.existsSync(path.join(dir, r.para)));
  for (const r of renomeacoes) {
    localMapa[r.para] = localMapa[r.de];
    delete localMapa[r.de];
  }
  const plano = planejarArquivos({ base: estado.arquivos, local: localMapa, remoto: remotoMapa, resolucoes });

  const conflitos = [...merge.conflitos, ...plano.conflitos];
  if (conflitos.length) {
    // Para cada conflito de foto: anexa o cadastro do produto dos dois lados e
    // baixa a foto remota para a prévia.
    for (const c of plano.conflitos) {
      c.produtoLocal = produtoDaFoto(docs.local.produtos, c.caminho);
      c.produtoRemoto = produtoDaFoto(docs.remoto.produtos, c.caminho);
      if (!c.remotoSha) continue;
      const destino = path.join(pastaSync(dir), 'previa', c.remotoSha + path.extname(c.caminho).toLowerCase());
      if (!fs.existsSync(destino)) gravarAtomico(destino, await gh.getBlob(c.remotoSha));
    }
    return { status: 'conflitos', conflitos };
  }

  /* ----- Aplicar localmente ----- */
  for (const r of renomeacoes) {
    fs.renameSync(path.join(dir, r.de), path.join(dir, r.para));
    if (cache[r.de]) { cache[r.para] = cache[r.de]; delete cache[r.de]; }
  }
  // Fotos da base que não existem no disco (pasta recuperada) também baixam.
  if (recuperados.includes('uploads/')) {
    for (const p of fotosBase) {
      if (remotoMapa[p] && !plano.baixar.includes(p) && !fs.existsSync(path.join(dir, p))) plano.baixar.push(p);
    }
  }
  let n = 0;
  for (const p of plano.baixar) {
    n += 1;
    aoProgresso(`Baixando fotos (${n}/${plano.baixar.length})…`);
    gravarAtomico(path.join(dir, p), await gh.getBlob(remotoMapa[p]));
    delete cache[p];
  }
  for (const p of plano.excluirLocal) {
    fs.rmSync(path.join(dir, p), { force: true });
    delete cache[p];
  }

  const enviar = []; // { path, buf }
  for (const p of plano.enviar) enviar.push({ path: p, buf: fs.readFileSync(path.join(dir, p)) });
  const excluirRemoto = [...plano.excluirRemoto];

  for (const [nome, rel] of Object.entries(ARQUIVOS_JSON)) {
    const doc = merge.documentos[nome];
    if (doc === null) continue;
    const buf = serializar(doc);
    const atual = locaisOriginais[nome];
    if (!atual || !buf.equals(serializar(atual))) gravarAtomico(path.join(dir, rel), buf);
    if (shaBlob(buf) !== remotoMapa[rel]) enviar.push({ path: rel, buf });
  }

  /* ----- Enviar ----- */
  let novoCommit = remotoCommit;
  let novoTree = remotoTree;
  const novoMapa = { ...remotoMapa };
  if (enviar.length || excluirRemoto.length) {
    const entradas = [];
    n = 0;
    for (const e of enviar) {
      n += 1;
      aoProgresso(`Enviando (${n}/${enviar.length})…`);
      const sha = await gh.createBlob(e.buf);
      entradas.push({ path: e.path, sha });
      novoMapa[e.path] = sha;
    }
    for (const p of excluirRemoto) {
      if (remotoTree) entradas.push({ path: p, sha: null });
      delete novoMapa[p];
    }
    aoProgresso('Gravando no GitHub…');
    novoTree = await gh.createTree(remotoTree, entradas);
    const fotos = enviar.filter((e) => !CAMINHOS_JSON.has(e.path)).length;
    const jsons = enviar.length - fotos;
    const partes = [];
    if (jsons) partes.push('cadastros');
    if (fotos) partes.push(`${fotos} foto(s)`);
    if (excluirRemoto.length) partes.push(`${excluirRemoto.length} exclusão(ões)`);
    const mensagem = `dados: sincronizar ${partes.join(', ')} — ${nomeMaquina}`;
    novoCommit = await gh.createCommit(mensagem, novoTree, remotoCommit ? [remotoCommit] : []);
    try {
      if (remotoCommit) await gh.updateRef(branch, novoCommit);
      else await gh.createRef(branch, novoCommit);
    } catch (err) {
      if (err.codigo === 'NAO_FAST_FORWARD') {
        // Outra máquina enviou no meio. O que veio do remoto já foi aplicado
        // localmente; salva só o cache e repete com a base antiga.
        gravarEstado(dir, { ...estado, cache });
        return { status: 'repetir' };
      }
      throw err;
    }
  }

  /* ----- Nova base ----- */
  for (const [nome, rel] of Object.entries(ARQUIVOS_JSON)) gravarBase(dir, rel, merge.documentos[nome]);
  gravarEstado(dir, { commit: novoCommit, tree: novoTree, arquivos: novoMapa, cache, quando: new Date().toISOString() });
  fs.rmSync(path.join(pastaSync(dir), 'previa'), { recursive: true, force: true });

  return {
    status: 'ok',
    resumo: {
      baixados: plano.baixar.length,
      excluidosLocal: plano.excluirLocal.length,
      enviados: enviar.length,
      excluidosRemoto: excluirRemoto.length,
      dadosMudaram: Object.keys(ARQUIVOS_JSON).some((nome) => merge.documentos[nome] !== null
        && !(locaisOriginais[nome] && serializar(merge.documentos[nome]).equals(serializar(locaisOriginais[nome])))),
      mensagens: [
        ...recuperados.map((r) => `Os dados de ${r} tinham sumido deste computador e foram recuperados do GitHub.`),
        ...merge.mensagens,
      ],
    },
  };
}

function caminhoPrevia(dir, nome) {
  if (!/^[0-9a-f]{40}\.[a-z0-9]+$/.test(nome)) return null;
  const arq = path.join(pastaSync(dir), 'previa', nome);
  return fs.existsSync(arq) ? arq : null;
}

module.exports = { sincronizar, sincronizando, caminhoPrevia, lerEstado, planejarArquivos, entraNaSync };
