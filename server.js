const express = require('express');
const path = require('path');
const fs = require('fs');

const { ROOT } = require('./lib/dados');
const produtosRouter = require('./routes/produtos');
const categoriasRouter = require('./routes/categorias');
const introRouter = require('./routes/intro');
const uploadsRouter = require('./routes/uploads');
const criarPdfRouter = require('./routes/pdf');

const UPLOADS = path.join(ROOT, 'uploads');
const OUTPUT_DIR = path.join(ROOT, 'output');
const PORTA = Number(process.env.PORT) || 3000;

for (const dir of [path.join(UPLOADS, 'produtos'), path.join(UPLOADS, 'cores'), OUTPUT_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

const app = express();
app.use(express.json());

// Autenticação opcional (HTTP Basic). Ativa apenas se ADMIN_PASS estiver
// definida no ambiente. Sem essa variável, servidor fica aberto (uso local).
// Exceções: o próprio Puppeteer chama /render/... internamente em localhost
// — esse caso é deixado passar para não complicar a geração de PDF.
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS;
if (ADMIN_PASS) {
  app.use((req, res, next) => {
    const isLocalRender = req.path.startsWith('/render/')
      && (req.ip === '::1' || req.ip === '127.0.0.1' || req.ip === '::ffff:127.0.0.1');
    if (isLocalRender) return next();
    const header = req.headers.authorization || '';
    const [tipo, credenciais] = header.split(' ');
    if (tipo === 'Basic' && credenciais) {
      const [user, pass] = Buffer.from(credenciais, 'base64').toString().split(':');
      if (user === ADMIN_USER && pass === ADMIN_PASS) return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="Catálogo Handmade"');
    res.status(401).send('Autenticação necessária');
  });
}

app.use('/admin', express.static(path.join(ROOT, 'admin')));
app.use('/uploads', express.static(UPLOADS));
app.use('/templates', express.static(path.join(ROOT, 'templates')));
app.use('/assets', express.static(path.join(ROOT, 'assets')));
app.use('/output', express.static(OUTPUT_DIR));

app.get('/', (_req, res) => res.redirect('/admin'));

app.use('/api/produtos', produtosRouter);
app.use('/api/categorias', categoriasRouter);
app.use('/api/intro', introRouter);
app.use('/api/upload', uploadsRouter);
app.use(criarPdfRouter(PORTA)); // expõe /render/:layout e /api/gerar-pdf

app.listen(PORTA, () => {
  console.log(`Servidor: http://localhost:${PORTA}/admin`);
});
