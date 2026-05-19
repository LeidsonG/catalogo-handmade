// Geração de IDs e códigos: produtos (p00001…), categorias (c001…)
// e códigos sequenciais por categoria a partir do prefixo (CM-001…).

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
  const limpo = String(p).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (!limpo) return '';
  return `${limpo}-`;
}

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

// Verifica se o código já existe entre os produtos (case-insensitive,
// ignora espaços). Se `ignorarId` for passado, esse produto não conta como
// conflito (usado em edição). Retorna o produto conflitante ou null.
function encontrarConflitoCodigo(produtos, codigo, ignorarId) {
  if (!codigo) return null;
  const alvo = String(codigo).trim().toLowerCase();
  if (!alvo) return null;
  return produtos.find((p) =>
    p.id !== ignorarId
    && String(p.codigo || '').trim().toLowerCase() === alvo
  ) || null;
}

module.exports = {
  gerarProximoId,
  sanitizarCodigo,
  normalizarPrefixo,
  proximoCodigoCategoria,
  encontrarConflitoCodigo,
};
