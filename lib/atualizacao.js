// Atualização do código do app empacotado (.exe) a partir da branch `main`.
//
// O .exe traz só o "motor" (Node + Chrome + node_modules). O código (server.js,
// lib/, admin/, templates/...) fica numa pasta ao lado e é atualizado por aqui:
// baixa da `main` só os arquivos cujo SHA mudou, troca no lugar e pede para o
// launcher reiniciar o servidor.
//
// O manifesto (.manifesto.json, criado no build) guarda o commit instalado e
// o SHA de cada arquivo — é com ele que sabemos o que mudou e o que apagar.
//
// Se a atualização mexer nas dependências (package.json → dependencies), ela
// NÃO é aplicada: as bibliotecas vêm dentro do instalador, então é preciso um
// .exe novo. Desligado em desenvolvimento (pasta com .git).

const fs = require('fs');
const path = require('path');
const { estavel } = require('./merge');

const IGNORAR = /^(data|uploads|output|node_modules|\.github|build|dist)\//;

function habilitada(root) {
  return process.env.CATALOGO_EMPACOTADO === '1' && !fs.existsSync(path.join(root, '.git'));
}

function lerManifesto(root) {
  try { return JSON.parse(fs.readFileSync(path.join(root, '.manifesto.json'), 'utf8')); } catch { return null; }
}

function caminhoSeguro(root, rel) {
  const abs = path.resolve(root, rel);
  if (!abs.startsWith(path.resolve(root) + path.sep)) throw new Error(`caminho inválido na atualização: ${rel}`);
  return abs;
}

async function atualizar({ root, gh, branch = 'main', aoProgresso = () => {} }) {
  if (!habilitada(root)) return { habilitada: false };
  const manifesto = lerManifesto(root);
  if (!manifesto) return { habilitada: false };

  const commit = await gh.getRef(branch);
  if (!commit || commit === manifesto.commit) return { habilitada: true, atualizado: true };

  const { treeSha } = await gh.getCommit(commit);
  const remoto = {};
  for (const e of await gh.getTree(treeSha)) {
    if (!IGNORAR.test(e.path)) remoto[e.path] = e.sha;
  }

  const pkgLocal = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const pkgRemoto = remoto['package.json']
    ? JSON.parse((await gh.getBlob(remoto['package.json'])).toString('utf8'))
    : pkgLocal;
  if (estavel(pkgRemoto.dependencies || {}) !== estavel(pkgLocal.dependencies || {})) {
    return { habilitada: true, precisaInstalador: true, versao: pkgRemoto.version };
  }

  const mudados = Object.keys(remoto).filter((p) => remoto[p] !== manifesto.arquivos[p]);
  const removidos = Object.keys(manifesto.arquivos).filter((p) => !(p in remoto));
  if (!mudados.length && !removidos.length) {
    fs.writeFileSync(path.join(root, '.manifesto.json'), JSON.stringify({ commit, arquivos: remoto }));
    return { habilitada: true, atualizado: true };
  }

  // Baixa tudo para uma pasta temporária antes de trocar qualquer arquivo:
  // se a internet cair no meio, o código instalado continua intacto.
  const tmp = path.join(root, '.atualizacao-tmp');
  fs.rmSync(tmp, { recursive: true, force: true });
  let n = 0;
  for (const p of mudados) {
    n += 1;
    aoProgresso(`Baixando atualização (${n}/${mudados.length})…`);
    caminhoSeguro(root, p);
    const destino = path.join(tmp, p);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, await gh.getBlob(remoto[p]));
  }
  for (const p of mudados) {
    const destino = caminhoSeguro(root, p);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.copyFileSync(path.join(tmp, p), destino);
  }
  for (const p of removidos) fs.rmSync(caminhoSeguro(root, p), { force: true });
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.writeFileSync(path.join(root, '.manifesto.json'), JSON.stringify({ commit, arquivos: remoto }));

  return { habilitada: true, aplicada: true, versao: pkgRemoto.version, arquivos: mudados.length + removidos.length };
}

module.exports = { atualizar, habilitada, IGNORAR };
