const $ = (sel) => document.querySelector(sel);

const formProduto = $('#form-produto');
const formIntro = $('#form-intro');
const formCategoria = $('#form-categoria');
const listaCategorias = $('#lista-categorias');
const selectCategoriaProduto = $('#select-categoria-produto');
const seletorCategoriaPdf = $('#seletor-categoria-pdf');
const filtroCategoriaLista = $('#filtro-categoria-lista');
const buscaProduto = $('#busca-produto');
const btnBuscar = $('#btn-buscar');
const grupos = $('#grupos');
const contador = $('#contador');

let filtroCategoria = '';
let filtroTexto = '';
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
    <li class="categoria-item" draggable="true" data-id="${c.id}">
      <span class="categoria-drag" title="Arraste para reordenar">⋮⋮</span>
      <span class="categoria-nome">${esc(c.nome)}</span>
      ${c.prefixoCodigo ? `<span class="categoria-prefixo" title="Prefixo do código">${esc(c.prefixoCodigo)}</span>` : ''}
      <span class="categoria-acoes">
        <button class="botao botao-fantasma botao-mini" data-editar-cat="${c.id}">Editar</button>
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
  ativarDragCategorias();
}

let dragCatId = null;

function ativarDragCategorias() {
  listaCategorias.querySelectorAll('.categoria-item').forEach((el) => {
    el.addEventListener('dragstart', (e) => {
      dragCatId = el.dataset.id;
      el.classList.add('arrastando');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', el.dataset.id);
    });
    el.addEventListener('dragend', () => {
      el.classList.remove('arrastando');
      listaCategorias.querySelectorAll('.alvo-drop').forEach((x) => x.classList.remove('alvo-drop'));
      dragCatId = null;
    });
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!dragCatId || el.dataset.id === dragCatId) return;
      listaCategorias.querySelectorAll('.alvo-drop').forEach((x) => x.classList.remove('alvo-drop'));
      el.classList.add('alvo-drop');
    });
    el.addEventListener('drop', async (e) => {
      e.preventDefault();
      const origemId = dragCatId;
      const destinoId = el.dataset.id;
      if (!origemId || origemId === destinoId) return;
      const idsAtuais = Array.from(listaCategorias.querySelectorAll('.categoria-item')).map((x) => x.dataset.id);
      const novaOrdem = idsAtuais.filter((id) => id !== origemId);
      const idxDestino = novaOrdem.indexOf(destinoId);
      novaOrdem.splice(idxDestino, 0, origemId);
      await reordenarCategorias(novaOrdem);
    });
  });
}

async function reordenarCategorias(ordemIds) {
  const resposta = await fetch('/api/categorias/reordenar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ordemIds }),
  });
  if (resposta.ok) carregar();
  else mostrarToast('Erro ao reordenar', 'erro');
}

function popularSelectsCategoria() {
  const opcoesProduto = categorias
    .map((c) => `<option value="${c.id}">${esc(c.nome)}</option>`)
    .join('');

  selectCategoriaProduto.innerHTML = categorias.length
    ? `<option value="">— selecione —</option>${opcoesProduto}`
    : '<option value="">— crie uma categoria antes —</option>';

  const contagem = new Map();
  for (const p of produtos) {
    contagem.set(p.categoriaId, (contagem.get(p.categoriaId) || 0) + 1);
  }
  const opcoesPdf = categorias.map((c) => {
    const n = contagem.get(c.id) || 0;
    const sufixo = n === 0 ? ' (vazia)' : ` (${n})`;
    return `<option value="${c.id}"${n === 0 ? ' disabled' : ''}>${esc(c.nome)}${sufixo}</option>`;
  }).join('');

  const valorPdfAtual = seletorCategoriaPdf.value;
  seletorCategoriaPdf.innerHTML = categorias.length
    ? opcoesPdf
    : '<option value="">(sem categorias)</option>';
  if (categorias.find((c) => c.id === valorPdfAtual && (contagem.get(c.id) || 0) > 0)) {
    seletorCategoriaPdf.value = valorPdfAtual;
  }

  // Filtro da lista de produtos: "Todas" + cada categoria com contador
  const opcoesFiltro = categorias.map((c) => {
    const n = contagem.get(c.id) || 0;
    return `<option value="${c.id}">${esc(c.nome)} (${n})</option>`;
  }).join('');
  filtroCategoriaLista.innerHTML = `<option value="">Todas as categorias</option>${opcoesFiltro}`;
  if (filtroCategoria && categorias.find((c) => c.id === filtroCategoria)) {
    filtroCategoriaLista.value = filtroCategoria;
  } else {
    filtroCategoria = '';
    filtroCategoriaLista.value = '';
  }
}

filtroCategoriaLista.addEventListener('change', () => {
  filtroCategoria = filtroCategoriaLista.value;
  renderProdutos();
});

function aplicarBusca() {
  filtroTexto = buscaProduto.value;
  renderProdutos();
}

btnBuscar.addEventListener('click', aplicarBusca);
buscaProduto.addEventListener('keydown', (e) => { if (e.key === 'Enter') aplicarBusca(); });
buscaProduto.addEventListener('search', aplicarBusca); // limpa com o ×

formCategoria.addEventListener('submit', async (e) => {
  e.preventDefault();
  const nome = formCategoria.elements.nome.value.trim();
  // Input só aceita letras/números; backend adiciona "-" automaticamente.
  const prefixoCodigo = formCategoria.elements.prefixoCodigo.value.trim().replace(/[^A-Za-z0-9]/g, '');
  if (!nome) return;
  const id = formCategoria.elements.id.value;
  const url = id ? `/api/categorias/${id}` : '/api/categorias';
  const metodo = id ? 'PUT' : 'POST';
  const resposta = await fetch(url, {
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome, prefixoCodigo }),
  });
  if (resposta.ok) {
    mostrarToast(id ? 'Categoria atualizada' : 'Categoria adicionada', 'sucesso');
    limparFormCategoria();
    recarregarPagina();
  } else {
    const { erro } = await resposta.json().catch(() => ({}));
    mostrarToast(erro || 'Erro ao salvar categoria', 'erro');
  }
});

btnCancelarCategoria.addEventListener('click', limparFormCategoria);

// Bloqueia caracteres inválidos no input de prefixo em tempo real
formCategoria.elements.prefixoCodigo.addEventListener('input', (e) => {
  const limpo = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (limpo !== e.target.value) e.target.value = limpo;
});

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
  // Remove o "-" final do prefixo salvo para mostrar só o que o usuário digitou
  formCategoria.elements.prefixoCodigo.value = (c.prefixoCodigo || '').replace(/-+$/, '');
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
    recarregarPagina();
  } else {
    const { erro } = await resposta.json().catch(() => ({}));
    mostrarToast(erro || 'Erro ao excluir', 'erro');
  }
}

/* ---------- Produtos ---------- */

function renderProdutos() {
  const q = filtroTexto.trim().toLowerCase();

  const porCategoria = new Map(categorias.map((c) => [c.id, []]));
  const semCategoria = [];
  for (const p of produtos) {
    if (porCategoria.has(p.categoriaId)) porCategoria.get(p.categoriaId).push(p);
    else semCategoria.push(p);
  }

  const categoriasFiltradas = filtroCategoria
    ? categorias.filter((c) => c.id === filtroCategoria)
    : categorias;
  const mostrarSemCategoria = !filtroCategoria && semCategoria.length;

  let totalVisiveis = 0;
  let html = '';
  for (const cat of categoriasFiltradas) {
    const itens = (porCategoria.get(cat.id) || [])
      .filter((p) => !q || p.nome.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q));
    totalVisiveis += itens.length;
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
  if (mostrarSemCategoria) {
    const itensSemCat = semCategoria.filter(
      (p) => !q || p.nome.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q),
    );
    totalVisiveis += itensSemCat.length;
    if (itensSemCat.length) {
      html += `
        <section class="grupo grupo-orfao">
          <h3 class="grupo-titulo">
            Sem categoria
            <span class="grupo-contador">${itensSemCat.length}</span>
          </h3>
          <div class="grupo-aviso">Estes produtos foram cadastrados antes do sistema de categorias. Edite cada um para atribuir uma categoria.</div>
          <ul class="lista">${itensSemCat.map(itemHtml).join('')}</ul>
        </section>
      `;
    }
  }
  if (!html) {
    html = `<div class="vazio">${q ? 'Nenhum produto encontrado para "' + q + '".' : 'Nenhum produto nessa categoria.'}</div>`;
  }
  contador.textContent = `${totalVisiveis} produto${totalVisiveis === 1 ? '' : 's'}${q ? ` encontrado${totalVisiveis === 1 ? '' : 's'}` : ''}`;
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
          <span class="item-cor-nome">${esc(p.nomeCor || '')}</span>
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
  if (resposta.ok) {
    mostrarToast('Introdução salva', 'sucesso');
    recarregarPagina();
  } else {
    mostrarToast('Erro ao salvar introdução', 'erro');
  }
});

/* ---------- Upload ---------- */

async function uploadArquivo(file, tipo, codigo) {
  const fd = new FormData();
  fd.append('arquivo', file);
  const qs = codigo ? `?codigo=${encodeURIComponent(codigo)}` : '';
  const resposta = await fetch(`/api/upload/${tipo}${qs}`, { method: 'POST', body: fd });
  if (!resposta.ok) throw new Error('Falha no upload');
  return resposta.json();
}

function codigoPreenchidoOuAvisa() {
  const codigo = formProduto.elements.codigo.value.trim();
  if (!codigo) {
    mostrarToast('Preencha o código do produto antes do upload', 'erro');
    formProduto.elements.codigo.focus();
    return null;
  }
  return codigo;
}

arquivoFoto.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const codigo = codigoPreenchidoOuAvisa();
  if (!codigo) {
    arquivoFoto.value = '';
    return;
  }
  try {
    const { caminho } = await uploadArquivo(file, 'foto', codigo);
    formProduto.elements.foto.value = caminho;
    previewFoto.innerHTML = `<img src="${caminho}?t=${Date.now()}">`;
  } catch (err) {
    mostrarToast('Erro no upload da foto', 'erro');
  }
});

arquivoCor.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const codigo = codigoPreenchidoOuAvisa();
  if (!codigo) {
    arquivoCor.value = '';
    return;
  }
  try {
    const { caminho } = await uploadArquivo(file, 'cor', codigo);
    formProduto.elements.corTextura.value = caminho;
    previewCor.className = 'preview preview-cor com-textura';
    previewCor.style.backgroundImage = `url('${caminho}?t=${Date.now()}')`;
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
    recarregarPagina();
  } else {
    const erroBody = await resposta.json().catch(() => ({}));
    // 409: código duplicado. Oferece a sugestão (próximo código da categoria).
    if (resposta.status === 409 && erroBody.sugestao) {
      const usar = confirm(`${erroBody.erro}\n\nUsar o próximo código disponível: "${erroBody.sugestao}"?`);
      if (usar) {
        formProduto.elements.codigo.value = erroBody.sugestao;
        formProduto.elements.codigo.focus();
        mostrarToast(`Código alterado para ${erroBody.sugestao}. Clique em salvar novamente.`, 'sucesso');
      }
    } else if (resposta.status === 409) {
      // Conflito mas sem sugestão (categoria sem prefixo definido)
      alert(erroBody.erro || 'Código já existe.');
    } else {
      mostrarToast(erroBody.erro || 'Erro ao salvar produto', 'erro');
    }
  }
});

selectCategoriaProduto.addEventListener('change', sugerirCodigo);

async function sugerirCodigo() {
  // Só sugere ao criar produto novo, e só se o campo de código estiver vazio.
  if (formProduto.elements.id.value) return;
  if (formProduto.elements.codigo.value.trim()) return;
  const categoriaId = selectCategoriaProduto.value;
  if (!categoriaId) return;
  try {
    const resp = await fetch(`/api/categorias/${categoriaId}/proximo-codigo`);
    if (!resp.ok) return;
    const { codigo } = await resp.json();
    if (codigo) formProduto.elements.codigo.value = codigo;
  } catch {}
}

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
  const bloco = formProduto.closest('.bloco');
  setTimeout(() => {
    bloco.classList.remove('bloco-flash');
    void bloco.offsetWidth; // reinicia animação se chamar editar() duas vezes seguidas
    bloco.classList.add('bloco-flash');
    bloco.addEventListener('animationend', () => bloco.classList.remove('bloco-flash'), { once: true });
  }, 300);
}

async function excluir(id) {
  if (!confirm('Excluir este produto?')) return;
  const resposta = await fetch(`/api/produtos/${id}`, { method: 'DELETE' });
  if (resposta.ok) {
    mostrarToast('Produto excluído', 'sucesso');
    recarregarPagina();
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
    const { caminho, arquivo, aviso } = await resposta.json();
    if (aviso) mostrarToast(`PDF gerado, mas: ${aviso}`, 'erro');
    else mostrarToast(`PDF gerado: ${arquivo}`, 'sucesso');
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

/* ---------- Trocar senha ---------- */

const btnTrocarSenha = $('#btn-trocar-senha');
btnTrocarSenha.addEventListener('click', async () => {
  const senhaAtual = prompt('Senha atual:');
  if (senhaAtual === null) return;
  const senhaNova = prompt('Nova senha (mín. 6 caracteres):');
  if (senhaNova === null) return;
  const senhaNovaConfirma = prompt('Confirme a nova senha:');
  if (senhaNovaConfirma === null) return;
  if (senhaNova !== senhaNovaConfirma) {
    mostrarToast('As senhas não coincidem', 'erro');
    return;
  }
  const resposta = await fetch('/api/auth/trocar-senha', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ senhaAtual, senhaNova }),
  });
  if (resposta.ok) {
    alert('Senha alterada com sucesso!\n\nO navegador ainda guarda a senha antiga da sessão. Feche todas as abas do admin e abra de novo para entrar com a senha nova.');
  } else {
    const { erro } = await resposta.json().catch(() => ({}));
    mostrarToast(erro || 'Erro ao trocar senha', 'erro');
  }
});

/* ---------- Reload ---------- */

// Após salvar/excluir, recarrega a página inteira para garantir que tudo
// que está na tela (incluindo imagens que podem estar em cache) reflita
// o novo estado. Pequeno delay para o toast de sucesso ser visível antes.
function recarregarPagina() {
  setTimeout(() => location.reload(), 700);
}

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
