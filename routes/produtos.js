// Rotas /api/produtos — CRUD de produtos.
// Valida categoria existente e código único (com sugestão de próximo código),
// serializa escritas com comLock e apaga os arquivos de imagem ao excluir.

const express = require('express');
const fs = require('fs');
const path = require('path');
const { readData, writeData, readCategorias, comLock, ROOT } = require('../lib/dados');
const { gerarProximoId, encontrarConflitoCodigo, proximoCodigoCategoria } = require('../lib/ids');
const { CAMPOS_PRODUTO, pick } = require('../lib/validacao');

const router = express.Router();

// Constrói resposta 409 (Conflict) com info do conflito e sugestão de código.
function respostaConflito(res, conflito, categoria, produtos) {
  const sugestao = categoria?.prefixoCodigo
    ? proximoCodigoCategoria(produtos, categoria.id, categoria.prefixoCodigo)
    : '';
  return res.status(409).json({
    erro: `Código "${conflito.codigo}" já está em uso pelo produto "${conflito.nome}". Use outro código.`,
    conflito: { id: conflito.id, codigo: conflito.codigo, nome: conflito.nome },
    sugestao,
  });
}

router.get('/', (_req, res) => {
  res.json(readData().produtos);
});

router.post('/', (req, res) => comLock(() => {
  const data = readData();
  const cats = readCategorias().categorias;
  const categoriaId = req.body.categoriaId || '';
  const categoria = cats.find((c) => c.id === categoriaId);
  if (!categoria) {
    return res.status(400).json({ erro: 'categoria obrigatória e deve existir' });
  }
  const codigo = String(req.body.codigo || '').trim();
  if (!codigo) return res.status(400).json({ erro: 'código obrigatório' });
  const conflito = encontrarConflitoCodigo(data.produtos, codigo);
  if (conflito) return respostaConflito(res, conflito, categoria, data.produtos);
  const novo = {
    id: gerarProximoId(data.produtos, 'p', 5),
    codigo,
    nome: req.body.nome || '',
    descricao: req.body.descricao || '',
    preco: Number(req.body.preco) || 0,
    nomeCor: req.body.nomeCor || '',
    foto: req.body.foto || '',
    cor1: req.body.cor1 || '',
    cor2: req.body.cor2 || '',
    categoriaId,
    ativo: req.body.ativo !== false,
    ordem: data.produtos.length,
  };
  data.produtos.push(novo);
  writeData(data);
  res.json(novo);
}));

router.put('/:id', (req, res) => comLock(() => {
  const data = readData();
  const idx = data.produtos.findIndex((p) => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ erro: 'não encontrado' });
  const updates = pick(req.body, CAMPOS_PRODUTO);
  const cats = readCategorias().categorias;
  if (updates.categoriaId !== undefined) {
    if (!updates.categoriaId || !cats.find((c) => c.id === updates.categoriaId)) {
      return res.status(400).json({ erro: 'categoria obrigatória e deve existir' });
    }
  }
  if ('codigo' in updates) {
    updates.codigo = String(updates.codigo || '').trim();
    if (!updates.codigo) return res.status(400).json({ erro: 'código obrigatório' });
    const conflito = encontrarConflitoCodigo(data.produtos, updates.codigo, req.params.id);
    if (conflito) {
      const categoriaAlvo = cats.find(
        (c) => c.id === (updates.categoriaId || data.produtos[idx].categoriaId),
      );
      return respostaConflito(res, conflito, categoriaAlvo, data.produtos);
    }
  }
  if ('preco' in updates) updates.preco = Number(updates.preco) || 0;
  if ('ativo' in updates) updates.ativo = updates.ativo !== false;
  data.produtos[idx] = { ...data.produtos[idx], ...updates, id: req.params.id };
  writeData(data);
  res.json(data.produtos[idx]);
}));

router.delete('/:id', (req, res) => comLock(() => {
  const data = readData();
  const produto = data.produtos.find((p) => p.id === req.params.id);
  if (produto) {
    // Apaga a foto física para não acumular órfãos no disco. As cores agora
    // são hex (cor1/cor2), não arquivos, então não há nada a remover delas.
    const url = produto.foto;
    if (url && url.startsWith('/uploads/')) {
      const caminho = path.join(ROOT, url.replace(/^\//, ''));
      try {
        if (fs.existsSync(caminho)) fs.unlinkSync(caminho);
      } catch (err) {
        console.warn(`Falha ao remover ${caminho}:`, err.message);
      }
    }
  }
  data.produtos = data.produtos.filter((p) => p.id !== req.params.id);
  writeData(data);
  res.json({ ok: true });
}));

router.post('/reordenar', (req, res) => comLock(() => {
  const { ordemIds } = req.body;
  if (!Array.isArray(ordemIds)) return res.status(400).json({ erro: 'ordemIds obrigatório' });
  const data = readData();
  const mapa = new Map(data.produtos.map((p) => [p.id, p]));
  data.produtos = ordemIds.map((id, i) => {
    const p = mapa.get(id);
    if (p) p.ordem = i;
    return p;
  }).filter(Boolean);
  writeData(data);
  res.json({ ok: true });
}));

module.exports = router;
