// Autenticação obrigatória via HTTP Basic Auth.
// Credenciais armazenadas em data/auth.json com hash bcrypt.
// Se o arquivo não existir, é criado com defaults: handmade / @Hand55
//
// Para resetar a senha: apague data/auth.json e reinicie o servidor.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { ROOT } = require('./dados');

const AUTH_FILE = path.join(ROOT, 'data', 'auth.json');
const SALT_ROUNDS = 10;
const USUARIO_PADRAO = 'handmade';
const SENHA_PADRAO = '@Hand55';

// Token interno gerado no startup. O Puppeteer envia esse token no header
// 'x-render-token' em todas as requisições durante a geração de PDF, para
// poder acessar /render/, /uploads/, /assets/ etc. sem precisar autenticar.
// Como é gerado a cada start e nunca exposto a clientes externos, ninguém
// de fora consegue usar.
const RENDER_TOKEN = crypto.randomBytes(24).toString('hex');

function carregar() {
  if (!fs.existsSync(AUTH_FILE)) {
    const passHash = bcrypt.hashSync(SENHA_PADRAO, SALT_ROUNDS);
    const dados = { usuario: USUARIO_PADRAO, passHash };
    fs.writeFileSync(AUTH_FILE, JSON.stringify(dados, null, 2));
    console.log(`[auth] data/auth.json criado com credenciais padrão (${USUARIO_PADRAO} / ${SENHA_PADRAO}). Recomendado trocar a senha pelo admin.`);
    return dados;
  }
  return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
}

let cache = carregar();

function recarregar() {
  cache = carregar();
}

function verificar(usuario, senha) {
  if (!usuario || !senha) return false;
  if (usuario !== cache.usuario) return false;
  return bcrypt.compareSync(senha, cache.passHash);
}

function trocarSenha(senhaAtual, senhaNova) {
  if (!verificar(cache.usuario, senhaAtual)) {
    return { ok: false, erro: 'senha atual incorreta' };
  }
  if (!senhaNova || senhaNova.length < 6) {
    return { ok: false, erro: 'senha nova deve ter ao menos 6 caracteres' };
  }
  const passHash = bcrypt.hashSync(senhaNova, SALT_ROUNDS);
  cache = { ...cache, passHash };
  fs.writeFileSync(AUTH_FILE, JSON.stringify(cache, null, 2));
  return { ok: true };
}

// Middleware Express. Bloqueia tudo exceto /render/* chamado pelo próprio
// Puppeteer em localhost (caso contrário, a geração de PDF não conseguiria
// renderizar o catálogo a partir do próprio servidor).
function middleware() {
  return (req, res, next) => {
    // Token interno: libera quando vem do próprio Puppeteer durante PDF
    if (req.headers['x-render-token'] === RENDER_TOKEN) return next();
    const header = req.headers.authorization || '';
    const [tipo, credenciais] = header.split(' ');
    if (tipo === 'Basic' && credenciais) {
      const [user, pass] = Buffer.from(credenciais, 'base64').toString().split(':');
      if (verificar(user, pass)) return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="Catálogo Handmade"');
    res.status(401).send('Autenticação necessária');
  };
}

module.exports = {
  middleware,
  trocarSenha,
  recarregar,
  getUsuario: () => cache.usuario,
  RENDER_TOKEN,
};
