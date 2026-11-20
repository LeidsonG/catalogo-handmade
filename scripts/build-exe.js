// Monta o instalador para Windows: build/CatalogoHandmade-<versão>-win64.zip
//
//   npm run build:exe                 (usa a branch main)
//   node scripts/build-exe.js --ref staging
//
// Roda no Linux/WSL (ou Windows) com Node, git, unzip e zip. Passos:
//   1. CatalogoHandmade.exe = node.exe oficial do Windows + launcher/launcher.js
//      embutido (Node Single Executable Application, injetado com postject);
//   2. app/ = código da ref escolhida (git archive), sem data/ e uploads/, com
//      o .manifesto.json que a atualização automática usa;
//   3. node_modules/ = dependências de produção (npm ci, sem baixar Chrome);
//   4. runtime/chrome/ = Chrome for Testing win64 na versão que o Puppeteer
//      espera;
//   5. compacta tudo num .zip.
// Downloads ficam em build/cache para não baixar de novo a cada build.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { IGNORAR } = require('../lib/atualizacao');

const ROOT = path.resolve(__dirname, '..');
const BUILD = path.join(ROOT, 'build');
const CACHE = path.join(BUILD, 'cache');
const DIST = path.join(BUILD, 'CatalogoHandmade');
const ref = process.argv.includes('--ref') ? process.argv[process.argv.indexOf('--ref') + 1] : 'main';

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', ...opts });
const out = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 28, ...opts });
const passo = (m) => console.log(`\n=== ${m}`);

async function baixar(url, destino) {
  if (fs.existsSync(destino)) return destino;
  console.log(`baixando ${url}`);
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download falhou (${r.status}): ${url}`);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(`${destino}.parcial`, Buffer.from(await r.arrayBuffer()));
  fs.renameSync(`${destino}.parcial`, destino);
  return destino;
}

async function main() {
  const commit = out('git', ['rev-parse', ref], { cwd: ROOT }).trim();
  const pkg = JSON.parse(out('git', ['show', `${ref}:package.json`], { cwd: ROOT }));
  const versao = pkg.version;
  console.log(`Catálogo Handmade ${versao} — ref ${ref} (${commit.slice(0, 7)})`);

  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  passo('1/5 Executável (Node SEA)');
  const nodeVer = process.version;
  const nodeZip = await baixar(
    `https://nodejs.org/dist/${nodeVer}/node-${nodeVer}-win-x64.zip`,
    path.join(CACHE, `node-${nodeVer}-win-x64.zip`),
  );
  const exe = path.join(DIST, 'CatalogoHandmade.exe');
  fs.writeFileSync(exe, execFileSync('unzip', ['-p', nodeZip, `node-${nodeVer}-win-x64/node.exe`], { maxBuffer: 1 << 28 }));
  const seaConfig = path.join(BUILD, 'sea-config.json');
  const blob = path.join(BUILD, 'sea-prep.blob');
  fs.writeFileSync(seaConfig, JSON.stringify({
    main: path.join(ROOT, 'launcher', 'launcher.js'),
    output: blob,
    disableExperimentalSEAWarning: true,
    useCodeCache: false, // o blob é gerado no Linux e roda no Windows
    useSnapshot: false,
  }));
  run(process.execPath, ['--experimental-sea-config', seaConfig]);
  run('npx', ['--yes', 'postject@1.0.0-alpha.6', exe, 'NODE_SEA_BLOB', blob,
    '--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2']);

  passo('2/5 Código do app');
  const app = path.join(DIST, 'app');
  fs.mkdirSync(app);
  const tar = execFileSync('git', ['archive', '--format=tar', commit], { cwd: ROOT, maxBuffer: 1 << 30 });
  execFileSync('tar', ['-x', '-C', app], { input: tar });
  const arquivos = {};
  for (const linha of out('git', ['ls-tree', '-r', commit], { cwd: ROOT }).split('\n')) {
    const m = linha.match(/^\d+ blob (\w+)\t(.+)$/);
    if (m && !IGNORAR.test(m[2])) arquivos[m[2]] = m[1];
  }
  for (const pasta of ['data', 'uploads', 'output']) fs.rmSync(path.join(app, pasta), { recursive: true, force: true });
  fs.writeFileSync(path.join(app, '.manifesto.json'), JSON.stringify({ commit, arquivos }));

  passo('3/5 Dependências (node_modules)');
  const tmpNpm = path.join(BUILD, 'npm');
  fs.rmSync(tmpNpm, { recursive: true, force: true });
  fs.mkdirSync(tmpNpm);
  fs.copyFileSync(path.join(app, 'package.json'), path.join(tmpNpm, 'package.json'));
  fs.copyFileSync(path.join(app, 'package-lock.json'), path.join(tmpNpm, 'package-lock.json'));
  run('npm', ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], {
    cwd: tmpNpm, env: { ...process.env, PUPPETEER_SKIP_DOWNLOAD: '1' },
  });
  fs.renameSync(path.join(tmpNpm, 'node_modules'), path.join(DIST, 'node_modules'));
  fs.rmSync(tmpNpm, { recursive: true, force: true });

  passo('4/5 Chrome para gerar o PDF');
  const revisoes = require(path.join(DIST, 'node_modules', 'puppeteer-core', 'lib', 'cjs', 'puppeteer', 'revisions.js'));
  const chromeVer = revisoes.PUPPETEER_REVISIONS.chrome;
  const chromeZip = await baixar(
    `https://storage.googleapis.com/chrome-for-testing-public/${chromeVer}/win64/chrome-win64.zip`,
    path.join(CACHE, `chrome-${chromeVer}-win64.zip`),
  );
  fs.mkdirSync(path.join(DIST, 'runtime', 'chrome'), { recursive: true });
  run('unzip', ['-q', chromeZip, '-d', path.join(DIST, 'runtime', 'chrome')]);

  fs.copyFileSync(path.join(app, 'GUIA.md'), path.join(DIST, 'COMO USAR.txt'));

  passo('5/5 Compactando');
  const zip = path.join(BUILD, `CatalogoHandmade-${versao}-win64.zip`);
  fs.rmSync(zip, { force: true });
  run('zip', ['-r', '-q', zip, 'CatalogoHandmade'], { cwd: BUILD });
  const mb = (fs.statSync(zip).size / 1024 / 1024).toFixed(0);
  console.log(`\nPronto: ${zip} (${mb} MB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
