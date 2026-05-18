const $ = (sel) => document.querySelector(sel);

const formProduto = $('#form-produto');
const formIntro = $('#form-intro');
const formCategoria = $('#form-categoria');
const listaCategorias = $('#lista-categorias');
const selectCategoriaProduto = $('#select-categoria-produto');
const seletorCategoriaPdf = $('#seletor-categoria-pdf');
const grupos = $('#grupos');
const contador = $('#contador');
const tituloForm = $('#titulo-form');
const btnSalvar = $('#btn-salvar');
const btnLimpar = $('#btn-limpar');
const btnSalvarCategoria = $('#btn-salvar-categoria');
const btnCancelarCategoria = $('#btn-cancelar-categoria');
const btnPdf1 = $('#btn-pdf-1');
const btnPdf2 = $('#btn-pdf-2');
const arquivoFoto = $('#arquivo-foto');
const arquivoCor = $('#arquivo-cor');
const previewFoto = $('#preview-foto');
const previewCor = $('#preview-cor');
const toast = $('#toast');

let produtos = [];
let categorias = [];

async function carregar() {
  const [pProds, pCats, pIntro] = await Promise.all([
    fetch('/api/produtos').then((r) => r.json()),
    fetch('/api/categorias').then((r) => r.json()),
    fetch('/api/intro').then((r) => r.json()),
  ]);
  produtos = pProds;
  categorias = pCats;
  renderCategorias();
  popularSelectsCategoria();
  renderProdutos();
  preencherIntro(pIntro);
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

/* ---------- Categorias ---------- */

function renderCategorias() {
  if (!categorias.length) {
    listaCategorias.innerHTML = '<li class="vazio-cat">Nenhuma categoria. Crie uma acima para começar.</li>';
    return;
  }
  listaCategorias.innerHTML = categorias.map((c) => `
    <li class="categoria-item" data-id="${c.id}">
      <span class="categoria-nome">${esc(c.nome)}</span>
      <span class="categoria-acoes">
        <button class="botao botao-fantasma botao-mini" data-editar-cat="${c.id}">Renomear</button>
        <button class="botao botao-perigo botao-mini" data-excluir-cat="${c.id}">Excluir</button>
      </span>
    </li>
  `).join('');
  listaCategorias.querySelectorAll('[data-editar-cat]').forEach((el) => {
    el.addEventListener('click', () => editarCategoria(el.dataset.editarCat));
  });
  listaCategorias.querySelectorAll('[data-excluir-cat]').forEach((el) => {
    el.addEventListener('click', () => excluirCategoria(el.dataset.excluirCat));
  });
}

function popularSelectsCategoria() {
  const opcoes = categorias.length
    ? categorias.map((c) => `<option value="${c.id}">${esc(c.nome)}</option>`).join('')
    : '';

  selectCategoriaProduto.innerHTML = categorias.length
    ? `<option value="">— selecione —</option>${opcoes}`
    : '<option value="">— crie uma categoria antes —</option>';

  const valorPdfAtual = seletorCategoriaPdf.value;
  seletorCategoriaPdf.innerHTML = categorias.length
    ? opcoes
    : '<option value="">(sem categorias)</option>';
  if (categorias.find((c) => c.id === valorPdfAtual)) {
    seletorCategoriaPdf.value = valorPdfAtual;
  }
}

formCategoria.addEventListener('submit', async (e) => {
  e.preventDefault();
  const nome = formCategoria.elements.nome.value.trim();
  if (!nome) return;
  const id = formCategoria.elements.id.value;
  const url = id ? `/api/categorias/${id}` : '/api/categorias';
  const metodo = id ? 'PUT' : 'POST';
  const resposta = await fetch(url, {
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome }),
  });
  if (resposta.ok) {
    mostrarToast(id ? 'Categoria renomeada' : 'Categoria adicionada', 'sucesso');
    limparFormCategoria();
    carregar();
  } else {
    const { erro } = await resposta.json().catch(() => ({}));
    mostrarToast(erro || 'Erro ao salvar categoria', 'erro');
  }
});

btnCancelarCategoria.addEventListener('click', limparFormCategoria);

function limparFormCategoria() {
  formCategoria.reset();
  formCategoria.elements.id.value = '';
  btnSalvarCategoria.textContent = 'Adicionar';
  btnCancelarCategoria.classList.add('escondido');
}

function editarCategoria(id) {
  const c = categorias.find((x) => x.id === id);
  if (!c) return;
  formCategoria.elements.id.value = c.id;
  formCategoria.elements.nome.value = c.nome;
  btnSalvarCategoria.textContent = 'Salvar';
  btnCancelarCategoria.classList.remove('escondido');
  formCategoria.elements.nome.focus();
}

async function excluirCategoria(id) {
  const c = categorias.find((x) => x.id === id);
  if (!c) return;
  if (!confirm(`Excluir a categoria "${c.nome}"?`)) return;
  const resposta = await fetch(`/api/categorias/${id}`, { method: 'DELETE' });
  if (resposta.ok) {
    mostrarToast('Categoria excluída', 'sucesso');
    carregar();
  } else {
    const { erro } = await resposta.json().catch(() => ({}));
    mostrarToast(erro || 'Erro ao excluir', 'erro');
  }
}

/* ---------- Produtos ---------- */

function renderProdutos() {
  contador.textContent = `${produtos.length} produto${produtos.length === 1 ? '' : 's'}`;
  if (!produtos.length) {
    grupos.innerHTML = '<div class="vazio">Nenhum produto cadastrado ainda.</div>';
    return;
  }
  const porCategoria = new Map(categorias.map((c) => [c.id, []]));
  const semCategoria = [];
  for (const p of produtos) {
    if (porCategoria.has(p.categoriaId)) porCategoria.get(p.categoriaId).push(p);
    else semCategoria.push(p);
  }

  let html = '';
  for (const cat of categorias) {
    const itens = porCategoria.get(cat.id) || [];
    html += `
      <section class="grupo">
        <h3 class="grupo-titulo">
          ${esc(cat.nome)}
          <span class="grupo-contador">${itens.length}</span>
        </h3>
        ${itens.length
          ? `<ul class="lista">${itens.map(itemHtml).join('')}</ul>`
          : '<div class="grupo-vazio">Sem produtos nesta categoria.</div>'}
      </section>
    `;
  }
  if (semCategoria.length) {
    html += `
      <section class="grupo grupo-orfao">
        <h3 class="grupo-titulo">
          Sem categoria
          <span class="grupo-contador">${semCategoria.length}</span>
        </h3>
        <div class="grupo-aviso">Estes produtos foram cadastrados antes do sistema de categorias. Edite cada um para atribuir uma categoria.</div>
        <ul class="lista">${semCategoria.map(itemHtml).join('')}</ul>
      </section>
    `;
  }
  grupos.innerHTML = html;
  grupos.querySelectorAll('[data-editar]').forEach((el) => {
    el.addEventListener('click', () => editar(el.dataset.editar));
  });
  grupos.querySelectorAll('[data-excluir]').forEach((el) => {
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

/* ---------- Introdução ---------- */

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

/* ---------- Upload ---------- */

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

/* ---------- Produto (formulário) ---------- */

formProduto.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!categorias.length) {
    mostrarToast('Crie uma categoria antes de cadastrar produtos', 'erro');
    return;
  }
  const categoriaId = formProduto.elements.categoriaId.value;
  if (!categoriaId) {
    mostrarToast('Escolha uma categoria para o produto', 'erro');
    return;
  }
  const dados = {
    categoriaId,
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
    const { erro } = await resposta.json().catch(() => ({}));
    mostrarToast(erro || 'Erro ao salvar produto', 'erro');
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
  formProduto.elements.categoriaId.value = p.categoriaId || '';
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

/* ---------- Gerar PDF ---------- */

async function gerarPdf(layout) {
  if (!categorias.length) {
    mostrarToast('Crie ao menos uma categoria antes de gerar PDF', 'erro');
    return;
  }
  const categoriaId = seletorCategoriaPdf.value;
  if (!categoriaId) {
    mostrarToast('Escolha uma categoria para gerar o PDF', 'erro');
    return;
  }
  const btn = layout === '1' ? btnPdf1 : btnPdf2;
  const textoOriginal = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Gerando…';
  try {
    const resposta = await fetch('/api/gerar-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ layout, categoriaId }),
    });
    if (!resposta.ok) {
      const { erro } = await resposta.json().catch(() => ({}));
      throw new Error(erro || 'Falha na geração');
    }
    const { caminho, arquivo } = await resposta.json();
    mostrarToast(`PDF gerado: ${arquivo}`, 'sucesso');
    window.open(caminho, '_blank');
  } catch (err) {
    mostrarToast(err.message || 'Erro ao gerar PDF', 'erro');
  } finally {
    btn.disabled = false;
    btn.textContent = textoOriginal;
  }
}

btnPdf1.addEventListener('click', () => gerarPdf('1'));
btnPdf2.addEventListener('click', () => gerarPdf('2'));

/* ---------- Toast ---------- */

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
