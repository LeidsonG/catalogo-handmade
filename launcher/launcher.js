// Launcher do CatalogoHandmade.exe (Node "Single Executable Application").
//
// O .exe É o próprio Node, com este script embutido. Ele roda em dois papéis:
//   - supervisor (padrão): abre a janela, sobe o servidor como processo filho,
//     abre o navegador e reinicia o servidor quando ele sai com código 75
//     (pedido de reinício depois de uma atualização de código);
//   - servidor (CATALOGO_FILHO=1): carrega app/server.js do disco.
//
// Estrutura da pasta instalada:
//   CatalogoHandmade.exe
//   app/            código (atualizado pelo botão Sincronizar)
//   node_modules/   bibliotecas (só mudam com instalador novo)
//   runtime/chrome/ Chrome usado para gerar o PDF
//   dados/          cadastros, fotos e PDFs gerados (nunca tocado por atualização)

const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const { spawn } = require('node:child_process');

const BASE = path.dirname(process.execPath);
const APP = path.join(BASE, 'app');
const DADOS = path.join(BASE, 'dados');
const PORTA = Number(process.env.PORT) || 3000;
const URL_ADMIN = `http://localhost:${PORTA}/admin`;

if (process.env.CATALOGO_FILHO === '1') {
  // No SEA, o require embutido só carrega módulos nativos do Node; o
  // createRequire dá um require normal, que lê arquivos do disco.
  const { createRequire } = require('node:module');
  const servidor = path.join(APP, 'server.js');
  process.chdir(APP);
  createRequire(servidor)(servidor);
} else {
  supervisor();
}

function chromeExe() {
  const raiz = path.join(BASE, 'runtime', 'chrome');
  const candidato = path.join(raiz, 'chrome-win64', 'chrome.exe');
  if (fs.existsSync(candidato)) return candidato;
  return '';
}

function servidorRespondendo() {
  return new Promise((resolve) => {
    const req = http.get(URL_ADMIN, { timeout: 1500 }, (res) => { res.resume(); resolve(true); });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

async function esperarServidor(segundos) {
  for (let i = 0; i < segundos * 2; i += 1) {
    if (await servidorRespondendo()) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function abrirNavegador() {
  if (process.env.CATALOGO_SEM_NAVEGADOR === '1') return;
  // Abre no navegador padrão do Windows.
  spawn('rundll32.exe', ['url.dll,FileProtocolHandler', URL_ADMIN], { detached: true, stdio: 'ignore' }).unref();
}

// Cria o atalho "Catalogo Handmade" na área de trabalho na primeira execução.
// Os caminhos vão por variável de ambiente para não ter problema com acentos
// ou espaços no nome das pastas.
function criarAtalho() {
  const marca = path.join(DADOS, '.atalho-criado');
  if (fs.existsSync(marca) || process.env.CATALOGO_SEM_NAVEGADOR === '1') return;
  const script = [
    '$d = [Environment]::GetFolderPath("Desktop")',
    '$s = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $d "Catalogo Handmade.lnk"))',
    '$s.TargetPath = $env:ALVO_ATALHO',
    '$s.WorkingDirectory = $env:PASTA_ATALHO',
    '$s.Save()',
  ].join('; ');
  const ps = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
    env: { ...process.env, ALVO_ATALHO: process.execPath, PASTA_ATALHO: BASE },
    stdio: 'ignore',
    windowsHide: true,
  });
  ps.on('exit', (codigo) => {
    if (codigo === 0) {
      fs.writeFileSync(marca, new Date().toISOString());
      console.log('Atalho "Catalogo Handmade" criado na área de trabalho.');
    }
  });
}

function esperarTecla() {
  console.log('\nPressione Enter para fechar.');
  process.stdin.resume();
  process.stdin.once('data', () => process.exit(1));
}

async function supervisor() {
  process.title = 'Catálogo Handmade';
  console.log('==============================================');
  console.log('  Catálogo Handmade');
  console.log('  NÃO feche esta janela enquanto usa o programa.');
  console.log('  Para sair, feche esta janela.');
  console.log('==============================================\n');

  if (await servidorRespondendo()) {
    console.log('O programa já está aberto. Abrindo o navegador…');
    abrirNavegador();
    setTimeout(() => process.exit(0), 1500);
    return;
  }

  if (!fs.existsSync(path.join(APP, 'server.js'))) {
    console.error(`Pasta do programa incompleta: não encontrei ${path.join(APP, 'server.js')}.`);
    console.error('Extraia o arquivo .zip inteiro de novo.');
    esperarTecla();
    return;
  }

  fs.mkdirSync(DADOS, { recursive: true });
  criarAtalho();

  let primeiraVez = true;
  const subir = () => {
    const filho = spawn(process.execPath, [], {
      env: {
        ...process.env,
        CATALOGO_FILHO: '1',
        CATALOGO_EMPACOTADO: '1',
        CATALOGO_DADOS: DADOS,
        PUPPETEER_EXECUTABLE_PATH: chromeExe(),
        PORT: String(PORTA),
      },
      stdio: 'inherit',
    });
    filho.on('exit', (codigo) => {
      if (codigo === 75) {
        console.log('\nAtualização instalada. Reiniciando…\n');
        setTimeout(subir, 500);
        return;
      }
      console.error(`\nO programa parou (código ${codigo}). Feche esta janela e abra de novo.`);
      esperarTecla();
    });
    if (primeiraVez) {
      primeiraVez = false;
      esperarServidor(60).then((ok) => {
        if (ok) {
          console.log(`Pronto! Abrindo ${URL_ADMIN}`);
          abrirNavegador();
        }
      });
    }
  };
  subir();
}
