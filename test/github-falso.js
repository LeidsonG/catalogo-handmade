// GitHub falso em memória com a mesma interface de lib/github.js (refs,
// commits, trees, blobs). Usado direto pelos testes de sync e, via HTTP, pelo
// teste do cliente.

const crypto = require('crypto');
const { shaBlob } = require('../lib/github');

function githubFalso() {
  const blobs = new Map();
  const trees = new Map(); // sha -> { path: blobSha }
  const commits = new Map(); // sha -> { tree, parents }
  const refs = new Map();
  const hash = (o) => crypto.createHash('sha1').update(JSON.stringify(o)).digest('hex');
  let interceptarUpdate = null;
  return {
    blobs, refs, commits, trees,
    aoAtualizarRef(fn) { interceptarUpdate = fn; },
    async getRef(b) { return refs.get(b) || null; },
    async getCommit(sha) { return { treeSha: commits.get(sha).tree }; },
    async getTree(sha) { return Object.entries(trees.get(sha)).map(([p, s]) => ({ path: p, sha: s })); },
    async getBlob(sha) { return blobs.get(sha); },
    async createBlob(buf) { const s = shaBlob(buf); blobs.set(s, Buffer.from(buf)); return s; },
    async createTree(base, entradas) {
      const t = base ? { ...trees.get(base) } : {};
      for (const e of entradas) { if (e.sha === null) delete t[e.path]; else t[e.path] = e.sha; }
      const s = hash(t); trees.set(s, t); return s;
    },
    async createCommit(msg, tree, parents) {
      const s = hash({ msg, tree, parents, r: Math.random() }); commits.set(s, { tree, parents, msg }); return s;
    },
    async updateRef(b, sha) {
      if (interceptarUpdate) { const fn = interceptarUpdate; interceptarUpdate = null; await fn(); }
      const atual = refs.get(b);
      let c = sha; let ok = false;
      while (c) { if (c === atual) { ok = true; break; } c = commits.get(c)?.parents[0]; }
      if (!ok) { const e = new Error('nff'); e.codigo = 'NAO_FAST_FORWARD'; throw e; }
      refs.set(b, sha);
    },
    async createRef(b, sha) { refs.set(b, sha); },
    arquivoRemoto(p) { const t = trees.get(commits.get(refs.get('dados')).tree); return t[p] ? blobs.get(t[p]) : null; },
  };
}

module.exports = { githubFalso };
