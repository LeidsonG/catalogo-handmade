/*
 * Renumera os códigos dos produtos para serem sequenciais e contíguos dentro
 * de cada categoria, removendo o sufixo de variação "-LETRA".
 *
 * As variações (ex.: CF-105-A, CF-105-B) passam a ser códigos próprios e os
 * números seguintes são empurrados para frente:
 *   CF-105-A -> CF-105
 *   CF-105-B -> CF-106
 *   CF-106   -> CF-107   (e assim por diante até o fim da categoria)
 *
 * A base de numeração de cada categoria é preservada (Feminino segue em 1xx,
 * Masculino em 0xx). A ordem usada é o campo `ordem` de cada produto.
 *
 * Também renomeia os arquivos em uploads/produtos/ (e uploads/cores/, se houver)
 * para o novo código, normalizando o nome para /uploads/produtos/<codigo><ext>.
 * O rename é feito em duas fases (temporário -> final) para evitar colisão
 * quando os números sobem.
 *
 * Faz backup do JSON antes de qualquer alteração.
 *
 * Uso:  node scripts/renumerar-codigos.js
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

// Extrai a parte numérica do código, ignorando o prefixo e o sufixo "-LETRA".
// Ex.: "CF-105-B" com prefixo "CF-" -> 105 ; "CM-004" -> 4
function numeroDoCodigo(codigo, prefixo) {
  if (!codigo || !codigo.startsWith(prefixo)) return null;
  const resto = codigo.slice(prefixo.length);
  const m = resto.match(/^(\d+)/);
  return m ? Number(m[1]) : null;
}

function main() {
  if (!fs.existsSync(PROD_FILE) || !fs.existsSync(CAT_FILE)) {
    console.log('produtos.json ou categorias.json não existe — nada a fazer.');
    return;
  }

  console.log('Backups:');
  backup(PROD_FILE);
  console.log('');

  const produtosData = JSON.parse(fs.readFileSync(PROD_FILE, 'utf8'));
  const categoriasData = JSON.parse(fs.readFileSync(CAT_FILE, 'utf8'));

  // Prefixo de código por categoriaId
  const prefixoPorCategoria = new Map();
  for (const c of categoriasData.categorias) {
    prefixoPorCategoria.set(c.id, c.prefixoCodigo || '');
  }

  // Agrupar produtos por categoria
  const porCategoria = new Map();
  for (const p of produtosData.produtos) {
    if (!porCategoria.has(p.categoriaId)) porCategoria.set(p.categoriaId, []);
    porCategoria.get(p.categoriaId).push(p);
  }

  // Calcular novos códigos e montar mapa de renames de arquivo
  const renomeacoes = []; // { antigo, novo } caminhos absolutos
  console.log('Renumerando códigos:');

  for (const [categoriaId, lista] of porCategoria) {
    const prefixo = prefixoPorCategoria.get(categoriaId);
    if (!prefixo) {
      console.log(`  ⚠ categoria ${categoriaId} sem prefixoCodigo — pulando ${lista.length} produto(s)`);
      continue;
    }

    // Base = menor número atual da categoria
    const numeros = lista
      .map((p) => numeroDoCodigo(p.codigo, prefixo))
      .filter((n) => n !== null);
    const baseNum = numeros.length ? Math.min(...numeros) : 1;

    // Ordenar por `ordem` (estável) e atribuir sequencial a partir da base
    lista.sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));

    console.log(`\n  ${categoriaId} (${prefixo}) — base ${baseNum}:`);
    lista.forEach((p, i) => {
      const novoNum = baseNum + i;
      const novoCodigo = `${prefixo}${String(novoNum).padStart(3, '0')}`;
      const codigoAntigo = p.codigo;

      if (codigoAntigo !== novoCodigo) {
        console.log(`    ${codigoAntigo} -> ${novoCodigo}  (${p.nome})`);
      } else {
        console.log(`    ${codigoAntigo}  (inalterado)`);
      }

      // Planejar rename do arquivo de foto a partir do valor REAL de `foto`
      if (p.foto) {
        const ext = path.extname(p.foto);
        const nomeNovo = `${sanitizar(novoCodigo)}${ext}`;
        const antigo = path.join(ROOT, p.foto.replace(/^\//, ''));
        const novo = path.join(UPLOADS_PROD, nomeNovo);
        const caminhoNovo = `/uploads/produtos/${nomeNovo}`;
        if (antigo !== novo) {
          if (fs.existsSync(antigo)) {
            renomeacoes.push({ antigo, novo });
          } else {
            console.log(`      ⚠ foto não encontrada: ${path.basename(antigo)}`);
          }
        }
        p.foto = caminhoNovo;
      }

      // Idem para corTextura (defensivo — hoje nenhum produto usa imagem de cor)
      if (p.corTextura) {
        const ext = path.extname(p.corTextura);
        const nomeNovo = `${sanitizar(novoCodigo)}-cor${ext}`;
        const antigo = path.join(ROOT, p.corTextura.replace(/^\//, ''));
        const novo = path.join(UPLOADS_COR, nomeNovo);
        const caminhoNovo = `/uploads/cores/${nomeNovo}`;
        if (antigo !== novo) {
          if (fs.existsSync(antigo)) {
            renomeacoes.push({ antigo, novo });
          } else {
            console.log(`      ⚠ cor não encontrada: ${path.basename(antigo)}`);
          }
        }
        p.corTextura = caminhoNovo;
      }

      p.codigo = novoCodigo;
    });
  }

  // Rename em duas fases para evitar colisão (origem de um pode ser destino de outro)
  console.log('\nRenomeando arquivos (2 fases):');
  const temporarios = renomeacoes.map((r, i) => ({
    ...r,
    temp: `${r.novo}.tmp-${i}`,
  }));
  // Fase 1: origem -> temporário
  for (const r of temporarios) {
    fs.renameSync(r.antigo, r.temp);
  }
  // Fase 2: temporário -> final (remove destino preexistente, se houver)
  for (const r of temporarios) {
    if (fs.existsSync(r.novo)) fs.unlinkSync(r.novo);
    fs.renameSync(r.temp, r.novo);
    console.log(`  ${path.basename(r.antigo)} -> ${path.basename(r.novo)}`);
  }

  fs.writeFileSync(PROD_FILE, JSON.stringify(produtosData, null, 2));

  console.log('\nConcluído.');
  console.log('Se algo deu errado, restaure data/produtos.json.backup-* e reverta uploads/ com git.');
}

main();
