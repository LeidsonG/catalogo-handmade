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

// As cores vêm do admin como hex (#rgb / #rrggbb). Sanitiza antes de injetar
// inline no style para evitar CSS injection — só passa hex válido.
function corSegura(v) {
  return typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v) ? v : '';
}

// Círculo de cor: sólido (só cor1) ou dividido na diagonal por uma linha de
// cima-esquerda para baixo-direita (gradiente 45° com corte seco em 50%).
function estiloAmostra(p) {
  const c1 = corSegura(p.cor1) || '#3b2416';
  const c2 = corSegura(p.cor2);
  return c2
    ? `background:linear-gradient(45deg, ${c1} 50%, ${c2} 50%)`
    : `background:${c1}`;
}

function aplicar(tpl, vars) {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => escapar(vars[k] ?? ''));
}

function renderBloco(p, semPreco = false) {
  if (!p) return '';
  const amostra = `<span class="produto-cor-amostra" style="${estiloAmostra(p)}"></span>`;
  const rodape = semPreco
    ? `<div class="produto-cor">
            ${amostra}
            <span class="produto-cor-nome">${escapar(p.nomeCor)}</span>
          </div>`
    : `<div class="produto-cor">
            ${amostra}
            <span class="produto-cor-nome">${escapar(p.nomeCor)}</span>
          </div>
          <div class="produto-preco">${formatarPreco(p.preco)}</div>`;
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
          ${rodape}
        </div>
      </div>
    </div>
  `;
}

function construirHtml({ produtos, intro, layout, categoria }) {
  const css = fs.readFileSync(path.join(ROOT, 'templates', 'pdf.css'), 'utf8');
  const templateIntro = fs.readFileSync(path.join(ROOT, 'templates', 'intro.html'), 'utf8');
  const templateProduto = fs.readFileSync(
    path.join(ROOT, 'templates', 'layout-2.html'),
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
  const semPreco = layout === '3';

  let paginas = '';
  for (let i = 0; i < ordenados.length; i += 2) {
    const par = ordenados.slice(i, i + 2);
    const bloco1 = renderBloco(par[0], semPreco);
    const bloco2 = par[1] ? renderBloco(par[1], semPreco) : '<div class="produto-bloco vazio"></div>';
    paginas += templateProdutoComLogo
      .replace('{{bloco1}}', bloco1)
      .replace('{{bloco2}}', bloco2);
  }

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
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
