/*
 * Migra IDs antigos (hash hexadecimal aleatório) para o formato sequencial novo:
 *   - Produtos:   p00001, p00002, p00003, ...
 *   - Categorias: c001, c002, c003, ...
 *
 * Também renomeia os arquivos em uploads/produtos/ e uploads/cores/
 * para usar o `codigo` do produto:
 *   - uploads/produtos/CM-001.png
 *   - uploads/cores/CM-001-cor.png
 *
 * Faz backup dos JSONs antes de qualquer alteração.
 *
 * Uso:  node scripts/migrar-ids.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PROD_FILE = path.join(ROOT, 'data', 'produtos.json');
const CAT_FILE = path.join(ROOT, 'data', 'categorias.json');
const UPLOADS_PROD = path.join(ROOT, 'uploads', 'produtos');
const UPLOADS_COR = path.join(ROOT, 'uploads', 'cores');

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

function renomear(antigo, novo) {
  if (antigo === novo) return false;
  if (!fs.existsSync(antigo)) {
    console.log(`  ⚠ arquivo não existe: ${path.basename(antigo)}`);
    return false;
  }
  if (fs.existsSync(novo)) {
    console.log(`  ⚠ destino já existe (sobrescrevendo): ${path.basename(novo)}`);
    fs.unlinkSync(novo);
  }
  fs.renameSync(antigo, novo);
  return true;
}

function main() {
  if (!fs.existsSync(PROD_FILE)) {
    console.log('produtos.json não existe — nada para migrar.');
    return;
  }
  if (!fs.existsSync(CAT_FILE)) {
    console.log('categorias.json não existe — nada para migrar.');
    return;
  }

  console.log('Backups:');
  backup(PROD_FILE);
  backup(CAT_FILE);
  console.log('');

  const produtosData = JSON.parse(fs.readFileSync(PROD_FILE, 'utf8'));
  const categoriasData = JSON.parse(fs.readFileSync(CAT_FILE, 'utf8'));

  // 1. Migrar categorias
  console.log(`Migrando ${categoriasData.categorias.length} categoria(s):`);
  const mapaCategorias = new Map();
  categoriasData.categorias.sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
  categoriasData.categorias.forEach((c, i) => {
    const novo = `c${String(i + 1).padStart(3, '0')}`;
    if (c.id !== novo) {
      console.log(`  ${c.id} -> ${novo}  (${c.nome})`);
      mapaCategorias.set(c.id, novo);
      c.id = novo;
    } else {
      console.log(`  ${c.id}  (já no novo formato)`);
    }
    c.ordem = i;
  });
  console.log('');

  // 2. Migrar produtos (ID + categoriaId + arquivos)
  console.log(`Migrando ${produtosData.produtos.length} produto(s):`);
  produtosData.produtos.sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
  produtosData.produtos.forEach((p, i) => {
    const idNovo = `p${String(i + 1).padStart(5, '0')}`;
    if (p.id !== idNovo) {
      console.log(`  ${p.id} -> ${idNovo}  (${p.codigo} - ${p.nome})`);
      p.id = idNovo;
    } else {
      console.log(`  ${p.id}  (${p.codigo} - ${p.nome}) — ID já ok`);
    }
    p.ordem = i;

    // Atualizar categoriaId se mudou
    if (p.categoriaId && mapaCategorias.has(p.categoriaId)) {
      p.categoriaId = mapaCategorias.get(p.categoriaId);
    }

    // Renomear arquivo de foto
    if (p.foto && p.codigo) {
      const codigoSafe = sanitizar(p.codigo);
      const ext = path.extname(p.foto);
      const nomeNovo = `${codigoSafe}${ext}`;
      const antigo = path.join(ROOT, p.foto.replace(/^\//, ''));
      const novo = path.join(UPLOADS_PROD, nomeNovo);
      const caminhoNovo = `/uploads/produtos/${nomeNovo}`;
      if (renomear(antigo, novo) || !fs.existsSync(antigo)) {
        if (fs.existsSync(novo)) p.foto = caminhoNovo;
      }
    }

    // Renomear arquivo de cor
    if (p.corTextura && p.codigo) {
      const codigoSafe = sanitizar(p.codigo);
      const ext = path.extname(p.corTextura);
      const nomeNovo = `${codigoSafe}-cor${ext}`;
      const antigo = path.join(ROOT, p.corTextura.replace(/^\//, ''));
      const novo = path.join(UPLOADS_COR, nomeNovo);
      const caminhoNovo = `/uploads/cores/${nomeNovo}`;
      if (renomear(antigo, novo) || !fs.existsSync(antigo)) {
        if (fs.existsSync(novo)) p.corTextura = caminhoNovo;
      }
    }
  });
  console.log('');

  fs.writeFileSync(PROD_FILE, JSON.stringify(produtosData, null, 2));
  fs.writeFileSync(CAT_FILE, JSON.stringify(categoriasData, null, 2));

  console.log('Migração concluída.');
  console.log('');
  console.log('Se algo deu errado, restaure os arquivos .backup-* na pasta data/');
}

main();
