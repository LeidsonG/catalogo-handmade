const express = require('express');
const path = require('path');
const fs = require('fs');

const { ROOT } = require('./lib/dados');
const auth = require('./lib/auth');
const produtosRouter = require('./routes/produtos');
const categoriasRouter = require('./routes/categorias');
const introRouter = require('./routes/intro');
const uploadsRouter = require('./routes/uploads');
const authRouter = require('./routes/auth');
const criarPdfRouter = require('./routes/pdf');

const UPLOADS = path.join(ROOT, 'uploads');
const OUTPUT_DIR = path.join(ROOT, 'output');
const PORTA = Number(process.env.PORT) || 3000;

for (const dir of [path.join(UPLOADS, 'produtos'), path.join(UPLOADS, 'cores'), OUTPUT_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

const app = express();
app.use(express.json());

// Autenticação obrigatória via HTTP Basic Auth.
// Credenciais em data/auth.json (criadas no startup se não existirem,
// com defaults handmade / @Hand55). Senha pode ser trocada via
// POST /api/auth/trocar-senha.
app.use(auth.middleware());

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
app.use('/api/auth', authRouter);
app.use(criarPdfRouter(PORTA)); // expõe /render/:layout e /api/gerar-pdf

app.listen(PORTA, () => {
  console.log(`Servidor: http://localhost:${PORTA}/admin`);
});
