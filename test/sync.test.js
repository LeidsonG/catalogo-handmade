// Testes da sincronização: duas "máquinas" (pastas temporárias) sincronizando
// com um GitHub falso em memória que implementa a mesma interface de
// lib/github.js (refs, commits, trees, blobs).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { githubFalso } = require('./github-falso');
const { sincronizar } = require('../lib/sync');

function maquina() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'catalogo-sync-'));
  fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'uploads', 'produtos'), { recursive: true });
  const m = {
    dir,
    escrever(rel, conteudo) {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      fs.writeFileSync(path.join(dir, rel), typeof conteudo === 'string' ? conteudo : JSON.stringify(conteudo, null, 2));
    },
    ler(rel) { const a = path.join(dir, rel); return fs.existsSync(a) ? fs.readFileSync(a, 'utf8') : null; },
    produtos() { return JSON.parse(m.ler('data/produtos.json')).produtos; },
    setProdutos(lista) { m.escrever('data/produtos.json', { produtos: lista }); },
    sync(gh, resolucoes) { return sincronizar({ dir, gh, branch: 'dados', resolucoes, nomeMaquina: 'teste' }); },
  };
  return m;
}

const cat = { categorias: [{ id: 'c001', nome: 'Cintos Masculino', prefixoCodigo: 'CM-', ordem: 0 }] };
const prod = (n, extra = {}) => ({
  id: `p${String(n).padStart(5, '0')}`, codigo: `CM-${String(n).padStart(3, '0')}`, nome: `Cinto ${n}`,
  preco: 79, categoriaId: 'c001', foto: '', ordem: n, ...extra,
});

async function cenarioInicial() {
  const gh = githubFalso();
  const eu = maquina();
  const ela = maquina();
  eu.escrever('data/categorias.json', cat);
  eu.setProdutos([prod(1, { foto: '/uploads/produtos/CM-001.webp' }), prod(2)]);
  eu.escrever('data/intro.json', { marca: 'Handmade' });
  eu.escrever('uploads/produtos/CM-001.webp', 'FOTO-1');
  eu.escrever('uploads/produtos/CM-001.webp:Zone.Identifier', 'lixo');
  eu.escrever('data/auth.json', '{"segredo":1}');
  assert.equal((await eu.sync(gh)).status, 'ok');
  assert.equal((await ela.sync(gh)).status, 'ok');
  return { gh, eu, ela };
}

test('primeira sincronização cria a branch e a outra máquina recebe tudo', async () => {
  const { gh, ela } = await cenarioInicial();
  assert.ok(gh.refs.get('dados'));
  assert.equal(ela.produtos().length, 2);
  assert.equal(ela.ler('uploads/produtos/CM-001.webp'), 'FOTO-1');
  assert.equal(ela.ler('data/auth.json'), null, 'auth.json não pode ser sincronizado');
  assert.equal(gh.arquivoRemoto('uploads/produtos/CM-001.webp:Zone.Identifier'), null);
});

test('mudanças em produtos diferentes se juntam sem conflito', async () => {
  const { gh, eu, ela } = await cenarioInicial();
  eu.setProdutos(eu.produtos().map((p) => (p.id === 'p00001' ? { ...p, preco: 99 } : p)));
  ela.setProdutos(ela.produtos().map((p) => (p.id === 'p00002' ? { ...p, nome: 'Novo nome' } : p)));
  assert.equal((await eu.sync(gh)).status, 'ok');
  assert.equal((await ela.sync(gh)).status, 'ok');
  assert.equal((await eu.sync(gh)).status, 'ok');
  for (const m of [eu, ela]) {
    const ps = m.produtos();
    assert.equal(ps.find((p) => p.id === 'p00001').preco, 99);
    assert.equal(ps.find((p) => p.id === 'p00002').nome, 'Novo nome');
  }
});

test('campos diferentes do mesmo produto se juntam; mesmo campo vira conflito com escolha', async () => {
  const { gh, eu, ela } = await cenarioInicial();
  eu.setProdutos(eu.produtos().map((p) => (p.id === 'p00001' ? { ...p, preco: 99, ordem: 50 } : p)));
  ela.setProdutos(ela.produtos().map((p) => (p.id === 'p00001' ? { ...p, preco: 120, nome: 'Dela' } : p)));
  await eu.sync(gh);
  const r = await ela.sync(gh);
  assert.equal(r.status, 'conflitos');
  assert.equal(r.conflitos.length, 1);
  assert.deepEqual(r.conflitos[0].campos, ['preco']);
  // O cadastro mesclado (para a tela mostrar como fica) já tem o que não conflitou.
  assert.equal(r.conflitos[0].mesclado.nome, 'Dela');
  assert.equal(r.conflitos[0].mesclado.ordem, 50);
  // nada foi aplicado ainda
  assert.equal(ela.produtos().find((p) => p.id === 'p00001').preco, 120);
  const r2 = await ela.sync(gh, { 'produto:p00001': 'local' });
  assert.equal(r2.status, 'ok');
  const p = ela.produtos().find((x) => x.id === 'p00001');
  assert.equal(p.preco, 120);
  assert.equal(p.nome, 'Dela');
  assert.equal(p.ordem, 50, 'campo que só eu mudei é preservado');
  await eu.sync(gh);
  assert.equal(eu.produtos().find((x) => x.id === 'p00001').preco, 120);
});

test('as duas máquinas cadastram um produto novo: ids e códigos colidem e o local é renumerado', async () => {
  const { gh, eu, ela } = await cenarioInicial();
  eu.setProdutos([...eu.produtos(), prod(3, { nome: 'Meu', foto: '/uploads/produtos/CM-003.webp' })]);
  eu.escrever('uploads/produtos/CM-003.webp', 'FOTO-MINHA');
  ela.setProdutos([...ela.produtos(), prod(3, { nome: 'Dela', foto: '/uploads/produtos/CM-003.webp' })]);
  ela.escrever('uploads/produtos/CM-003.webp', 'FOTO-DELA');
  await eu.sync(gh);
  const r = await ela.sync(gh);
  assert.equal(r.status, 'ok');
  assert.equal(r.resumo.mensagens.length, 1);
  await eu.sync(gh);
  for (const m of [eu, ela]) {
    const ps = m.produtos();
    assert.equal(ps.length, 4);
    const meu = ps.find((p) => p.nome === 'Meu');
    const dela = ps.find((p) => p.nome === 'Dela');
    assert.equal(meu.codigo, 'CM-003');
    assert.equal(dela.codigo, 'CM-004');
    assert.notEqual(meu.id, dela.id);
    assert.equal(dela.foto, '/uploads/produtos/CM-004.webp');
    assert.equal(m.ler('uploads/produtos/CM-003.webp'), 'FOTO-MINHA');
    assert.equal(m.ler('uploads/produtos/CM-004.webp'), 'FOTO-DELA');
  }
});

test('mesma foto alterada nas duas máquinas vira conflito de arquivo', async () => {
  const { gh, eu, ela } = await cenarioInicial();
  eu.escrever('uploads/produtos/CM-001.webp', 'FOTO-NOVA-MINHA');
  ela.escrever('uploads/produtos/CM-001.webp', 'FOTO-NOVA-DELA');
  await eu.sync(gh);
  const r = await ela.sync(gh);
  assert.equal(r.status, 'conflitos');
  assert.equal(r.conflitos[0].chave, 'arquivo:uploads/produtos/CM-001.webp');
  // O conflito traz o cadastro do produto dono da foto, dos dois lados.
  assert.equal(r.conflitos[0].produtoLocal.codigo, 'CM-001');
  assert.equal(r.conflitos[0].produtoRemoto.nome, 'Cinto 1');
  assert.equal((await ela.sync(gh, { 'arquivo:uploads/produtos/CM-001.webp': 'remoto' })).status, 'ok');
  assert.equal(ela.ler('uploads/produtos/CM-001.webp'), 'FOTO-NOVA-MINHA');
});

test('excluir produto e foto propaga para a outra máquina', async () => {
  const { gh, eu, ela } = await cenarioInicial();
  eu.setProdutos(eu.produtos().filter((p) => p.id !== 'p00001'));
  fs.rmSync(path.join(eu.dir, 'uploads/produtos/CM-001.webp'));
  await eu.sync(gh);
  await ela.sync(gh);
  assert.equal(ela.produtos().length, 1);
  assert.equal(ela.ler('uploads/produtos/CM-001.webp'), null);
});

test('excluído de um lado e editado do outro pede escolha', async () => {
  const { gh, eu, ela } = await cenarioInicial();
  eu.setProdutos(eu.produtos().filter((p) => p.id !== 'p00002'));
  ela.setProdutos(ela.produtos().map((p) => (p.id === 'p00002' ? { ...p, preco: 1 } : p)));
  await eu.sync(gh);
  const r = await ela.sync(gh);
  assert.equal(r.status, 'conflitos');
  assert.ok(r.conflitos[0].excluidoRemoto);
  await ela.sync(gh, { 'produto:p00002': 'local' });
  await eu.sync(gh);
  assert.equal(eu.produtos().find((p) => p.id === 'p00002').preco, 1);
});

test('se a outra máquina enviar no meio, repete e não perde nada', async () => {
  const { gh, eu, ela } = await cenarioInicial();
  eu.setProdutos(eu.produtos().map((p) => (p.id === 'p00001' ? { ...p, preco: 11 } : p)));
  ela.setProdutos(ela.produtos().map((p) => (p.id === 'p00002' ? { ...p, preco: 22 } : p)));
  gh.aoAtualizarRef(() => ela.sync(gh));
  assert.equal((await eu.sync(gh)).status, 'ok');
  await ela.sync(gh);
  for (const m of [eu, ela]) {
    const ps = m.produtos();
    assert.equal(ps.find((p) => p.id === 'p00001').preco, 11);
    assert.equal(ps.find((p) => p.id === 'p00002').preco, 22);
  }
});

test('sincronizar sem mudanças não cria commit', async () => {
  const { gh, eu } = await cenarioInicial();
  const antes = gh.refs.get('dados');
  const r = await eu.sync(gh);
  assert.equal(r.status, 'ok');
  assert.equal(gh.refs.get('dados'), antes);
});

test('primeira sincronização com os mesmos dados dos dois lados não duplica', async () => {
  const gh = githubFalso();
  const eu = maquina();
  const ela = maquina();
  for (const m of [eu, ela]) {
    m.escrever('data/categorias.json', cat);
    m.setProdutos([prod(1), prod(2)]);
  }
  ela.setProdutos([prod(1), prod(2, { preco: 5 })]);
  await eu.sync(gh);
  const r = await ela.sync(gh);
  assert.equal(r.status, 'conflitos', 'mesmo id sem histórico = mesmo produto');
  assert.equal(r.conflitos.length, 1);
  await ela.sync(gh, { 'produto:p00002': 'remoto' });
  assert.equal(ela.produtos().length, 2);
  assert.equal(ela.produtos().find((p) => p.id === 'p00002').preco, 79);
});

test('dados reais do repositório vão e voltam idênticos', async () => {
  const raiz = path.resolve(__dirname, '..');
  if (!fs.existsSync(path.join(raiz, 'data', 'produtos.json'))) return;
  const gh = githubFalso();
  const eu = maquina();
  const ela = maquina();
  for (const f of ['produtos', 'categorias', 'intro']) {
    fs.copyFileSync(path.join(raiz, 'data', `${f}.json`), path.join(eu.dir, 'data', `${f}.json`));
  }
  fs.cpSync(path.join(raiz, 'uploads'), path.join(eu.dir, 'uploads'), { recursive: true });
  assert.equal((await eu.sync(gh)).status, 'ok');
  assert.equal((await ela.sync(gh)).status, 'ok');
  assert.deepEqual(ela.produtos(), JSON.parse(fs.readFileSync(path.join(raiz, 'data', 'produtos.json'), 'utf8')).produtos);
  const fotos = fs.readdirSync(path.join(raiz, 'uploads', 'produtos')).filter((f) => !f.includes(':'));
  for (const f of fotos) {
    assert.ok(fs.readFileSync(path.join(ela.dir, 'uploads', 'produtos', f))
      .equals(fs.readFileSync(path.join(raiz, 'uploads', 'produtos', f))), f);
  }
  assert.equal((await eu.sync(gh)).resumo.enviados, 0, 'segunda sync sem mudanças');
});

test('arquivos de dados sumidos são recuperados, não apagam tudo no GitHub', async () => {
  const { gh, eu, ela } = await cenarioInicial();
  for (const f of ['produtos', 'categorias', 'intro']) fs.rmSync(path.join(ela.dir, 'data', `${f}.json`));
  const r = await ela.sync(gh);
  assert.equal(r.status, 'ok');
  assert.ok(r.resumo.mensagens.some((m) => m.includes('recuperados')));
  assert.equal(ela.produtos().length, 2, 'recuperou do GitHub');
  await eu.sync(gh);
  assert.equal(eu.produtos().length, 2, 'a outra máquina não perdeu nada');
});

test('pasta de fotos sumida é baixada de novo, não apaga as fotos do GitHub', async () => {
  const { gh, eu, ela } = await cenarioInicial();
  fs.rmSync(path.join(ela.dir, 'uploads'), { recursive: true });
  const r = await ela.sync(gh);
  assert.equal(r.status, 'ok');
  assert.equal(ela.ler('uploads/produtos/CM-001.webp'), 'FOTO-1');
  await eu.sync(gh);
  assert.equal(eu.ler('uploads/produtos/CM-001.webp'), 'FOTO-1');
  assert.ok(gh.arquivoRemoto('uploads/produtos/CM-001.webp'));
});

test('excluir um produto continua funcionando com a proteção', async () => {
  const { gh, eu, ela } = await cenarioInicial();
  eu.setProdutos(eu.produtos().slice(0, 1));
  await eu.sync(gh);
  await ela.sync(gh);
  assert.equal(ela.produtos().length, 1);
});
