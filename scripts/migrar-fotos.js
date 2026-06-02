/*
 * Renomeia as fotos do acervo em uploads/produtos/ para seguir o `codigo` do
 * produto, do mesmo jeito que o upload do admin já faz para produtos novos:
 *   uploads/produtos/001.png   (CF-101)  ->  uploads/produtos/CF-101.png
 *
 * Necessário porque os dados de teste deixaram fotos com nomes antigos
 * (numéricos) apontando para produtos cujo código mudou. Para produtos novos
 * o routes/uploads.js já salva com o nome correto — este script só conserta o
 * acervo existente.
 *
 * É idempotente: rodar de novo quando tudo já está alinhado não faz nada.
 * Faz backup do produtos.json antes de qualquer alteração.
 *
 * Uso:  node scripts/migrar-fotos.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PROD_FILE = path.join(ROOT, 'data', 'produtos.json');
const UPLOADS_PROD = path.join(ROOT, 'uploads', 'produtos');

function sanitizar(codigo) {
  return String(codigo || '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function backup(arquivo) {
  if (!fs.existsSync(arquivo)) return;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const destino = `${arquivo}.backup-${stamp}`;
  fs.copyFileSync(arquivo, destino);
  console.log(`  Backup: ${path.basename(destino)}`);
}

function main() {
  if (!fs.existsSync(PROD_FILE)) {
    console.log('produtos.json não existe — nada para migrar.');
    return;
  }

  const produtosData = JSON.parse(fs.readFileSync(PROD_FILE, 'utf8'));
  const produtos = produtosData.produtos || [];

  // Primeira passada: descobre o que precisa renomear sem tocar em disco.
  const planos = [];
  for (const p of produtos) {
    if (!p.foto || !p.codigo) continue;
    if (!p.foto.startsWith('/uploads/produtos/')) continue;
    const ext = path.extname(p.foto).toLowerCase();
    const nomeNovo = `${sanitizar(p.codigo)}${ext}`;
    const nomeAtual = path.basename(p.foto);
    if (nomeAtual === nomeNovo) continue; // já alinhado
    planos.push({
      produto: p,
      antigo: path.join(UPLOADS_PROD, nomeAtual),
      novo: path.join(UPLOADS_PROD, nomeNovo),
      caminhoNovo: `/uploads/produtos/${nomeNovo}`,
      nomeAtual,
      nomeNovo,
    });
  }

  if (!planos.length) {
    console.log('Todas as fotos já seguem o código do produto. Nada a fazer.');
    return;
  }

  console.log(`${planos.length} foto(s) a renomear:\n`);
  backup(PROD_FILE);
  console.log('');

  let renomeadas = 0;
  for (const plano of planos) {
    const { produto, antigo, novo, caminhoNovo, nomeAtual, nomeNovo } = plano;
    if (!fs.existsSync(antigo)) {
      console.log(`  ⚠ ${produto.codigo}: arquivo não existe (${nomeAtual}) — pulado`);
      continue;
    }
    if (fs.existsSync(novo)) {
      console.log(`  ⚠ ${produto.codigo}: destino já existe (${nomeNovo}) — sobrescrevendo`);
      fs.unlinkSync(novo);
    }
    fs.renameSync(antigo, novo);
    produto.foto = caminhoNovo;
    renomeadas += 1;
    console.log(`  ✓ ${produto.codigo}: ${nomeAtual} -> ${nomeNovo}`);
  }

  fs.writeFileSync(PROD_FILE, JSON.stringify(produtosData, null, 2));
  console.log(`\n${renomeadas} foto(s) renomeada(s). Migração concluída.`);
  console.log('Se algo deu errado, restaure o arquivo .backup-* na pasta data/');
}

main();
