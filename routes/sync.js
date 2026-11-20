// Rotas da sincronização com o GitHub e de informações do sistema.
//   GET    /api/sistema            → versão, se está configurado, última sync
//   POST   /api/sync/config        → salva o token (depois de testar)
//   DELETE /api/sync/config        → remove o token desta máquina
//   POST   /api/sync               → sincroniza dados (+ atualiza o código no .exe)
//   GET    /api/sync/progresso     → mensagem de progresso da sync em andamento
//   GET    /api/sync/previa/:nome  → foto remota de um conflito (para comparar)
//   POST   /api/sistema/reiniciar  → reinicia o servidor (só no app empacotado)
//
// O token fica em data/sincronizacao.json, só nesta máquina: não é
// sincronizado nem vai para o GitHub.

const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ROOT, DADOS, comLock } = require('../lib/dados');
const { criarCliente } = require('../lib/github');
const sync = require('../lib/sync');
const atualizacao = require('../lib/atualizacao');

const pkg = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const CONFIG = path.join(DADOS, 'data', 'sincronizacao.json');

function lerConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG, 'utf8')); } catch { return {}; }
}

function opcoesRepo() {
  const c = pkg().catalogo || {};
  return {
    repositorio: c.repositorio,
    branchDados: c.branchDados || 'dados',
    branchCodigo: c.branchCodigo || 'main',
  };
}

function mensagemErro(err) {
  if (err.codigo === 'TOKEN_INVALIDO') return 'O token do GitHub é inválido ou expirou. Configure um novo em "Configurar sincronização".';
  if (err.codigo === 'SEM_PERMISSAO') return 'O token não tem permissão neste repositório. Ele precisa de acesso "Contents: Read and write".';
  if (err.codigo === 'SEM_REDE') return 'Sem conexão com a internet. Os cadastros continuam salvos aqui — sincronize mais tarde.';
  return err.message || 'Erro desconhecido na sincronização.';
}

let progresso = '';

const router = express.Router();

router.get('/sistema', (_req, res) => {
  const config = lerConfig();
  const estado = sync.lerEstado(DADOS);
  res.json({
    versao: pkg().version,
    empacotado: atualizacao.habilitada(ROOT),
    configurado: !!config.token,
    login: config.login || '',
    repositorio: opcoesRepo().repositorio,
    ultimaSync: estado.quando || null,
  });
});

router.post('/sync/config', async (req, res) => {
  const token = String(req.body.token || '').trim();
  if (!token) return res.status(400).json({ erro: 'Cole o token do GitHub.' });
  try {
    const gh = criarCliente({ token, repositorio: opcoesRepo().repositorio });
    const { login, podeEscrever } = await gh.verificar();
    if (!podeEscrever) return res.status(400).json({ erro: 'Esse token só pode ler o repositório. Ele precisa de "Contents: Read and write".' });
    fs.writeFileSync(CONFIG, JSON.stringify({ token, login }, null, 2));
    res.json({ ok: true, login });
  } catch (err) {
    res.status(400).json({ erro: mensagemErro(err) });
  }
});

router.delete('/sync/config', (_req, res) => {
  fs.rmSync(CONFIG, { force: true });
  res.json({ ok: true });
});

router.get('/sync/progresso', (_req, res) => {
  res.json({ emAndamento: sync.sincronizando(), mensagem: progresso });
});

router.post('/sync', async (req, res) => {
  const { token } = lerConfig();
  if (!token) return res.json({ status: 'config-necessaria' });
  const repo = opcoesRepo();
  const gh = criarCliente({ token, repositorio: repo.repositorio });
  const resolucoes = req.body?.resolucoes && typeof req.body.resolucoes === 'object' ? req.body.resolucoes : {};
  try {
    // comLock: nenhuma gravação de produto/categoria acontece no meio.
    const resultado = await comLock(() => sync.sincronizar({
      dir: DADOS,
      gh,
      branch: repo.branchDados,
      resolucoes,
      nomeMaquina: os.hostname(),
      aoProgresso: (m) => { progresso = m; },
    }));
    if (resultado.status !== 'ok') return res.json(resultado);

    let atualizacaoCodigo = { habilitada: false };
    try {
      atualizacaoCodigo = await atualizacao.atualizar({
        root: ROOT, gh, branch: repo.branchCodigo, aoProgresso: (m) => { progresso = m; },
      });
    } catch (err) {
      atualizacaoCodigo = { habilitada: true, erro: mensagemErro(err) };
    }
    res.json({ ...resultado, atualizacao: atualizacaoCodigo });
  } catch (err) {
    console.error('[sync]', err);
    res.status(err.codigo === 'EM_ANDAMENTO' ? 409 : 500).json({ erro: mensagemErro(err) });
  } finally {
    progresso = '';
  }
});

router.get('/sync/previa/:nome', (req, res) => {
  const arq = sync.caminhoPrevia(DADOS, req.params.nome);
  if (!arq) return res.status(404).end();
  res.sendFile(arq);
});

router.post('/sistema/reiniciar', (_req, res) => {
  if (!atualizacao.habilitada(ROOT)) return res.status(400).json({ erro: 'Reinicie o servidor manualmente (npm start).' });
  res.json({ ok: true });
  // Código 75: o launcher do .exe entende como "reinicie o servidor".
  setTimeout(() => process.exit(75), 300);
});

// Bloqueia gravações enquanto a sincronização roda (uploads não passam pelo
// comLock, então precisam deste bloqueio explícito).
function bloquearDuranteSync(req, res, next) {
  if (req.method !== 'GET' && sync.sincronizando() && !req.path.startsWith('/api/sync')) {
    return res.status(423).json({ erro: 'Sincronização em andamento. Aguarde terminar e tente de novo.' });
  }
  next();
}

module.exports = { router, bloquearDuranteSync };
