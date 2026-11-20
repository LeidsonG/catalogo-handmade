// Rotas /api/upload/importar (lote) e /api/upload/:tipo — recebe a foto do produto via multer e salva em
// uploads/produtos/ nomeada pelo código do produto. Aceita só imagens, limite
// de 15MB. Retorna o caminho público. (As cores agora são hex, não arquivos.)

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DADOS, readData, writeData, comLock } = require('../lib/dados');
const { sanitizarCodigo } = require('../lib/ids');

const UPLOADS = path.join(DADOS, 'uploads');

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

// Importação em lote (botão "Importar fotos"): o admin manda uma foto por vez,
// já com o código do produto que o nome do arquivo indicou (CM-001.webp →
// CM-001). Grava em uploads/produtos/<código><ext>, apaga a foto antiga do
// mesmo produto se tinha outra extensão e aponta o produto para a nova.
const EXTS_FOTO = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const uploadMemoria = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

router.post('/importar', (req, res) => {
  uploadMemoria.single('arquivo')(req, res, (err) => {
    if (err) return res.status(400).json({ erro: err.message });
    if (!req.file) return res.status(400).json({ erro: 'arquivo obrigatório' });
    const ext = path.extname(req.file.originalname).toLowerCase();
    if (!EXTS_FOTO.has(ext)) return res.status(400).json({ erro: 'formato não aceito (use PNG, JPG ou WebP)' });
    return comLock(() => {
      const data = readData();
      const alvo = String(req.query.codigo || '').trim().toLowerCase();
      const produto = data.produtos.find((p) => String(p.codigo || '').trim().toLowerCase() === alvo);
      if (!produto) return res.status(404).json({ erro: 'nenhum produto com esse código' });

      const pasta = path.join(UPLOADS, 'produtos');
      fs.mkdirSync(pasta, { recursive: true });
      const nomeBase = sanitizarCodigo(produto.codigo);
      const destino = path.join(pasta, `${nomeBase}${ext}`);
      const substituida = fs.existsSync(destino)
        && !fs.readFileSync(destino).equals(req.file.buffer);
      fs.writeFileSync(destino, req.file.buffer);
      for (const outra of EXTS_FOTO) {
        if (outra === ext) continue;
        fs.rmSync(path.join(pasta, `${nomeBase}${outra}`), { force: true });
      }
      const foto = `/uploads/produtos/${nomeBase}${ext}`;
      const fotoAntiga = produto.foto || '';
      if (fotoAntiga !== foto) {
        produto.foto = foto;
        writeData(data);
      }
      res.json({ ok: true, codigo: produto.codigo, foto, substituida: substituida || (!!fotoAntiga && fotoAntiga !== foto) });
    });
  });
});

router.post('/:tipo', (req, res) => {
  upload.single('arquivo')(req, res, (err) => {
    if (err) return res.status(400).json({ erro: err.message });
    if (!req.file) return res.status(400).json({ erro: 'arquivo obrigatório' });
    res.json({ caminho: `/uploads/produtos/${req.file.filename}` });
  });
});

module.exports = router;
