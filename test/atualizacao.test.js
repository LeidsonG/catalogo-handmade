// Testa a atualização do código do app empacotado a partir da main.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { githubFalso } = require('./github-falso');
const { atualizar } = require('../lib/atualizacao');

async function publicar(gh, arquivos) {
  const entradas = [];
  for (const [p, c] of Object.entries(arquivos)) entradas.push({ path: p, sha: await gh.createBlob(Buffer.from(c)) });
  const tree = await gh.createTree(null, entradas);
  const commit = await gh.createCommit('x', tree, gh.refs.get('main') ? [gh.refs.get('main')] : []);
  gh.refs.set('main', commit);
  return { commit, mapa: Object.fromEntries(entradas.map((e) => [e.path, e.sha])) };
}

test('atualiza só os arquivos de código que mudaram e apaga os removidos', async () => {
  process.env.CATALOGO_EMPACOTADO = '1';
  const gh = githubFalso();
  const pkg = JSON.stringify({ version: '1.0.0', dependencies: { express: '^4' } });
  const v1 = await publicar(gh, { 'package.json': pkg, 'server.js': 'v1', 'lib/velho.js': 'x', 'data/produtos.json': '{}' });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atualiza-'));
  fs.writeFileSync(path.join(root, 'package.json'), pkg);
  fs.writeFileSync(path.join(root, 'server.js'), 'v1');
  fs.mkdirSync(path.join(root, 'lib'));
  fs.writeFileSync(path.join(root, 'lib', 'velho.js'), 'x');
  const { 'data/produtos.json': _, ...semDados } = v1.mapa;
  fs.writeFileSync(path.join(root, '.manifesto.json'), JSON.stringify({ commit: v1.commit, arquivos: semDados }));

  assert.deepEqual(await atualizar({ root, gh }), { habilitada: true, atualizado: true });

  const pkg2 = JSON.stringify({ version: '1.0.1', dependencies: { express: '^4' } });
  await publicar(gh, { 'package.json': pkg2, 'server.js': 'v2', 'admin/novo.js': 'n', 'data/produtos.json': '{"x":1}' });
  const r = await atualizar({ root, gh });
  assert.equal(r.aplicada, true);
  assert.equal(r.versao, '1.0.1');
  assert.equal(fs.readFileSync(path.join(root, 'server.js'), 'utf8'), 'v2');
  assert.equal(fs.readFileSync(path.join(root, 'admin', 'novo.js'), 'utf8'), 'n');
  assert.equal(fs.existsSync(path.join(root, 'lib', 'velho.js')), false);
  assert.equal(fs.existsSync(path.join(root, 'data')), false, 'nunca mexe em data/');

  await publicar(gh, { 'package.json': JSON.stringify({ version: '2.0.0', dependencies: { express: '^5' } }), 'server.js': 'v3' });
  const r3 = await atualizar({ root, gh });
  assert.equal(r3.precisaInstalador, true);
  assert.equal(fs.readFileSync(path.join(root, 'server.js'), 'utf8'), 'v2', 'não aplica se as dependências mudaram');
});
