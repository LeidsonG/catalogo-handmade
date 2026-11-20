// Sincronização com o GitHub — parte do admin.
// Usa funções e variáveis globais de admin.js ($, carregar, mostrarToast,
// produtos, categorias, versaoFotos, esc, formatarPreco).
//
// Fluxo do botão "Sincronizar":
//   POST /api/sync → ok | conflitos | config-necessaria
//   conflitos → janela para escolher a versão de cada item → POST /api/sync de
//   novo com as escolhas (acumuladas) → ok.
//   Se veio atualização de código (app .exe), reinicia o servidor e recarrega.

const btnSincronizar = $('#btn-sincronizar');
const syncStatus = $('#sync-status');
const dlgConfig = $('#dlg-config');
const dlgConflitos = $('#dlg-conflitos');
const dlgProgresso = $('#dlg-progresso');
const dlgMensagem = $('#dlg-mensagem');

let sistema = null;
let syncRodando = false;

/* ---------- Status ---------- */

function formatarQuando(iso) {
  if (!iso) return 'nunca';
  const d = new Date(iso);
  const hoje = new Date();
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === hoje.toDateString()) return `hoje às ${hora}`;
  return `${d.toLocaleDateString('pt-BR')} às ${hora}`;
}

async function atualizarStatus() {
  try {
    sistema = await fetch('/api/sistema').then((r) => r.json());
  } catch { return; }
  $('#versao-app').textContent = `Versão ${sistema.versao}`;
  $('#cfg-repo').textContent = sistema.repositorio || '';
  if (!sistema.configurado) {
    syncStatus.innerHTML = '⚠️ <strong>Sincronização não configurada.</strong> Clique em "Configurar sincronização".';
  } else {
    syncStatus.innerHTML = `Conectado como <strong>${esc(sistema.login || 'GitHub')}</strong>.<br>Última sincronização: <strong>${formatarQuando(sistema.ultimaSync)}</strong>.`;
  }
}

function mostrarMensagem(titulo, html) {
  $('#msg-titulo').textContent = titulo;
  $('#msg-corpo').innerHTML = html;
  dlgMensagem.showModal();
}

/* ---------- Progresso ---------- */

let timerProgresso = null;
function abrirProgresso(texto) {
  $('#progresso-texto').textContent = texto;
  if (!dlgProgresso.open) dlgProgresso.showModal();
}
function fecharProgresso() {
  clearInterval(timerProgresso);
  timerProgresso = null;
  if (dlgProgresso.open) dlgProgresso.close();
}
// Esc não fecha o progresso.
dlgProgresso.addEventListener('cancel', (e) => e.preventDefault());

/* ---------- Configuração ---------- */

$('#btn-config-sync').addEventListener('click', () => {
  $('#cfg-token').value = '';
  $('#cfg-atual').textContent = sistema?.configurado
    ? `Já configurado nesta máquina (conta ${sistema.login}). Cole um token novo só se quiser trocar.`
    : '';
  dlgConfig.showModal();
});

$('#cfg-salvar').addEventListener('click', async () => {
  const token = $('#cfg-token').value.trim();
  if (!token) { mostrarToast('Cole o token primeiro', 'erro'); return; }
  $('#cfg-salvar').disabled = true;
  try {
    const r = await fetch('/api/sync/config', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }),
    });
    const d = await r.json();
    if (!r.ok) { mostrarToast(d.erro || 'Token não aceito', 'erro'); return; }
    dlgConfig.close();
    mostrarToast(`Conectado como ${d.login}`, 'sucesso');
    await atualizarStatus();
    sincronizar();
  } finally {
    $('#cfg-salvar').disabled = false;
  }
});

$('#cfg-remover').addEventListener('click', async () => {
  if (!confirm('Remover o token desta máquina? A sincronização para de funcionar até configurar de novo.')) return;
  await fetch('/api/sync/config', { method: 'DELETE' });
  dlgConfig.close();
  await atualizarStatus();
});

/* ---------- Sincronizar ---------- */

btnSincronizar.addEventListener('click', () => sincronizar());

// silencioso: usado ao abrir o app — não mostra a janela de progresso nem
// pede configuração; só avisa se algo mudou ou se há conflito para resolver.
async function sincronizar({ silencioso = false, resolucoes = {} } = {}) {
  if (syncRodando) return;
  syncRodando = true;
  btnSincronizar.disabled = true;
  btnSincronizar.textContent = '🔄 Sincronizando…';
  if (!silencioso) {
    abrirProgresso('Sincronizando…');
    timerProgresso = setInterval(async () => {
      try {
        const p = await fetch('/api/sync/progresso').then((r) => r.json());
        if (p.mensagem) $('#progresso-texto').textContent = p.mensagem;
      } catch {}
    }, 700);
  }
  let resultado;
  try {
    const r = await fetch('/api/sync', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resolucoes }),
    });
    resultado = await r.json().catch(() => ({ erro: 'Resposta inválida do servidor' }));
    if (!r.ok) throw new Error(resultado.erro || 'Erro ao sincronizar');
  } catch (err) {
    fecharProgresso();
    if (!silencioso) mostrarMensagem('Não foi possível sincronizar', `<p>${esc(err.message)}</p>`);
    else mostrarToast('Não foi possível sincronizar agora', 'erro');
    return;
  } finally {
    syncRodando = false;
    btnSincronizar.disabled = false;
    btnSincronizar.textContent = '🔄 Sincronizar';
  }
  fecharProgresso();

  if (resultado.status === 'config-necessaria') {
    if (!silencioso) $('#btn-config-sync').click();
    return;
  }
  if (resultado.status === 'conflitos') {
    abrirConflitos(resultado.conflitos, resolucoes);
    return;
  }
  await concluirSync(resultado, silencioso);
}

async function concluirSync({ resumo, atualizacao }, silencioso) {
  const recebeu = resumo.baixados + resumo.excluidosLocal > 0 || resumo.dadosMudaram;
  if (recebeu) {
    versaoFotos = Date.now();
    await carregar();
  }
  await atualizarStatus();

  if (atualizacao?.aplicada) {
    await reiniciarAposAtualizacao(atualizacao.versao);
    return;
  }

  const avisos = [...resumo.mensagens];
  if (atualizacao?.precisaInstalador) {
    avisos.push(`Existe uma versão nova do programa (${esc(atualizacao.versao || '')}) que precisa ser instalada pelo instalador novo. Os seus cadastros continuam sincronizando normalmente.`);
  }
  if (atualizacao?.erro) avisos.push(`Não foi possível verificar atualizações do programa: ${esc(atualizacao.erro)}`);

  if (avisos.length) {
    mostrarMensagem('Sincronização concluída', `<ul>${avisos.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>`);
    return;
  }
  const partes = [];
  if (resumo.enviados) partes.push('enviado');
  if (recebeu) partes.push('recebido');
  if (partes.length || !silencioso) {
    mostrarToast(partes.length ? `Sincronizado ✔ (${partes.join(' e ')})` : 'Catálogo atualizado', 'sucesso');
  }
}

async function reiniciarAposAtualizacao(versao) {
  abrirProgresso(`Atualização instalada${versao ? ` (versão ${versao})` : ''}. Reiniciando o programa…`);
  await fetch('/api/sistema/reiniciar', { method: 'POST' }).catch(() => {});
  // Espera o servidor cair e voltar.
  await new Promise((r) => setTimeout(r, 1500));
  for (let i = 0; i < 60; i += 1) {
    try {
      const r = await fetch('/api/sistema', { cache: 'no-store' });
      if (r.ok) { location.reload(); return; }
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  fecharProgresso();
  mostrarMensagem('Reinicie o programa', '<p>A atualização foi instalada, mas o programa não voltou sozinho. Feche a janela preta do Catálogo Handmade e abra de novo.</p>');
}

/* ---------- Conflitos ---------- */

const ROTULOS = {
  codigo: 'Código', nome: 'Nome', preco: 'Preço', descricao: 'Descrição', nomeCor: 'Nome da cor',
  foto: 'Foto', cor1: 'Cor base', cor2: 'Cor detalhe', ativo: 'Ativo', ordem: 'Posição na lista',
  categoriaId: 'Categoria', prefixoCodigo: 'Prefixo', marca: 'Marca', subtitulo: 'Subtítulo',
  texto: 'Texto', ano: 'Ano', contato: 'Contato',
};

function valorLegivel(campo, v) {
  if (v === undefined || v === null || v === '') return '<em>(vazio)</em>';
  if (campo === 'preco') return esc(formatarPreco(v));
  if (campo === 'ativo') return v === false ? 'Não' : 'Sim';
  if ((campo === 'cor1' || campo === 'cor2') && /^#[0-9a-f]{3,8}$/i.test(v)) {
    return `<span class="amostra-cor" style="background:${v}"></span>${esc(v)}`;
  }
  if (campo === 'categoriaId') return esc(categorias.find((c) => c.id === v)?.nome || v);
  if (campo === 'contato' && typeof v === 'object') return esc(Object.values(v).join(' · '));
  if (typeof v === 'object') return esc(JSON.stringify(v));
  return esc(String(v));
}

function tituloConflito(c) {
  if (c.tipo === 'arquivo') return `Foto ${esc(c.caminho.split('/').pop())}`;
  if (c.tipo === 'intro') return 'Introdução do catálogo';
  const item = c.local || c.remoto || {};
  if (c.tipo === 'categoria') return `Categoria "${esc(item.nome || c.id)}"`;
  return `Produto ${esc(item.codigo || '')} — ${esc(item.nome || '')}`;
}

function ladoHtml(c, lado) {
  const obj = lado === 'local' ? c.local : c.remoto;
  const cabecalho = lado === 'local' ? 'Manter a desta máquina' : 'Manter a da outra máquina';
  let corpo;
  if (c.tipo === 'arquivo') {
    const existe = lado === 'local' ? c.localExiste : c.remotoExiste;
    if (!existe) corpo = '<span class="conflito-excluido">Foto apagada</span>';
    else if (lado === 'local') corpo = `<img src="/${esc(c.caminho)}?v=${Date.now()}" alt="">`;
    else corpo = `<img src="/api/sync/previa/${c.remotoSha}${esc(c.caminho.slice(c.caminho.lastIndexOf('.')).toLowerCase())}" alt="">`;
  } else if (!obj) {
    corpo = `<span class="conflito-excluido">${c.tipo === 'produto' ? 'Produto excluído' : 'Excluída'}</span>`;
  } else {
    // Mostra os campos em conflito (destacados) e, para produtos, os principais.
    const campos = c.campos.length ? [...c.campos] : [];
    const basicos = c.tipo === 'produto' ? ['codigo', 'nome', 'preco'] : c.tipo === 'categoria' ? ['nome'] : [];
    for (const k of basicos) if (!campos.includes(k)) campos.push(k);
    corpo = campos.map((k) => `
      <div class="conflito-campo${c.campos.includes(k) ? ' diferente' : ''}">
        <span>${esc(ROTULOS[k] || k)}</span><span>${valorLegivel(k, obj[k])}</span>
      </div>`).join('');
  }
  return `
    <label class="conflito-opcao" data-lado="${lado}">
      <input type="radio" name="conf-${esc(c.chave)}" value="${lado}">
      <span class="conflito-opcao-cabecalho">${cabecalho}</span>
      ${corpo}
    </label>`;
}

let conflitosAtuais = [];
let resolucoesAnteriores = {};
const escolhas = new Map();

function abrirConflitos(conflitos, anteriores) {
  conflitosAtuais = conflitos;
  resolucoesAnteriores = anteriores;
  escolhas.clear();
  $('#lista-conflitos').innerHTML = conflitos.map((c, i) => `
    <div class="conflito" data-i="${i}">
      <div class="conflito-titulo">${tituloConflito(c)}</div>
      <div class="conflito-opcoes">${ladoHtml(c, 'local')}${ladoHtml(c, 'remoto')}</div>
    </div>`).join('');
  atualizarBotaoContinuar();
  dlgConflitos.showModal();
}

function escolher(i, lado) {
  escolhas.set(conflitosAtuais[i].chave, lado);
  const bloco = $(`#lista-conflitos .conflito[data-i="${i}"]`);
  bloco.querySelectorAll('.conflito-opcao').forEach((el) => el.classList.toggle('escolhida', el.dataset.lado === lado));
  atualizarBotaoContinuar();
}

function atualizarBotaoContinuar() {
  const faltam = conflitosAtuais.length - escolhas.size;
  const btn = $('#conf-continuar');
  btn.disabled = faltam > 0;
  btn.textContent = faltam > 0 ? `Escolha mais ${faltam}` : 'Continuar sincronização';
}

$('#lista-conflitos').addEventListener('click', (e) => {
  const opcao = e.target.closest('.conflito-opcao');
  if (!opcao) return;
  e.preventDefault();
  escolher(Number(opcao.closest('.conflito').dataset.i), opcao.dataset.lado);
});
$('#conf-todos-local').addEventListener('click', () => conflitosAtuais.forEach((_, i) => escolher(i, 'local')));
$('#conf-todos-remoto').addEventListener('click', () => conflitosAtuais.forEach((_, i) => escolher(i, 'remoto')));
$('#conf-cancelar').addEventListener('click', () => {
  dlgConflitos.close();
  mostrarToast('Sincronização não concluída — nada foi alterado', '');
});
$('#conf-continuar').addEventListener('click', () => {
  dlgConflitos.close();
  sincronizar({ resolucoes: { ...resolucoesAnteriores, ...Object.fromEntries(escolhas) } });
});

/* ---------- Início ---------- */

(async () => {
  await atualizarStatus();
  if (sistema?.configurado) sincronizar({ silencioso: true });
})();
