// Merge de 3 vias dos dados do catálogo (produtos, categorias, intro).
//
// Cada sincronização compara três versões de cada item:
//   base   → como estava na última sincronização desta máquina
//   local  → como está agora nesta máquina
//   remoto → como está agora no GitHub (o que a outra máquina enviou)
//
// Regras, item a item (pelo `id`):
//   - só um lado mudou            → fica a mudança
//   - os dois mudaram igual       → fica igual
//   - os dois mudaram diferente   → merge campo a campo; se o MESMO campo mudou
//                                   diferente nos dois lados, é conflito e o
//                                   usuário escolhe qual versão manter
//   - um lado excluiu, outro editou → conflito (manter ou excluir)
//   - os dois criaram itens novos com o mesmo id (ids são sequenciais, então
//     isso acontece quando as duas máquinas cadastram sem sincronizar) → são
//     itens diferentes: o local ganha um id novo. Se o código (CM-093) também
//     colidir, o local é renumerado e a foto dele é renomeada junto.
//
// Este módulo é puro (não toca em disco nem em rede) para poder ser testado.

const { gerarProximoId, proximoCodigoCategoria, sanitizarCodigo } = require('./ids');

// JSON com chaves ordenadas: dois objetos iguais com campos em ordem diferente
// (o admin às vezes regrava os campos em outra ordem) contam como iguais.
function estavel(v) {
  if (v === undefined) return 'undefined';
  if (Array.isArray(v)) return `[${v.map(estavel).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${estavel(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

function igual(a, b) {
  return estavel(a) === estavel(b);
}

// Merge campo a campo de dois objetos que mudaram em relação à base.
// Devolve o objeto mesclado e a lista de campos em conflito (nesses, o valor
// provisório é o remoto; quem chama aplica a escolha do usuário).
function mergeCampos(base, local, remoto) {
  const b = base || {};
  const chaves = new Set([...Object.keys(remoto), ...Object.keys(local), ...Object.keys(b)]);
  const resultado = {};
  const conflitos = [];
  for (const k of chaves) {
    const bv = b[k];
    const lv = local[k];
    const rv = remoto[k];
    let v;
    if (igual(lv, rv)) v = lv;
    else if (igual(lv, bv)) v = rv;
    else if (igual(rv, bv)) v = lv;
    else { conflitos.push(k); v = rv; }
    if (v !== undefined) resultado[k] = v;
  }
  return { resultado, conflitos };
}

function aplicarEscolha(mesclado, campos, origem) {
  const final = { ...mesclado };
  for (const k of campos) {
    if (origem[k] === undefined) delete final[k];
    else final[k] = origem[k];
  }
  return final;
}

// Merge de uma lista de objetos com `id`.
//   tipo       → 'produto' | 'categoria' (usado na chave do conflito)
//   temBase    → false na primeira sincronização (sem histórico): aí um mesmo
//                id dos dois lados é tratado como o MESMO item (conflito se
//                diferente), e não como dois itens novos que colidiram
//   novoId     → função(listaFinal) que gera um id livre
//   resolucoes → { 'produto:p00012': 'local' | 'remoto', ... }
function mergeLista({ base, local, remoto, temBase, tipo, novoId, resolucoes }) {
  const porId = (lista) => new Map((lista || []).map((x) => [x.id, x]));
  const mb = porId(base);
  const ml = porId(local);
  const mr = porId(remoto);
  const ordem = [...(remoto || []).map((x) => x.id), ...(local || []).map((x) => x.id)];
  const vistos = new Set();
  const lista = [];
  const conflitos = [];
  const colididos = []; // itens locais novos cujo id já foi usado no remoto

  for (const id of ordem) {
    if (vistos.has(id)) continue;
    vistos.add(id);
    const b = mb.get(id);
    const l = ml.get(id);
    const r = mr.get(id);
    const chave = `${tipo}:${id}`;
    const escolha = resolucoes[chave];

    if (igual(l, r)) { if (l) lista.push(l); continue; }
    if (igual(l, b)) { if (r) lista.push(r); continue; }
    if (igual(r, b)) { if (l) lista.push(l); continue; }

    // Daqui pra baixo: os dois lados mudaram, de formas diferentes.
    if (b === undefined && l && r) {
      if (temBase) { lista.push(r); colididos.push(l); continue; }
      // Primeira sincronização: mesmo id = mesmo item. Mescla o que dá.
      const { resultado, conflitos: campos } = mergeCampos({}, l, r);
      if (!campos.length) { lista.push(resultado); continue; }
      if (escolha) { lista.push(aplicarEscolha(resultado, campos, escolha === 'local' ? l : r)); continue; }
      conflitos.push({ chave, tipo, id, local: l, remoto: r, campos });
      continue;
    }

    if (!l || !r) {
      // Excluído de um lado, editado do outro.
      if (escolha === 'local') { if (l) lista.push(l); continue; }
      if (escolha === 'remoto') { if (r) lista.push(r); continue; }
      conflitos.push({
        chave, tipo, id, local: l || null, remoto: r || null, campos: [],
        excluidoLocal: !l, excluidoRemoto: !r,
      });
      continue;
    }

    const { resultado, conflitos: campos } = mergeCampos(b, l, r);
    if (!campos.length) { lista.push(resultado); continue; }
    if (escolha) { lista.push(aplicarEscolha(resultado, campos, escolha === 'local' ? l : r)); continue; }
    conflitos.push({ chave, tipo, id, local: l, remoto: r, campos });
  }

  // Itens locais que colidiram de id ganham um id novo, depois de tudo.
  const renomeados = new Map();
  for (const item of colididos) {
    const id = novoId([...lista, ...colididos]);
    renomeados.set(item.id, id);
    item.id = id;
    lista.push(item);
  }

  return { lista, conflitos, renomeados };
}

// Merge do intro.json (um objeto só).
function mergeIntro({ base, local, remoto, resolucoes }) {
  if (igual(local, remoto)) return { intro: local, conflitos: [] };
  if (igual(local, base)) return { intro: remoto, conflitos: [] };
  if (igual(remoto, base)) return { intro: local, conflitos: [] };
  if (!local || !remoto) return { intro: local || remoto, conflitos: [] };
  const { resultado, conflitos: campos } = mergeCampos(base, local, remoto);
  if (!campos.length) return { intro: resultado, conflitos: [] };
  const escolha = resolucoes['intro:intro'];
  if (escolha) {
    return { intro: aplicarEscolha(resultado, campos, escolha === 'local' ? local : remoto), conflitos: [] };
  }
  return {
    intro: resultado,
    conflitos: [{ chave: 'intro:intro', tipo: 'intro', id: 'intro', local, remoto, campos }],
  };
}

const lista = (doc, campo) => (doc ? doc[campo] || [] : null);

// Merge completo. Cada documento pode ser null (arquivo não existe daquele lado).
//   base/local/remoto = { produtos: {produtos:[]}, categorias: {categorias:[]}, intro: {} }
// Devolve os documentos finais, os conflitos pendentes, as fotos locais a
// renomear (quando um código local precisou mudar) e mensagens para o usuário.
function mergeDados({ base, local, remoto, resolucoes = {} }) {
  const conflitos = [];
  const mensagens = [];
  const renomearFotos = [];

  // 1) Categorias
  const cat = mergeLista({
    base: lista(base.categorias, 'categorias'),
    local: lista(local.categorias, 'categorias'),
    remoto: lista(remoto.categorias, 'categorias'),
    temBase: !!base.categorias,
    tipo: 'categoria',
    novoId: (l) => gerarProximoId(l, 'c', 3),
    resolucoes,
  });
  conflitos.push(...cat.conflitos);
  for (const idNovo of cat.renomeados.values()) {
    const c = cat.lista.find((x) => x.id === idNovo);
    mensagens.push(`A categoria "${c?.nome}" foi criada nas duas máquinas e as duas foram mantidas.`);
  }

  // 2) Produtos — antes, os produtos locais passam a apontar para o id novo
  // das categorias locais que foram renomeadas no passo anterior.
  let produtosLocais = lista(local.produtos, 'produtos');
  if (produtosLocais && cat.renomeados.size) {
    produtosLocais = produtosLocais.map((p) => (cat.renomeados.has(p.categoriaId)
      ? { ...p, categoriaId: cat.renomeados.get(p.categoriaId) }
      : p));
  }
  const prod = mergeLista({
    base: lista(base.produtos, 'produtos'),
    local: produtosLocais,
    remoto: lista(remoto.produtos, 'produtos'),
    temBase: !!base.produtos,
    tipo: 'produto',
    novoId: (l) => gerarProximoId(l, 'p', 5),
    resolucoes,
  });
  conflitos.push(...prod.conflitos);

  // 3) Códigos repetidos: um produto local novo (que ainda não existe no
  // remoto nem existia na base) com o mesmo código de outro produto é
  // renumerado para o próximo código livre da categoria.
  const idsRemotos = new Set((lista(remoto.produtos, 'produtos') || []).map((p) => p.id));
  const idsBase = new Set((lista(base.produtos, 'produtos') || []).map((p) => p.id));
  const ehNovoLocal = (p) => !idsRemotos.has(p.id) && !idsBase.has(p.id);
  const normal = (c) => String(c || '').trim().toLowerCase();
  for (const p of prod.lista) {
    if (!ehNovoLocal(p)) continue;
    const repetido = prod.lista.some((o) => o !== p && !ehNovoLocal(o) && normal(o.codigo) === normal(p.codigo));
    if (!repetido) continue;
    const categoria = cat.lista.find((c) => c.id === p.categoriaId);
    const prefixo = categoria?.prefixoCodigo || '';
    let novo;
    if (prefixo && p.codigo.startsWith(prefixo)) {
      novo = proximoCodigoCategoria(prod.lista, p.categoriaId, prefixo);
    } else {
      let n = 2;
      do { novo = `${p.codigo}-${n}`; n += 1; } while (prod.lista.some((o) => normal(o.codigo) === normal(novo)));
    }
    const antigo = p.codigo;
    const fotoAntiga = p.foto || '';
    const ext = fotoAntiga.slice(fotoAntiga.lastIndexOf('.'));
    if (fotoAntiga.startsWith(`/uploads/produtos/${sanitizarCodigo(antigo)}.`)) {
      const fotoNova = `/uploads/produtos/${sanitizarCodigo(novo)}${ext}`;
      renomearFotos.push({ de: fotoAntiga.slice(1), para: fotoNova.slice(1) });
      p.foto = fotoNova;
    }
    p.codigo = novo;
    mensagens.push(`O código ${antigo} já tinha sido usado na outra máquina — o seu produto "${p.nome}" virou ${novo}.`);
  }

  // 4) Intro
  const intro = mergeIntro({ base: base.intro, local: local.intro, remoto: remoto.intro, resolucoes });
  conflitos.push(...intro.conflitos);

  const existe = (k) => base[k] || local[k] || remoto[k];
  return {
    documentos: {
      categorias: existe('categorias') ? { categorias: cat.lista } : null,
      produtos: existe('produtos') ? { produtos: prod.lista } : null,
      intro: intro.intro || null,
    },
    conflitos,
    renomearFotos,
    mensagens,
  };
}

module.exports = { mergeDados, mergeLista, mergeCampos, igual, estavel };
