const express = require('express');
const fs = require('fs');
const path = require('path');
const { readData, writeData, readCategorias, comLock, ROOT } = require('../lib/dados');
const { gerarProximoId } = require('../lib/ids');
const { CAMPOS_PRODUTO, pick } = require('../lib/validacao');

const router = express.Router();

router.get('/', (_req, res) => {
  res.json(readData().produtos);
});

router.post('/', (req, res) => comLock(() => {
  const data = readData();
  const cats = readCategorias().categorias;
  const categoriaId = req.body.categoriaId || '';
  if (!categoriaId || !cats.find((c) => c.id === categoriaId)) {
    return res.status(400).json({ erro: 'categoria obrigatória e deve existir' });
  }
  const novo = {
    id: gerarProximoId(data.produtos, 'p', 5),
    codigo: req.body.codigo || '',
    nome: req.body.nome || '',
    descricao: req.body.descricao || '',
    preco: Number(req.body.preco) || 0,
    nomeCor: req.body.nomeCor || '',
    foto: req.body.foto || '',
    corTextura: req.body.corTextura || '',
    categoriaId,
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
  if (updates.categoriaId !== undefined) {
    const cats = readCategorias().categorias;
    if (!updates.categoriaId || !cats.find((c) => c.id === updates.categoriaId)) {
      return res.status(400).json({ erro: 'categoria obrigatória e deve existir' });
    }
  }
  if ('preco' in updates) updates.preco = Number(updates.preco) || 0;
  data.produtos[idx] = { ...data.produtos[idx], ...updates, id: req.params.id };
  writeData(data);
  res.json(data.produtos[idx]);
}));

router.delete('/:id', (req, res) => comLock(() => {
  const data = readData();
  const produto = data.produtos.find((p) => p.id === req.params.id);
  if (produto) {
    // Apaga os arquivos físicos (foto e cor) para não acumular órfãos no disco
    for (const campo of ['foto', 'corTextura']) {
      const url = produto[campo];
      if (url && url.startsWith('/uploads/')) {
        const caminho = path.join(ROOT, url.replace(/^\//, ''));
        try {
          if (fs.existsSync(caminho)) fs.unlinkSync(caminho);
        } catch (err) {
          console.warn(`Falha ao remover ${caminho}:`, err.message);
        }
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
