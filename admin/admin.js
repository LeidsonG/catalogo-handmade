// Frontend do painel admin (JS puro, sem framework). Cliente da API HTTP:
// carrega produtos/categorias/intro, faz o CRUD via fetch, controla os forms,
// o filtro/busca da lista, o drag-and-drop de categorias, os uploads e o
// disparo da geração de PDF. Toda a persistência acontece no servidor.

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
const btnPdf2 = $('#btn-pdf-2');
const btnPdf3 = $('#btn-pdf-3');
const arquivoFoto = $('#arquivo-foto');
const previewFoto = $('#preview-foto');
const previewCor = $('#preview-cor');
const inputCor1 = $('#cor1');
const inputCor2 = $('#cor2');
const usarCor2 = $('#usar-cor2');
const cor2Wrap = $('#cor2-wrap');
const toast = $('#toast');

let produtos = [];
let categorias = [];
let prefixoAtual = '';

function atualizarEstadoForm() {
  const temCategoria = !!selectCategoriaProduto.value;
  const temCodigo = !!formProduto.elements.codigo.value.trim();

  formProduto.elements.codigo.disabled = !temCategoria;

  const camposResto = [
    formProduto.elements.nome,
    formProduto.elements.preco,
    formProduto.elements.descricao,
    formProduto.elements.nomeCor,
    arquivoFoto,
    btnSalvar,
  ];
  for (const el of camposResto) el.disabled = !temCodigo;
}

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
  atualizarEstadoForm();
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

// CSS de fundo da amostra: sólido (só cor1) ou dividido na diagonal de
// cima-esquerda p/ baixo-direita (gradiente 45° com corte seco em 50%).
function fundoAmostra(c1, c2) {
  const base = c1 || '#3b2416';
  return c2
    ? `background:linear-gradient(45deg, ${base} 50%, ${c2} 50%)`
    : `background:${base}`;
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
    const todosDaCategoria = porCategoria.get(cat.id) || [];
    const itens = todosDaCategoria
      .filter((p) => !q || p.nome.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q));
    totalVisiveis += itens.length;
    const todosAtivos = todosDaCategoria.length > 0 && todosDaCategoria.every((p) => p.ativo !== false);
    const btnBulk = todosDaCategoria.length
      ? `<button class="botao botao-fantasma grupo-btn-bulk" data-bulk-catid="${cat.id}" data-bulk-ativo="${todosAtivos ? 'false' : 'true'}">${todosAtivos ? 'Desativar todos' : 'Ativar todos'}</button>`
      : '';
    html += `
      <section class="grupo">
        <h3 class="grupo-titulo">
          ${esc(cat.nome)}
          <span class="grupo-contador">${itens.length}</span>
          ${btnBulk}
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
  grupos.querySelectorAll('[data-toggle-ativo]').forEach((el) => {
    el.addEventListener('click', () => alternarAtivo(el.dataset.toggleAtivo));
  });
  grupos.querySelectorAll('[data-bulk-catid]').forEach((el) => {
    el.addEventListener('click', () => alternarAtivosGrupo(el.dataset.bulkCatid, el.dataset.bulkAtivo === 'true'));
  });
}

function itemHtml(p) {
  const corStyle = fundoAmostra(p.cor1, p.cor2);
  const inativo = p.ativo === false;
  return `
    <li class="item${inativo ? ' item-inativo' : ''}">
      ${inativo ? '<span class="item-badge">Inativo</span>' : ''}
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
        <button class="botao botao-fantasma" data-toggle-ativo="${p.id}">${inativo ? 'Ativar' : 'Desativar'}</button>
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

/* ---------- Cores do produto ---------- */

// Atualiza o círculo de prévia conforme cor1, cor2 e o toggle "duas cores".
function atualizarPreviewCor() {
  const c1 = inputCor1.value;
  const c2 = usarCor2.checked ? inputCor2.value : '';
  previewCor.style.cssText = fundoAmostra(c1, c2);
}

usarCor2.addEventListener('change', () => {
  cor2Wrap.hidden = !usarCor2.checked;
  atualizarPreviewCor();
});
inputCor1.addEventListener('input', atualizarPreviewCor);
inputCor1.addEventListener('change', atualizarPreviewCor);
inputCor2.addEventListener('input', atualizarPreviewCor);
inputCor2.addEventListener('change', atualizarPreviewCor);

// Conta-gota: amostra a cor de um pixel da foto do produto já carregada.
// alvoContaGota guarda qual input ('cor1'/'cor2') receberá a cor no próximo
// clique sobre a foto.
let alvoContaGota = null;

document.querySelectorAll('[data-conta-gota]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const img = previewFoto.querySelector('img');
    if (!img) {
      mostrarToast('Carregue a foto do produto antes de usar o conta-gota', 'erro');
      return;
    }
    alvoContaGota = btn.dataset.contaGota;
    previewFoto.classList.add('amostrando');
    mostrarToast('Clique na foto para escolher a cor', 'sucesso');
  });
});

// Lê a cor RGB de um pixel da foto a partir do clique, considerando o
// letterbox do object-fit: contain. Pixels transparentes (PNG sem fundo)
// são ignorados para não amostrar o "vazio" em vez do couro.
function corDoPixel(img, ev) {
  const rect = img.getBoundingClientRect();
  const escala = Math.min(rect.width / img.naturalWidth, rect.height / img.naturalHeight);
  const larguraExibida = img.naturalWidth * escala;
  const alturaExibida = img.naturalHeight * escala;
  const offsetX = (rect.width - larguraExibida) / 2;
  const offsetY = (rect.height - alturaExibida) / 2;
  const x = (ev.clientX - rect.left - offsetX) / escala;
  const y = (ev.clientY - rect.top - offsetY) / escala;
  if (x < 0 || y < 0 || x >= img.naturalWidth || y >= img.naturalHeight) return null;

  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const [r, g, b, a] = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
  if (a === 0) return null;
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

previewFoto.addEventListener('click', (ev) => {
  if (!alvoContaGota) return;
  const img = previewFoto.querySelector('img');
  if (!img) return;
  const cor = corDoPixel(img, ev);
  if (!cor) {
    mostrarToast('Pixel transparente — clique sobre o produto', 'erro');
    return;
  }
  if (alvoContaGota === 'cor2' && !usarCor2.checked) {
    usarCor2.checked = true;
    cor2Wrap.hidden = false;
  }
  (alvoContaGota === 'cor2' ? inputCor2 : inputCor1).value = cor;
  atualizarPreviewCor();
  alvoContaGota = null;
  previewFoto.classList.remove('amostrando');
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
    codigo: prefixoAtual + formProduto.elements.codigo.value,
    nome: formProduto.elements.nome.value,
    descricao: formProduto.elements.descricao.value,
    preco: Number(formProduto.elements.preco.value) || 0,
    nomeCor: formProduto.elements.nomeCor.value,
    foto: formProduto.elements.foto.value,
    cor1: inputCor1.value,
    cor2: usarCor2.checked ? inputCor2.value : '',
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
        const sugestaoNum = prefixoAtual && erroBody.sugestao.startsWith(prefixoAtual)
          ? erroBody.sugestao.slice(prefixoAtual.length)
          : erroBody.sugestao;
        formProduto.elements.codigo.value = sugestaoNum;
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

selectCategoriaProduto.addEventListener('change', () => {
  atualizarPrefixoCodigo(selectCategoriaProduto.value);
  atualizarEstadoForm();
  sugerirCodigo();
});

formProduto.elements.codigo.addEventListener('input', atualizarEstadoForm);

function atualizarPrefixoCodigo(categoriaId) {
  const cat = categorias.find((c) => c.id === categoriaId);
  prefixoAtual = (cat && cat.prefixoCodigo) ? cat.prefixoCodigo : '';
  document.getElementById('codigo-prefixo-exibido').textContent = prefixoAtual;
}

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
    if (codigo) {
      const numero = prefixoAtual && codigo.startsWith(prefixoAtual)
        ? codigo.slice(prefixoAtual.length)
        : codigo;
      formProduto.elements.codigo.value = numero;
      atualizarEstadoForm();
    }
  } catch {}
}

btnLimpar.addEventListener('click', limparForm);

function limparForm() {
  formProduto.reset();
  formProduto.elements.id.value = '';
  formProduto.elements.foto.value = '';
  prefixoAtual = '';
  document.getElementById('codigo-prefixo-exibido').textContent = '';
  atualizarEstadoForm();
  previewFoto.innerHTML = '';
  previewFoto.classList.remove('amostrando');
  alvoContaGota = null;
  inputCor1.value = '#3b2416';
  inputCor2.value = '#caa472';
  usarCor2.checked = false;
  cor2Wrap.hidden = true;
  atualizarPreviewCor();
  tituloForm.textContent = 'Novo produto';
  btnSalvar.textContent = 'Adicionar produto';
}

function editar(id) {
  const p = produtos.find((x) => x.id === id);
  if (!p) return;
  formProduto.elements.id.value = p.id;
  formProduto.elements.categoriaId.value = p.categoriaId || '';
  atualizarPrefixoCodigo(p.categoriaId || '');
  const codigoNumero = prefixoAtual && p.codigo.startsWith(prefixoAtual)
    ? p.codigo.slice(prefixoAtual.length)
    : p.codigo;
  formProduto.elements.codigo.value = codigoNumero;
  formProduto.elements.nome.value = p.nome;
  formProduto.elements.descricao.value = p.descricao;
  formProduto.elements.preco.value = p.preco;
  formProduto.elements.nomeCor.value = p.nomeCor;
  formProduto.elements.foto.value = p.foto;
  previewFoto.innerHTML = p.foto ? `<img src="${p.foto}">` : '';
  inputCor1.value = p.cor1 || '#3b2416';
  usarCor2.checked = !!p.cor2;
  inputCor2.value = p.cor2 || '#caa472';
  cor2Wrap.hidden = !p.cor2;
  atualizarPreviewCor();
  atualizarEstadoForm();
  tituloForm.textContent = `Editando: ${p.nome || p.codigo}`;
  btnSalvar.textContent = 'Salvar alterações';
  window.scrollTo({ top: 0, behavior: 'smooth' });
  const bloco = formProduto.closest('.bloco');
  setTimeout(() => {
    bloco.classList.remove('bloco-flash');
    void bloco.offsetWidth; // reinicia animação se chamar editar() duas vezes seguidas
    bloco.classList.add('bloco-flash');
    bloco.addEventListener('animationend', () => bloco.classList.remove('bloco-flash'), { once: true });
  }, 200);
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

// Liga/desliga o produto sem recarregar a página: atualiza o estado local e
// re-renderiza a lista. Produto inativo não entra no PDF do catálogo.
async function alternarAtivo(id) {
  const p = produtos.find((x) => x.id === id);
  if (!p) return;
  const novoAtivo = p.ativo === false; // estava inativo? agora ativa
  const resposta = await fetch(`/api/produtos/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ativo: novoAtivo }),
  });
  if (resposta.ok) {
    p.ativo = novoAtivo;
    mostrarToast(novoAtivo ? 'Produto ativado' : 'Produto desativado — fora do PDF', 'sucesso');
    renderProdutos();
  } else {
    mostrarToast('Erro ao alterar status do produto', 'erro');
  }
}

async function alternarAtivosGrupo(categoriaId, ativar) {
  const alvo = produtos.filter((p) => p.categoriaId === categoriaId);
  if (!alvo.length) return;
  const resultados = await Promise.all(
    alvo.map((p) =>
      fetch(`/api/produtos/${p.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ativo: ativar }),
      }),
    ),
  );
  const falhas = resultados.filter((r) => !r.ok).length;
  alvo.forEach((p) => { p.ativo = ativar; });
  const n = alvo.length - falhas;
  if (falhas) mostrarToast(`${falhas} produto(s) não puderam ser alterados`, 'erro');
  if (n > 0) mostrarToast(`${n} produto${n > 1 ? 's' : ''} ${ativar ? 'ativado' : 'desativado'}${n > 1 ? 's' : ''}`, 'sucesso');
  renderProdutos();
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
  const btn = layout === '3' ? btnPdf3 : btnPdf2;
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

btnPdf2.addEventListener('click', () => gerarPdf('2'));
btnPdf3.addEventListener('click', () => gerarPdf('3'));

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

atualizarPreviewCor();
carregar();
