/*
 * Baixa as fontes do Google Fonts usadas pelo catálogo PDF (Work Sans 500/600/700
 * e Rye 400) para assets/fonts/. Depois disso o pdf.css usa as cópias locais via
 * @font-face e não depende mais da internet para gerar PDFs.
 *
 * Uso:  node scripts/baixar-fontes.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const DESTINO = path.join(ROOT, 'assets', 'fonts');
const CSS_URL = 'https://fonts.googleapis.com/css2?family=Rye&family=Work+Sans:wght@500;600;700&display=swap';

// User-Agent que faz o Google servir woff2 (formato mais compacto, suportado
// pelo Chromium do Puppeteer e por todos os browsers modernos).
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

function buscar(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': UA } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(buscar(res.headers.location));
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} em ${url}`));
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function main() {
  fs.mkdirSync(DESTINO, { recursive: true });

  console.log('Buscando CSS do Google Fonts…');
  const css = (await buscar(CSS_URL)).toString('utf8');

  // Cada @font-face tem: font-family, font-weight e src com url(...) woff2.
  const blocos = [...css.matchAll(/@font-face\s*\{([^}]+)\}/g)];
  if (!blocos.length) {
    console.error('Nenhum @font-face encontrado no CSS — verifique a URL.');
    process.exit(1);
  }

  const declaracoes = [];

  for (const [, conteudo] of blocos) {
    const familia = (conteudo.match(/font-family:\s*['"]([^'"]+)['"]/) || [])[1];
    const peso = (conteudo.match(/font-weight:\s*(\d+)/) || [])[1] || '400';
    const estilo = (conteudo.match(/font-style:\s*(\w+)/) || [])[1] || 'normal';
    const url = (conteudo.match(/url\(([^)]+)\)/) || [])[1];
    if (!familia || !url) continue;

    const slugFamilia = familia.toLowerCase().replace(/\s+/g, '-');
    const nomeArquivo = `${slugFamilia}-${peso}-${estilo}.woff2`;
    const caminho = path.join(DESTINO, nomeArquivo);

    if (!fs.existsSync(caminho)) {
      console.log(`Baixando ${nomeArquivo}…`);
      const dados = await buscar(url);
      fs.writeFileSync(caminho, dados);
    } else {
      console.log(`Já existe: ${nomeArquivo}`);
    }

    declaracoes.push({ familia, peso, estilo, nomeArquivo });
  }

  // Gera o snippet @font-face local pra colar no pdf.css se quiser revisar.
  const snippet = declaracoes.map((d) => `@font-face {
  font-family: '${d.familia}';
  font-weight: ${d.peso};
  font-style: ${d.estilo};
  font-display: swap;
  src: url('/assets/fonts/${d.nomeArquivo}') format('woff2');
}`).join('\n\n');

  fs.writeFileSync(path.join(DESTINO, 'README.md'),
    `# Fontes do PDF\n\nBaixadas automaticamente por \`scripts/baixar-fontes.js\`.\nNão edite à mão — rode o script de novo se precisar atualizar.\n\nAs declarações \`@font-face\` correspondentes já estão em \`templates/pdf.css\`:\n\n\`\`\`css\n${snippet}\n\`\`\`\n`);

  console.log(`\nConcluído. ${declaracoes.length} arquivo(s) em ${DESTINO}`);
}

main().catch((err) => {
  console.error('Erro:', err.message);
  process.exit(1);
});
