// Whitelists de campos editáveis em cada entidade.

const CAMPOS_PRODUTO = ['codigo', 'nome', 'descricao', 'preco', 'nomeCor', 'foto', 'cor1', 'cor2', 'categoriaId'];
const CAMPOS_CATEGORIA = ['nome', 'prefixoCodigo'];
const CAMPOS_INTRO = ['marca', 'subtitulo', 'texto', 'ano', 'contato'];

function pick(body, campos) {
  const out = {};
  for (const k of campos) if (k in body) out[k] = body[k];
  return out;
}

module.exports = {
  CAMPOS_PRODUTO, CAMPOS_CATEGORIA, CAMPOS_INTRO, pick,
};
