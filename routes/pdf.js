const express = require('express');
const path = require('path');
const puppeteer = require('puppeteer');
const { readData, readIntro, readCategorias, ROOT } = require('../lib/dados');
const { construirHtml } = require('../lib/render');
const { RENDER_TOKEN } = require('../lib/auth');

const OUTPUT_DIR = path.join(ROOT, 'output');

function criarRouter(porta) {
  const router = express.Router();

  router.get('/render/:layout', (req, res) => {
    const layout = req.params.layout;
    if (!['2', '3'].includes(layout)) return res.status(400).send('layout inválido');
    const categoriaId = String(req.query.categoria || '');
    if (!categoriaId) return res.status(400).send('parâmetro categoria obrigatório');
    const cats = readCategorias().categorias;
    const categoria = cats.find((c) => c.id === categoriaId);
    if (!categoria) return res.status(404).send('categoria não encontrada');
    const produtos = readData().produtos.filter((p) => p.categoriaId === categoriaId);
    const html = construirHtml({
      produtos,
      intro: readIntro(),
      layout,
      categoria,
    });
    res.set('Content-Type', 'text/html; charset=utf-8').send(html);
  });

  router.post('/api/gerar-pdf', async (req, res) => {
    const layout = String(req.body.layout || '2');
    if (!['2', '3'].includes(layout)) return res.status(400).json({ erro: 'layout inválido' });
    const categoriaId = String(req.body.categoriaId || '');
    if (!categoriaId) return res.status(400).json({ erro: 'categoriaId obrigatório' });
    const categoria = readCategorias().categorias.find((c) => c.id === categoriaId);
    if (!categoria) return res.status(404).json({ erro: 'categoria não encontrada' });

    let browser;
    try {
      browser = await puppeteer.launch({ headless: 'new' });
      const page = await browser.newPage();
      // O servidor exige autenticação em tudo, mas o Puppeteer não tem como saber
      // a senha. Enviamos um token interno gerado no startup que o middleware
      // reconhece e libera a requisição. O token nunca vai para fora do servidor.
      await page.setExtraHTTPHeaders({ 'x-render-token': RENDER_TOKEN });
      // Carregamos via rota HTTP (em vez de setContent) para que caminhos absolutos
      // como /uploads/... e /assets/... resolvam para o próprio servidor.
      await page.goto(
        `http://localhost:${porta}/render/${layout}?categoria=${encodeURIComponent(categoriaId)}`,
        { waitUntil: 'networkidle0' },
      );
      // Garante que todas as fontes (incluindo Rye e Work Sans locais) foram
      // baixadas/parseadas antes de capturar o PDF. Caso contrário, o Puppeteer
      // pode renderizar com o fallback serif/sans antes do swap.
      await page.evaluate(() => document.fonts.ready);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const slug = categoria.nome.toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const nome = `catalogo-${slug}-layout${layout}-${stamp}.pdf`;
      const caminho = path.join(OUTPUT_DIR, nome);
      await page.pdf({
        path: caminho,
        format: 'A4',
        printBackground: true,
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
      });
      const semFoto = readData().produtos
        .filter((p) => p.categoriaId === categoriaId && !p.foto);
      const resposta = { ok: true, arquivo: nome, caminho: `/output/${nome}` };
      if (semFoto.length) {
        resposta.aviso = `${semFoto.length} produto(s) sem foto: ${semFoto.map((p) => p.codigo).join(', ')}`;
      }
      res.json(resposta);
    } catch (err) {
      console.error('Erro ao gerar PDF:', err);
      res.status(500).json({ erro: 'falha ao gerar PDF', detalhe: err.message });
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
  });

  return router;
}

module.exports = criarRouter;
