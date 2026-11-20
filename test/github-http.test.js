// Testa lib/github.js (o cliente HTTP de verdade) contra um servidor local que
// imita os endpoints da API do GitHub usados pela sincronização.

const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { githubFalso } = require('./github-falso');

function servidorFalso(gh) {
  return http.createServer(async (req, res) => {
    let corpo = '';
    for await (const c of req) corpo += c;
    const json = corpo ? JSON.parse(corpo) : null;
    const u = new URL(req.url, 'http://x');
    const p = u.pathname.replace('/repos/dono/repo', '');
    const enviar = (status, obj) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
    assert.equal(req.headers.authorization, 'Bearer tok');
    let m;
    if (req.method === 'GET' && u.pathname === '/user') return enviar(200, { login: 'fulano' });
    if (req.method === 'GET' && p === '') return enviar(200, { permissions: { push: true } });
    if (req.method === 'GET' && (m = p.match(/^\/git\/ref\/heads\/(.+)$/))) {
      const sha = await gh.getRef(m[1]);
      return sha ? enviar(200, { object: { sha } }) : enviar(404, { message: 'Not Found' });
    }
    if (req.method === 'GET' && (m = p.match(/^\/git\/commits\/(\w+)$/))) {
      return enviar(200, { tree: { sha: (await gh.getCommit(m[1])).treeSha } });
    }
    if (req.method === 'GET' && (m = p.match(/^\/git\/trees\/(\w+)$/))) {
      const t = await gh.getTree(m[1]);
      return enviar(200, { truncated: false, tree: [{ path: 'uploads', type: 'tree', sha: 'x' }, ...t.map((e) => ({ ...e, type: 'blob', mode: '100644' }))] });
    }
    if (req.method === 'GET' && (m = p.match(/^\/git\/blobs\/(\w+)$/))) {
      const b = await gh.getBlob(m[1]);
      return enviar(200, { encoding: 'base64', content: b.toString('base64').replace(/(.{60})/g, '$1\n') });
    }
    if (req.method === 'POST' && p === '/git/blobs') return enviar(201, { sha: await gh.createBlob(Buffer.from(json.content, 'base64')) });
    if (req.method === 'POST' && p === '/git/trees') return enviar(201, { sha: await gh.createTree(json.base_tree, json.tree) });
    if (req.method === 'POST' && p === '/git/commits') return enviar(201, { sha: await gh.createCommit(json.message, json.tree, json.parents) });
    if (req.method === 'POST' && p === '/git/refs') { await gh.createRef(json.ref.replace('refs/heads/', ''), json.sha); return enviar(201, {}); }
    if (req.method === 'PATCH' && (m = p.match(/^\/git\/refs\/heads\/(.+)$/))) {
      try { await gh.updateRef(m[1], json.sha); return enviar(200, {}); } catch { return enviar(422, { message: 'Update is not a fast forward' }); }
    }
    enviar(500, { message: `rota não simulada: ${req.method} ${p}` });
  });
}

test('cliente HTTP sincroniza duas máquinas via API', async () => {
  const gh = githubFalso();
  const srv = servidorFalso(gh);
  await new Promise((r) => srv.listen(0, r));
  process.env.CATALOGO_GITHUB_API = `http://127.0.0.1:${srv.address().port}`;
  delete require.cache[require.resolve('../lib/github')];
  const { criarCliente } = require('../lib/github');
  const { sincronizar } = require('../lib/sync');
  try {
    const cliente = criarCliente({ token: 'tok', repositorio: 'dono/repo' });
    assert.deepEqual(await cliente.verificar(), { login: 'fulano', podeEscrever: true });
    const a = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-a-'));
    const b = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-b-'));
    fs.mkdirSync(path.join(a, 'data'));
    fs.mkdirSync(path.join(a, 'uploads', 'background'), { recursive: true });
    fs.writeFileSync(path.join(a, 'data', 'produtos.json'), JSON.stringify({ produtos: [{ id: 'p00001', codigo: 'CM-001' }] }));
    const binario = Buffer.from([0, 255, 10, 13, 137, 80, 78, 71]);
    fs.writeFileSync(path.join(a, 'uploads', 'background', 'Fundo marrom.png'), binario);
    assert.equal((await sincronizar({ dir: a, gh: cliente, branch: 'dados' })).status, 'ok');
    assert.equal((await sincronizar({ dir: b, gh: cliente, branch: 'dados' })).status, 'ok');
    assert.ok(fs.readFileSync(path.join(b, 'uploads', 'background', 'Fundo marrom.png')).equals(binario));
    assert.equal(JSON.parse(fs.readFileSync(path.join(b, 'data', 'produtos.json'))).produtos[0].codigo, 'CM-001');
  } finally {
    srv.close();
  }
});
