// Renumeração de códigos por categoria: deixa os códigos sequenciais e
// contíguos seguindo o campo `ordem` dos produtos e renomeia as fotos para
// casar com o novo código. Usado pela rota POST /api/categorias/:id/renumerar.
//
// A base de numeração é o menor número já existente na categoria (CF segue em
// 1xx, as demais em 0xx), preservando a convenção de cada uma.
//
// O `planejar` não toca em disco — serve para a prévia "de->para". O `aplicar`
// faz o rename dos arquivos em duas fases (temporário -> final) para evitar
// colisão quando os números sobem (ex.: 138 vira 105 enquanto 105 vira 106) e
// muta os produtos recebidos com o novo código/caminho de foto.

const fs = require('fs');
const path = require('path');
const { ROOT } = require('./dados');
const { sanitizarCodigo } = require('./ids');

// Extrai a parte numérica do código, ignorando o prefixo. Ex.: "CF-105" -> 105.
function numeroDoCodigo(codigo, prefixo) {
  if (!codigo || !codigo.startsWith(prefixo)) return null;
  const m = codigo.slice(prefixo.length).match(/^(\d+)/);
  return m ? Number(m[1]) : null;
}

// Monta o plano de renumeração de UMA categoria sem tocar em disco.
// Retorna { base, total, mudancas, itens } onde itens tem o de/para de cada
// produto e o caminho atual/novo da foto. `mudancas` é quantos de fato mudam.
function planejarRenumeracao(produtos, categoria) {
  const prefixo = categoria.prefixoCodigo || '';
  if (!prefixo) return { erro: 'categoria sem prefixo de código definido' };

  const lista = produtos
    .filter((p) => p.categoriaId === categoria.id)
    .slice()
    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));

  const numeros = lista
    .map((p) => numeroDoCodigo(p.codigo, prefixo))
    .filter((n) => n !== null);
  const base = numeros.length ? Math.min(...numeros) : 1;

  const itens = lista.map((p, i) => {
    const novoCodigo = `${prefixo}${String(base + i).padStart(3, '0')}`;
    let fotoPara = p.foto || '';
    if (p.foto) {
      const ext = path.extname(p.foto);
      fotoPara = `/uploads/produtos/${sanitizarCodigo(novoCodigo)}${ext}`;
    }
    return {
      id: p.id,
      nome: p.nome,
      de: p.codigo,
      para: novoCodigo,
      fotoDe: p.foto || '',
      fotoPara,
      mudou: p.codigo !== novoCodigo || (p.foto || '') !== fotoPara,
    };
  });

  return {
    base,
    total: itens.length,
    mudancas: itens.filter((it) => it.mudou).length,
    itens,
  };
}

// Aplica um plano: muta os produtos recebidos e renomeia os arquivos de foto.
// Recebe `produtos` (o array vivo de data.produtos) para que o caller escreva
// o JSON depois, sob o mesmo lock. Retorna { renomeadas, ausentes }.
function aplicarRenumeracao(produtos, plano) {
  const mapaProduto = new Map(produtos.map((p) => [p.id, p]));
  const renomeacoes = []; // { antigo, novo } caminhos absolutos
  const ausentes = []; // fotos referenciadas que não existem no disco

  for (const item of plano.itens) {
    const p = mapaProduto.get(item.id);
    if (!p) continue;
    if (item.fotoDe && item.fotoPara && item.fotoDe !== item.fotoPara) {
      const antigo = path.join(ROOT, item.fotoDe.replace(/^\//, ''));
      const novo = path.join(ROOT, item.fotoPara.replace(/^\//, ''));
      if (fs.existsSync(antigo)) {
        renomeacoes.push({ antigo, novo });
      } else {
        // Arquivo já estava ausente: atualizamos só o caminho no JSON, sem
        // inventar um arquivo nem abortar a operação inteira por causa disso.
        ausentes.push(item.fotoDe);
      }
    }
    p.codigo = item.para;
    if (item.fotoPara) p.foto = item.fotoPara;
  }

  // Rename em duas fases: a origem de um pode ser o destino de outro.
  const temporarios = renomeacoes.map((r, i) => ({ ...r, temp: `${r.novo}.tmp-${i}` }));
  for (const r of temporarios) fs.renameSync(r.antigo, r.temp);
  for (const r of temporarios) {
    if (fs.existsSync(r.novo)) fs.unlinkSync(r.novo);
    fs.renameSync(r.temp, r.novo);
  }

  return { renomeadas: renomeacoes.length, ausentes };
}

module.exports = { planejarRenumeracao, aplicarRenumeracao };
