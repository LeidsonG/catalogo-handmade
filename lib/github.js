// Cliente mínimo da API do GitHub (Git Data API) usado pela sincronização e
// pela atualização do código. Fala direto com api.github.com via fetch, então
// a máquina não precisa ter o Git instalado.
//
// Só usa endpoints de baixo nível (refs, commits, trees, blobs): é o que
// permite enviar várias fotos + JSONs num único commit atômico.

const crypto = require('crypto');

const API = process.env.CATALOGO_GITHUB_API || 'https://api.github.com';

// SHA de blob do Git: sha1("blob <tamanho>\0<conteúdo>"). É o mesmo valor que
// aparece nas trees do GitHub, então dá para comparar arquivos locais com os
// remotos sem baixar nada.
function shaBlob(buf) {
  return crypto.createHash('sha1')
    .update(`blob ${buf.length}\0`)
    .update(buf)
    .digest('hex');
}

class ErroGithub extends Error {
  constructor(msg, status, codigo) {
    super(msg);
    this.status = status;
    this.codigo = codigo;
  }
}

function criarCliente({ token, repositorio }) {
  const base = `${API}/repos/${repositorio}`;

  async function req(metodo, caminho, corpo, { url } = {}) {
    let resp;
    try {
      resp = await fetch(url || `${base}${caminho}`, {
        method: metodo,
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'catalogo-handmade',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(corpo ? { 'Content-Type': 'application/json' } : {}),
        },
        body: corpo ? JSON.stringify(corpo) : undefined,
      });
    } catch (err) {
      throw new ErroGithub('Sem conexão com o GitHub. Verifique a internet.', 0, 'SEM_REDE');
    }
    if (resp.status === 404 && metodo === 'GET') return null;
    if (!resp.ok) {
      const texto = await resp.text().catch(() => '');
      let codigo = 'ERRO';
      if (resp.status === 401) codigo = 'TOKEN_INVALIDO';
      else if (resp.status === 403 || resp.status === 404) codigo = 'SEM_PERMISSAO';
      else if (resp.status === 422) codigo = 'NAO_FAST_FORWARD';
      throw new ErroGithub(`GitHub respondeu ${resp.status}: ${texto.slice(0, 300)}`, resp.status, codigo);
    }
    return resp.json();
  }

  return {
    async getRef(branch) {
      const r = await req('GET', `/git/ref/heads/${branch}`);
      return r ? r.object.sha : null;
    },
    async getCommit(sha) {
      const c = await req('GET', `/git/commits/${sha}`);
      return { treeSha: c.tree.sha };
    },
    // Lista todos os arquivos da tree (recursiva).
    async getTree(sha) {
      const t = await req('GET', `/git/trees/${sha}?recursive=1`);
      if (t.truncated) throw new ErroGithub('Repositório grande demais para listar.', 0, 'TRUNCADO');
      return t.tree.filter((e) => e.type === 'blob').map((e) => ({ path: e.path, sha: e.sha }));
    },
    async getBlob(sha) {
      const b = await req('GET', `/git/blobs/${sha}`);
      return Buffer.from(b.content, b.encoding === 'base64' ? 'base64' : 'utf8');
    },
    async createBlob(buf) {
      const r = await req('POST', '/git/blobs', { content: buf.toString('base64'), encoding: 'base64' });
      return r.sha;
    },
    // entradas: [{ path, sha }] — sha null remove o arquivo (exige baseTree).
    async createTree(baseTree, entradas) {
      const r = await req('POST', '/git/trees', {
        ...(baseTree ? { base_tree: baseTree } : {}),
        tree: entradas.map((e) => ({ path: e.path, mode: '100644', type: 'blob', sha: e.sha })),
      });
      return r.sha;
    },
    // Sem `author`: o GitHub usa a conta dona do token como autor.
    async createCommit(mensagem, treeSha, parents) {
      const r = await req('POST', '/git/commits', { message: mensagem, tree: treeSha, parents });
      return r.sha;
    },
    async updateRef(branch, sha) {
      await req('PATCH', `/git/refs/heads/${branch}`, { sha, force: false });
    },
    async createRef(branch, sha) {
      await req('POST', '/git/refs', { ref: `refs/heads/${branch}`, sha });
    },
    // Confere o token: devolve o login da conta e se ela pode escrever no repo.
    async verificar() {
      const repo = await req('GET', '');
      if (!repo) throw new ErroGithub('Repositório não encontrado (ou o token não tem acesso a ele).', 404, 'SEM_PERMISSAO');
      const usuario = token ? await req('GET', '', null, { url: `${API}/user` }) : null;
      return { login: usuario?.login || '', podeEscrever: !!repo.permissions?.push };
    },
  };
}

module.exports = { criarCliente, shaBlob, ErroGithub };
