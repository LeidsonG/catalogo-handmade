const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const formProduto = $('#form-produto');
const formIntro = $('#form-intro');
const lista = $('#lista');
const contador = $('#contador');
const tituloForm = $('#titulo-form');
const btnSalvar = $('#btn-salvar');
const btnLimpar = $('#btn-limpar');
const btnPdf1 = $('#btn-pdf-1');
const btnPdf2 = $('#btn-pdf-2');
const arquivoFoto = $('#arquivo-foto');
const arquivoCor = $('#arquivo-cor');
const previewFoto = $('#preview-foto');
const previewCor = $('#preview-cor');
const toast = $('#toast');

let produtos = [];

async function carregar() {
  produtos = await fetch('/api/produtos').then((r) => r.json());
  renderLista();
  const intro = await fetch('/api/intro').then((r) => r.json());
  preencherIntro(intro);
}

function renderLista() {
  contador.textContent = `${produtos.length} produto${produtos.length === 1 ? '' : 's'}`;
  if (!produtos.length) {
    lista.innerHTML = '<li class="vazio">Nenhum produto cadastrado ainda. Use o formulário ao lado para adicionar o primeiro.</li>';
    return;
  }
  lista.innerHTML = produtos.map(itemHtml).join('');
  lista.querySelectorAll('[data-editar]').forEach((el) => {
    el.addEventListener('click', () => editar(el.dataset.editar));
  });
  lista.querySelectorAll('[data-excluir]').forEach((el) => {
    el.addEventListener('click', () => excluir(el.dataset.excluir));
  });
}

function itemHtml(p) {
  const corStyle = p.corTextura
    ? `background-image:url('${p.corTextura}')`
    : 'background:#3b2416';
  return `
    <li class="item">
      <div class="item-foto">
        ${p.foto ? `<img src="${p.foto}" alt="">` : '<span style="color:#aaa;font-size:11px">sem foto</span>'}
      </div>
      <div class="item-codigo">${esc(p.codigo)}</div>
      <div class="item-nome">${esc(p.nome)}</div>
      <div class="item-rodape">
        <div class="item-cor">
          <span class="item-cor-amostra" style="${corStyle}"></span>
          <span style="font-size:11px;color:#8a6e57">${esc(p.nomeCor || '')}</span>
        </div>
        <div class="item-preco">${formatarPreco(p.preco)}</div>
      </div>
      <div class="item-acoes">
        <button class="botao botao-secundario" data-editar="${p.id}">Editar</button>
        <button class="botao botao-perigo" data-excluir="${p.id}">Excluir</button>
      </div>
    </li>
  `;
}

function esc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatarPreco(v) {
  return Number(v || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function preencherIntro(intro) {
  formIntro.elements.marca.value = intro.marca || '';
  formIntro.elements.subtitulo.value = intro.subtitulo || '';
  formIntro.elements.texto.value = intro.texto || '';
  formIntro.elements.ano.value = intro.ano || new Date().getFullYear();
  formIntro.elements.instagram.value = intro.contato?.instagram || '';
  formIntro.elements.whatsapp.value = intro.contato?.whatsapp || '';
}

formIntro.addEventListener('submit', async (e) => {
  e.preventDefault();
  const dados = {
    marca: formIntro.elements.marca.value,
    subtitulo: formIntro.elements.subtitulo.value,
    texto: formIntro.elements.texto.value,
    ano: Number(formIntro.elements.ano.value) || new Date().getFullYear(),
    contato: {
      instagram: formIntro.elements.instagram.value,
      whatsapp: formIntro.elements.whatsapp.value,
    },
  };
  const resposta = await fetch('/api/intro', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  });
  if (resposta.ok) mostrarToast('Introdução salva', 'sucesso');
  else mostrarToast('Erro ao salvar introdução', 'erro');
});

async function uploadArquivo(file, tipo) {
  const fd = new FormData();
  fd.append('arquivo', file);
  const resposta = await fetch(`/api/upload/${tipo}`, { method: 'POST', body: fd });
  if (!resposta.ok) throw new Error('Falha no upload');
  return resposta.json();
}

arquivoFoto.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const { caminho } = await uploadArquivo(file, 'foto');
    formProduto.elements.foto.value = caminho;
    previewFoto.innerHTML = `<img src="${caminho}">`;
  } catch (err) {
    mostrarToast('Erro no upload da foto', 'erro');
  }
});

arquivoCor.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const { caminho } = await uploadArquivo(file, 'cor');
    formProduto.elements.corTextura.value = caminho;
    previewCor.className = 'preview preview-cor com-textura';
    previewCor.style.backgroundImage = `url('${caminho}')`;
    previewCor.innerHTML = '';
  } catch (err) {
    mostrarToast('Erro no upload da cor', 'erro');
  }
});

formProduto.addEventListener('submit', async (e) => {
  e.preventDefault();
  const dados = {
    codigo: formProduto.elements.codigo.value,
    nome: formProduto.elements.nome.value,
    descricao: formProduto.elements.descricao.value,
    preco: Number(formProduto.elements.preco.value) || 0,
    nomeCor: formProduto.elements.nomeCor.value,
    foto: formProduto.elements.foto.value,
    corTextura: formProduto.elements.corTextura.value,
  };
  const id = formProduto.elements.id.value;
  const url = id ? `/api/produtos/${id}` : '/api/produtos';
  const metodo = id ? 'PUT' : 'POST';
  const resposta = await fetch(url, {
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  });
  if (resposta.ok) {
    mostrarToast(id ? 'Produto atualizado' : 'Produto adicionado', 'sucesso');
    limparForm();
    carregar();
  } else {
    mostrarToast('Erro ao salvar produto', 'erro');
  }
});

btnLimpar.addEventListener('click', limparForm);

function limparForm() {
  formProduto.reset();
  formProduto.elements.id.value = '';
  formProduto.elements.foto.value = '';
  formProduto.elements.corTextura.value = '';
  previewFoto.innerHTML = '';
  previewCor.className = 'preview preview-cor';
  previewCor.style.backgroundImage = '';
  previewCor.innerHTML = '';
  tituloForm.textContent = 'Novo produto';
  btnSalvar.textContent = 'Adicionar produto';
}

function editar(id) {
  const p = produtos.find((x) => x.id === id);
  if (!p) return;
  formProduto.elements.id.value = p.id;
  formProduto.elements.codigo.value = p.codigo;
  formProduto.elements.nome.value = p.nome;
  formProduto.elements.descricao.value = p.descricao;
  formProduto.elements.preco.value = p.preco;
  formProduto.elements.nomeCor.value = p.nomeCor;
  formProduto.elements.foto.value = p.foto;
  formProduto.elements.corTextura.value = p.corTextura;
  previewFoto.innerHTML = p.foto ? `<img src="${p.foto}">` : '';
  if (p.corTextura) {
    previewCor.className = 'preview preview-cor com-textura';
    previewCor.style.backgroundImage = `url('${p.corTextura}')`;
    previewCor.innerHTML = '';
  } else {
    previewCor.className = 'preview preview-cor';
    previewCor.style.backgroundImage = '';
    previewCor.innerHTML = '';
  }
  tituloForm.textContent = `Editando: ${p.nome || p.codigo}`;
  btnSalvar.textContent = 'Salvar alterações';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function excluir(id) {
  if (!confirm('Excluir este produto?')) return;
  const resposta = await fetch(`/api/produtos/${id}`, { method: 'DELETE' });
  if (resposta.ok) {
    mostrarToast('Produto excluído', 'sucesso');
    carregar();
  } else {
    mostrarToast('Erro ao excluir', 'erro');
  }
}

async function gerarPdf(layout) {
  const btn = layout === '1' ? btnPdf1 : btnPdf2;
  const textoOriginal = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Gerando…';
  try {
    const resposta = await fetch('/api/gerar-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ layout }),
    });
    if (!resposta.ok) throw new Error('Falha na geração');
    const { caminho, arquivo } = await resposta.json();
    mostrarToast(`PDF gerado: ${arquivo}`, 'sucesso');
    window.open(caminho, '_blank');
  } catch (err) {
    mostrarToast('Erro ao gerar PDF', 'erro');
  } finally {
    btn.disabled = false;
    btn.textContent = textoOriginal;
  }
}

btnPdf1.addEventListener('click', () => gerarPdf('1'));
btnPdf2.addEventListener('click', () => gerarPdf('2'));

let toastTimer = null;
function mostrarToast(msg, tipo = '') {
  toast.textContent = msg;
  toast.className = `toast visivel ${tipo}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.className = `toast ${tipo}`;
  }, 2500);
}

carregar();
