const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const puppeteer = require('puppeteer');

const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, 'data', 'produtos.json');
const INTRO_FILE = path.join(ROOT, 'data', 'intro.json');
const CATEGORIAS_FILE = path.join(ROOT, 'data', 'categorias.json');
const UPLOADS = path.join(ROOT, 'uploads');
const OUTPUT_DIR = path.join(ROOT, 'output');
const PORTA = Number(process.env.PORT) || 3000;

for (const dir of [path.join(UPLOADS, 'produtos'), path.join(UPLOADS, 'cores'), OUTPUT_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

const app = express();
app.use(express.json());
app.use('/admin', express.static(path.join(ROOT, 'admin')));
app.use('/uploads', express.static(UPLOADS));
app.use('/templates', express.static(path.join(ROOT, 'templates')));
app.use('/assets', express.static(path.join(ROOT, 'assets')));

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const kind = req.params.tipo === 'cor' ? 'cores' : 'produtos';
    cb(null, path.join(UPLOADS, kind));
  },
  filename: (req, file, cb) => {
    const codigo = sanitizarCodigo(req.query.codigo);
    const ext = path.extname(file.originalname).toLowerCase();
    if (!codigo) {
      // Fallback: hash aleatório se não veio código (não deveria acontecer pelo admin)
      return cb(null, `${crypto.randomBytes(6).toString('hex')}${ext}`);
    }
    const sufixo = req.params.tipo === 'cor' ? '-cor' : '';
    cb(null, `${codigo}${sufixo}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 15 * 1024 * 1024 } });

function readData() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}
function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}
function readIntro() {
  return JSON.parse(fs.readFileSync(INTRO_FILE, 'utf8'));
}
function writeIntro(intro) {
  fs.writeFileSync(INTRO_FILE, JSON.stringify(intro, null, 2));
}
function readCategorias() {
  if (!fs.existsSync(CATEGORIAS_FILE)) return { categorias: [] };
  return JSON.parse(fs.readFileSync(CATEGORIAS_FILE, 'utf8'));
}
function writeCategorias(data) {
  fs.writeFileSync(CATEGORIAS_FILE, JSON.stringify(data, null, 2));
}

function gerarProximoId(itens, prefixo, tamanho) {
  const padrao = new RegExp(`^${prefixo}(\\d+)$`);
  const max = itens.reduce((acc, item) => {
    const m = String(item.id || '').match(padrao);
    return m ? Math.max(acc, Number(m[1])) : acc;
  }, 0);
  return `${prefixo}${String(max + 1).padStart(tamanho, '0')}`;
}

function sanitizarCodigo(codigo) {
  return String(codigo || '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function normalizarPrefixo(p) {
  if (!p) return '';
  // mantém só letras e números, descarta espaços/traços/etc., padroniza maiúsculas
  const limpo = String(p).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (!limpo) return '';
  return `${limpo}-`;
}

app.get('/', (_req, res) => res.redirect('/admin'));

app.get('/api/produtos', (_req, res) => {
  res.json(readData().produtos);
});

app.post('/api/produtos', (req, res) => {
  const data = readData();
  const cats = readCategorias().categorias;
  const categoriaId = req.body.categoriaId || '';
  if (!categoriaId || !cats.find((c) => c.id === categoriaId)) {
    return res.status(400).json({ erro: 'categoria obrigatória e deve existir' });
  }
  const novo = {
    id: gerarProximoId(data.produtos, 'p', 5),
    codigo: req.body.codigo || '',
    nome: req.body.nome || '',
    descricao: req.body.descricao || '',
    preco: Number(req.body.preco) || 0,
    nomeCor: req.body.nomeCor || '',
    foto: req.body.foto || '',
    corTextura: req.body.corTextura || '',
    categoriaId,
    ordem: data.produtos.length,
  };
  data.produtos.push(novo);
  writeData(data);
  res.json(novo);
});

app.put('/api/produtos/:id', (req, res) => {
  const data = readData();
  const idx = data.produtos.findIndex((p) => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ erro: 'não encontrado' });
  if (req.body.categoriaId !== undefined) {
    const cats = readCategorias().categorias;
    if (!req.body.categoriaId || !cats.find((c) => c.id === req.body.categoriaId)) {
      return res.status(400).json({ erro: 'categoria obrigatória e deve existir' });
    }
  }
  data.produtos[idx] = { ...data.produtos[idx], ...req.body, id: req.params.id };
  data.produtos[idx].preco = Number(data.produtos[idx].preco) || 0;
  writeData(data);
  res.json(data.produtos[idx]);
});

app.delete('/api/produtos/:id', (req, res) => {
  const data = readData();
  data.produtos = data.produtos.filter((p) => p.id !== req.params.id);
  writeData(data);
  res.json({ ok: true });
});

app.post('/api/produtos/reordenar', (req, res) => {
  const { ordemIds } = req.body;
  if (!Array.isArray(ordemIds)) return res.status(400).json({ erro: 'ordemIds obrigatório' });
  const data = readData();
  const mapa = new Map(data.produtos.map((p) => [p.id, p]));
  data.produtos = ordemIds.map((id, i) => {
    const p = mapa.get(id);
    if (p) p.ordem = i;
    return p;
  }).filter(Boolean);
  writeData(data);
  res.json({ ok: true });
});

app.get('/api/categorias', (_req, res) => {
  const lista = readCategorias().categorias;
  lista.sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
  res.json(lista);
});

app.post('/api/categorias', (req, res) => {
  const nome = String(req.body.nome || '').trim();
  if (!nome) return res.status(400).json({ erro: 'nome obrigatório' });
  const data = readCategorias();
  if (data.categorias.find((c) => c.nome.toLowerCase() === nome.toLowerCase())) {
    return res.status(400).json({ erro: 'já existe uma categoria com esse nome' });
  }
  const nova = {
    id: gerarProximoId(data.categorias, 'c', 3),
    nome,
    prefixoCodigo: normalizarPrefixo(req.body.prefixoCodigo),
    ordem: data.categorias.length,
  };
  data.categorias.push(nova);
  writeCategorias(data);
  res.json(nova);
});

app.put('/api/categorias/:id', (req, res) => {
  const data = readCategorias();
  const idx = data.categorias.findIndex((c) => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ erro: 'não encontrado' });
  const nome = String(req.body.nome || '').trim();
  if (!nome) return res.status(400).json({ erro: 'nome obrigatório' });
  const conflito = data.categorias.find(
    (c) => c.id !== req.params.id && c.nome.toLowerCase() === nome.toLowerCase(),
  );
  if (conflito) return res.status(400).json({ erro: 'já existe uma categoria com esse nome' });
  data.categorias[idx].nome = nome;
  if (req.body.prefixoCodigo !== undefined) {
    data.categorias[idx].prefixoCodigo = normalizarPrefixo(req.body.prefixoCodigo);
  }
  writeCategorias(data);
  res.json(data.categorias[idx]);
});

app.get('/api/categorias/:id/proximo-codigo', (req, res) => {
  const categoria = readCategorias().categorias.find((c) => c.id === req.params.id);
  if (!categoria) return res.status(404).json({ erro: 'categoria não encontrada' });
  const prefixo = categoria.prefixoCodigo || '';
  if (!prefixo) return res.json({ codigo: '', motivo: 'categoria sem prefixo definido' });
  const produtos = readData().produtos;
  const codigo = proximoCodigoCategoria(produtos, categoria.id, prefixo);
  res.json({ codigo });
});

function proximoCodigoCategoria(produtos, categoriaId, prefixo) {
  const numeros = [];
  let tamanhoMin = 3;
  for (const p of produtos) {
    if (p.categoriaId !== categoriaId) continue;
    if (!p.codigo || !p.codigo.startsWith(prefixo)) continue;
    const parte = p.codigo.slice(prefixo.length);
    if (/^\d+$/.test(parte)) {
      numeros.push(Number(parte));
      tamanhoMin = Math.max(tamanhoMin, parte.length);
    }
  }
  const proximo = (numeros.length ? Math.max(...numeros) : 0) + 1;
  return `${prefixo}${String(proximo).padStart(tamanhoMin, '0')}`;
}

app.post('/api/categorias/reordenar', (req, res) => {
  const { ordemIds } = req.body;
  if (!Array.isArray(ordemIds)) return res.status(400).json({ erro: 'ordemIds obrigatório' });
  const data = readCategorias();
  const mapa = new Map(data.categorias.map((c) => [c.id, c]));
  data.categorias = ordemIds.map((id, i) => {
    const c = mapa.get(id);
    if (c) c.ordem = i;
    return c;
  }).filter(Boolean);
  writeCategorias(data);
  res.json({ ok: true });
});

app.delete('/api/categorias/:id', (req, res) => {
  const produtos = readData().produtos;
  const emUso = produtos.filter((p) => p.categoriaId === req.params.id);
  if (emUso.length > 0) {
    return res.status(400).json({
      erro: `categoria em uso por ${emUso.length} produto(s) — remova ou troque a categoria deles antes`,
    });
  }
  const data = readCategorias();
  data.categorias = data.categorias.filter((c) => c.id !== req.params.id);
  writeCategorias(data);
  res.json({ ok: true });
});

app.post('/api/upload/:tipo', upload.single('arquivo'), (req, res) => {
  if (!req.file) return res.status(400).json({ erro: 'arquivo obrigatório' });
  const kind = req.params.tipo === 'cor' ? 'cores' : 'produtos';
  res.json({ caminho: `/uploads/${kind}/${req.file.filename}` });
});

app.get('/api/intro', (_req, res) => res.json(readIntro()));
app.put('/api/intro', (req, res) => {
  const atual = readIntro();
  const novo = { ...atual, ...req.body };
  writeIntro(novo);
  res.json(novo);
});

app.get('/render/:layout', (req, res) => {
  const layout = req.params.layout;
  if (!['1', '2'].includes(layout)) return res.status(400).send('layout inválido');
  const categoriaId = String(req.query.categoria || '');
  if (!categoriaId) return res.status(400).send('parâmetro categoria obrigatório');
  const cats = readCategorias().categorias;
  const categoria = cats.find((c) => c.id === categoriaId);
  if (!categoria) return res.status(404).send('categoria não encontrada');
  const produtos = readData().produtos.filter((p) => p.categoriaId === categoriaId);
  const html = construirHtml({
    produtos,
    intro: readIntro(),
    layout,
    categoria,
  });
  res.set('Content-Type', 'text/html; charset=utf-8').send(html);
});

app.post('/api/gerar-pdf', async (req, res) => {
  const layout = String(req.body.layout || '2');
  if (!['1', '2'].includes(layout)) return res.status(400).json({ erro: 'layout inválido' });
  const categoriaId = String(req.body.categoriaId || '');
  if (!categoriaId) return res.status(400).json({ erro: 'categoriaId obrigatório' });
  const categoria = readCategorias().categorias.find((c) => c.id === categoriaId);
  if (!categoria) return res.status(404).json({ erro: 'categoria não encontrada' });

  const browser = await puppeteer.launch({ headless: 'new' });
  try {
    const page = await browser.newPage();
    // Carregamos via rota HTTP (em vez de setContent) para que caminhos absolutos
    // como /uploads/... e /assets/... resolvam para o próprio servidor.
    await page.goto(
      `http://localhost:${PORTA}/render/${layout}?categoria=${encodeURIComponent(categoriaId)}`,
      { waitUntil: 'networkidle0' },
    );
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const slug = categoria.nome.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const nome = `catalogo-${slug}-layout${layout}-${stamp}.pdf`;
    const caminho = path.join(OUTPUT_DIR, nome);
    await page.pdf({
      path: caminho,
      format: 'A4',
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    res.json({ ok: true, arquivo: nome, caminho: `/output/${nome}` });
  } finally {
    await browser.close();
  }
});

app.use('/output', express.static(OUTPUT_DIR));

function encontrarLogo() {
  const pasta = path.join(ROOT, 'assets');
  if (!fs.existsSync(pasta)) return '';
  const exts = new Set(['.svg', '.png', '.jpg', '.jpeg', '.webp']);
  const arquivos = fs.readdirSync(pasta)
    .filter((f) => exts.has(path.extname(f).toLowerCase()));
  if (!arquivos.length) return '';
  // Prioriza arquivos chamados "logo.*", senão usa o primeiro arquivo de imagem encontrado.
  const preferido = arquivos.find((f) => /^logo\./i.test(f)) || arquivos[0];
  return `/assets/${preferido}`;
}

function construirHtml({ produtos, intro, layout, categoria }) {
  const css = fs.readFileSync(path.join(ROOT, 'templates', 'pdf.css'), 'utf8');
  const templateIntro = fs.readFileSync(path.join(ROOT, 'templates', 'intro.html'), 'utf8');
  const templateProduto = fs.readFileSync(
    path.join(ROOT, 'templates', layout === '1' ? 'layout-1.html' : 'layout-2.html'),
    'utf8',
  );

  const logo = encontrarLogo();
  const logoIntroHtml = logo
    ? `<img class="intro-logo" src="${escapar(logo)}" alt="">`
    : '';
  const logoCantoHtml = logo
    ? `<img class="logo-canto" src="${escapar(logo)}" alt="">`
    : '';

  // Substituir {{logo}} ANTES de aplicar() — caso contrário, aplicar() trata
  // {{logo}} como variável ausente e remove o placeholder.
  const templateIntroComLogo = templateIntro.replace('{{logo}}', logoIntroHtml);
  const templateProdutoComLogo = templateProduto.replace(/\{\{logo\}\}/g, logoCantoHtml);

  const introRender = aplicar(templateIntroComLogo, {
    marca: intro.marca,
    subtitulo: intro.subtitulo,
    texto: intro.texto,
    ano: intro.ano,
    instagram: intro.contato?.instagram || '',
    whatsapp: intro.contato?.whatsapp || '',
    categoria: categoria?.nome || '',
  });

  const ordenados = [...produtos].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));

  let paginas = '';
  if (layout === '1') {
    for (const p of ordenados) {
      paginas += renderProduto(templateProdutoComLogo, p);
    }
  } else {
    for (let i = 0; i < ordenados.length; i += 2) {
      const par = ordenados.slice(i, i + 2);
      const bloco1 = renderBloco(par[0]);
      const bloco2 = par[1] ? renderBloco(par[1]) : '<div class="produto-bloco vazio"></div>';
      paginas += templateProdutoComLogo
        .replace('{{bloco1}}', bloco1)
        .replace('{{bloco2}}', bloco2);
    }
  }

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Catálogo ${escapar(intro.marca)}</title>
<style>${css}</style>
</head>
<body>
${introRender}
${paginas}
</body>
</html>`;
}

function renderProduto(template, p) {
  return aplicar(template, {
    codigo: p.codigo,
    nome: p.nome,
    descricao: p.descricao,
    preco: formatarPreco(p.preco),
    nomeCor: p.nomeCor,
    foto: p.foto,
    corTextura: p.corTextura,
  });
}

function renderBloco(p) {
  if (!p) return '';
  return `
    <div class="produto-bloco">
      <div class="produto-foto-wrap">
        ${p.foto ? `<img class="produto-foto" src="${escapar(p.foto)}" alt="${escapar(p.nome)}">` : '<div class="produto-foto-placeholder">sem foto</div>'}
      </div>
      <div class="produto-info">
        <div class="produto-codigo">${escapar(p.codigo)}</div>
        <div class="produto-nome">${escapar(p.nome)}</div>
        <div class="produto-descricao">${escapar(p.descricao)}</div>
        <div class="produto-rodape">
          <div class="produto-cor">
            <span class="produto-cor-amostra" style="${p.corTextura ? `background-image:url('${escapar(p.corTextura)}')` : 'background:#3b2416'}"></span>
            <span class="produto-cor-nome">${escapar(p.nomeCor)}</span>
          </div>
          <div class="produto-preco">${formatarPreco(p.preco)}</div>
        </div>
      </div>
    </div>
  `;
}

function aplicar(tpl, vars) {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => escapar(vars[k] ?? ''));
}

function escapar(s) {
  if (s === null || s === undefined) return '';
  if (typeof s !== 'string') return String(s);
  // Para src/href com URLs locais geradas pelo próprio sistema mantemos o conteúdo,
  // apenas escapamos caracteres HTML que poderiam quebrar o markup.
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatarPreco(v) {
  const n = Number(v) || 0;
  return n.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  });
}

app.listen(PORTA, () => {
  console.log(`Servidor: http://localhost:${PORTA}/admin`);
});
