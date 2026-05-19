// Camada de acesso aos JSONs (data/*.json).
// Centraliza read/write, backup automático antes de cada write
// e mutex global para serializar operações concorrentes.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'data', 'produtos.json');
const INTRO_FILE = path.join(ROOT, 'data', 'intro.json');
const CATEGORIAS_FILE = path.join(ROOT, 'data', 'categorias.json');

function backupAntesDe(arquivo) {
  if (fs.existsSync(arquivo)) {
    try { fs.copyFileSync(arquivo, `${arquivo}.bak`); } catch {}
  }
}

function writeJson(arquivo, dados) {
  backupAntesDe(arquivo);
  fs.writeFileSync(arquivo, JSON.stringify(dados, null, 2));
}

function readData() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}
function writeData(data) { writeJson(DATA_FILE, data); }

function readIntro() {
  return JSON.parse(fs.readFileSync(INTRO_FILE, 'utf8'));
}
function writeIntro(data) { writeJson(INTRO_FILE, data); }

function readCategorias() {
  if (!fs.existsSync(CATEGORIAS_FILE)) return { categorias: [] };
  return JSON.parse(fs.readFileSync(CATEGORIAS_FILE, 'utf8'));
}
function writeCategorias(data) { writeJson(CATEGORIAS_FILE, data); }

// Mutex global. Serializa todas as operações read+modify+write
// para evitar race condition entre requisições concorrentes.
let mutex = Promise.resolve();
function comLock(fn) {
  const tarefa = mutex.then(fn, fn);
  mutex = tarefa.catch(() => {});
  return tarefa;
}

module.exports = {
  ROOT,
  readData, writeData,
  readIntro, writeIntro,
  readCategorias, writeCategorias,
  comLock,
};
