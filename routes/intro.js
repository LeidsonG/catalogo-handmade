// Rotas /api/intro — lê e atualiza o texto da página de introdução do PDF
// (marca, subtítulo, texto, ano, contato). Só os campos da whitelist passam.

const express = require('express');
const { readIntro, writeIntro, comLock } = require('../lib/dados');
const { CAMPOS_INTRO, pick } = require('../lib/validacao');

const router = express.Router();

router.get('/', (_req, res) => res.json(readIntro()));

router.put('/', (req, res) => comLock(() => {
  const atual = readIntro();
  const novo = { ...atual, ...pick(req.body, CAMPOS_INTRO) };
  writeIntro(novo);
  res.json(novo);
}));

module.exports = router;
