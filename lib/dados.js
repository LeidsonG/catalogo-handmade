// Camada de acesso aos JSONs (data/*.json).
// Centraliza read/write, backup automático antes de cada write
// e mutex global para serializar operações concorrentes.
//
// ROOT é a pasta do código (server.js, lib/, admin/, templates/...).
// DADOS é a pasta dos dados do usuário (data/, uploads/, output/). Em
// desenvolvimento as duas são a mesma (a raiz do repositório). No app
// empacotado (.exe) o launcher aponta CATALOGO_DADOS para uma pasta separada,
// para que a atualização do código nunca toque nos cadastros.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DADOS = process.env.CATALOGO_DADOS ? path.resolve(process.env.CATALOGO_DADOS) : ROOT;
const DATA_FILE = path.join(DADOS, 'data', 'produtos.json');
const INTRO_FILE = path.join(DADOS, 'data', 'intro.json');
const CATEGORIAS_FILE = path.join(DADOS, 'data', 'categorias.json');

fs.mkdirSync(path.join(DADOS, 'data'), { recursive: true });

function backupAntesDe(arquivo) {
  if (fs.existsSync(arquivo)) {
    try { fs.copyFileSync(arquivo, `${arquivo}.bak`); } catch {}
  }
}

function writeJson(arquivo, dados) {
  backupAntesDe(arquivo);
  fs.writeFileSync(arquivo, JSON.stringify(dados, null, 2));
}

// Os arquivos podem não existir numa instalação nova (antes da primeira
// sincronização): nesse caso devolve a estrutura vazia.
function readData() {
  if (!fs.existsSync(DATA_FILE)) return { produtos: [] };
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}
function writeData(data) { writeJson(DATA_FILE, data); }

function readIntro() {
  if (!fs.existsSync(INTRO_FILE)) return {};
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
  DADOS,
  readData, writeData,
  readIntro, writeIntro,
  readCategorias, writeCategorias,
  comLock,
};
