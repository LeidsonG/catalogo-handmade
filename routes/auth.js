// Rotas /api/auth — quem está logado (GET /me) e troca de senha
// (POST /trocar-senha). A lógica de hash/verificação fica em lib/auth.js.

const express = require('express');
const auth = require('../lib/auth');

const router = express.Router();

router.get('/me', (_req, res) => {
  res.json({ usuario: auth.getUsuario() });
});

router.post('/trocar-senha', (req, res) => {
  const { senhaAtual, senhaNova } = req.body || {};
  const resultado = auth.trocarSenha(senhaAtual, senhaNova);
  if (!resultado.ok) return res.status(400).json({ erro: resultado.erro });
  res.json({ ok: true });
});

module.exports = router;
