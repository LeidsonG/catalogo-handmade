// Rotas /api/categorias — CRUD de categorias, reordenação (drag-and-drop)
// e sugestão do próximo código por prefixo. Bloqueia exclusão de categoria
// que ainda tem produtos.

const express = require('express');
const { readData, readCategorias, writeCategorias, comLock } = require('../lib/dados');
const { gerarProximoId, normalizarPrefixo, proximoCodigoCategoria } = require('../lib/ids');

const router = express.Router();

router.get('/', (_req, res) => {
  const lista = readCategorias().categorias;
  lista.sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
  res.json(lista);
});

router.post('/', (req, res) => comLock(() => {
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
}));

router.put('/:id', (req, res) => comLock(() => {
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
}));

router.get('/:id/proximo-codigo', (req, res) => {
  const categoria = readCategorias().categorias.find((c) => c.id === req.params.id);
  if (!categoria) return res.status(404).json({ erro: 'categoria não encontrada' });
  const prefixo = categoria.prefixoCodigo || '';
  if (!prefixo) return res.json({ codigo: '', motivo: 'categoria sem prefixo definido' });
  const codigo = proximoCodigoCategoria(readData().produtos, categoria.id, prefixo);
  res.json({ codigo });
});

router.post('/reordenar', (req, res) => comLock(() => {
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
}));

router.delete('/:id', (req, res) => comLock(() => {
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
}));

module.exports = router;
