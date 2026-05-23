// Geração do HTML que vira PDF (intro + páginas de produto).
// Lê templates em templates/ e o logo em assets/.

const fs = require('fs');
const path = require('path');
const { ROOT } = require('./dados');

function encontrarLogo() {
  const pasta = path.join(ROOT, 'assets');
  if (!fs.existsSync(pasta)) return '';
  const exts = new Set(['.svg', '.png', '.jpg', '.jpeg', '.webp']);
  const arquivos = fs.readdirSync(pasta)
    .filter((f) => exts.has(path.extname(f).toLowerCase()));
  if (!arquivos.length) return '';
  const preferido = arquivos.find((f) => /^logo\./i.test(f)) || arquivos[0];
  return `/assets/${preferido}`;
}

function escapar(s) {
  if (s === null || s === undefined) return '';
  if (typeof s !== 'string') return String(s);
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

function aplicar(tpl, vars) {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => escapar(vars[k] ?? ''));
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
  const bgVar = p.foto ? ` style="--foto-bg:url('${escapar(p.foto)}')"` : '';
  return `
    <div class="produto-bloco"${bgVar}>
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

module.exports = { construirHtml };
