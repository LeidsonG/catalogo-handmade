// Rotas /api/upload/:tipo — recebe a foto do produto via multer e salva em
// uploads/produtos/ nomeada pelo código do produto. Aceita só imagens, limite
// de 15MB. Retorna o caminho público. (As cores agora são hex, não arquivos.)

const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const { ROOT } = require('../lib/dados');
const { sanitizarCodigo } = require('../lib/ids');

const UPLOADS = path.join(ROOT, 'uploads');

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, path.join(UPLOADS, 'produtos'));
  },
  filename: (req, file, cb) => {
    const codigo = sanitizarCodigo(req.query.codigo);
    const ext = path.extname(file.originalname).toLowerCase();
    if (!codigo) {
      // Fallback: hash aleatório se não veio código (não deveria acontecer pelo admin)
      return cb(null, `${crypto.randomBytes(6).toString('hex')}${ext}`);
    }
    cb(null, `${codigo}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) return cb(null, true);
    cb(new Error('Apenas arquivos de imagem são aceitos'));
  },
});

const router = express.Router();

router.post('/:tipo', (req, res) => {
  upload.single('arquivo')(req, res, (err) => {
    if (err) return res.status(400).json({ erro: err.message });
    if (!req.file) return res.status(400).json({ erro: 'arquivo obrigatório' });
    res.json({ caminho: `/uploads/produtos/${req.file.filename}` });
  });
});

module.exports = router;
