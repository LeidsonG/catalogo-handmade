// Botão "Importar fotos de uma pasta": o usuário escolhe uma pasta (ex.: a
// baixada do Google Drive) e cada foto cujo nome é o código de um produto
// cadastrado (CM-001.webp) é enviada para POST /api/upload/importar.
// Usa globais de admin.js ($, carregar, produtos, versaoFotos, esc) e de
// sync.js (abrirProgresso, fecharProgresso, mostrarMensagem).

const inputPasta = $('#input-pasta-fotos');
$('#btn-importar-fotos').addEventListener('click', () => inputPasta.click());

const PREFERENCIA_EXT = { '.webp': 3, '.png': 2, '.jpg': 1, '.jpeg': 1 };

inputPasta.addEventListener('change', async () => {
  const arquivos = [...inputPasta.files];
  inputPasta.value = '';
  if (!arquivos.length) return;

  const porCodigo = new Map(produtos.map((p) => [String(p.codigo || '').trim().toLowerCase(), p]));
  const escolhidos = new Map(); // código -> File (se houver .png e .webp do mesmo código, fica o webp)
  const semProduto = [];
  for (const f of arquivos) {
    const ponto = f.name.lastIndexOf('.');
    const ext = ponto >= 0 ? f.name.slice(ponto).toLowerCase() : '';
    if (!PREFERENCIA_EXT[ext] || f.name.includes(':')) continue;
    const codigo = f.name.slice(0, ponto).trim().toLowerCase();
    if (!porCodigo.has(codigo)) { semProduto.push(f.name); continue; }
    const atual = escolhidos.get(codigo);
    const extAtual = atual ? atual.name.slice(atual.name.lastIndexOf('.')).toLowerCase() : '';
    if (!atual || PREFERENCIA_EXT[ext] > PREFERENCIA_EXT[extAtual]) escolhidos.set(codigo, f);
  }

  if (!escolhidos.size) {
    mostrarMensagem('Nenhuma foto encontrada', `<p>Nenhum arquivo da pasta tem o nome igual ao código de um produto cadastrado (ex.: <strong>CM-001.webp</strong>).</p>${
      semProduto.length ? `<p>Arquivos ignorados: ${esc(semProduto.slice(0, 20).join(', '))}${semProduto.length > 20 ? '…' : ''}</p>` : ''}`);
    return;
  }
  if (!confirm(`Encontrei ${escolhidos.size} foto(s) de produtos cadastrados. Importar agora?\n\nFotos com o mesmo código vão substituir as atuais.`)) return;

  let ok = 0;
  let substituidas = 0;
  const erros = [];
  let n = 0;
  abrirProgresso('Importando fotos…');
  for (const [, arquivo] of escolhidos) {
    n += 1;
    $('#progresso-texto').textContent = `Importando fotos (${n}/${escolhidos.size})…`;
    const codigo = arquivo.name.slice(0, arquivo.name.lastIndexOf('.')).trim();
    const fd = new FormData();
    fd.append('arquivo', arquivo);
    try {
      const r = await fetch(`/api/upload/importar?codigo=${encodeURIComponent(codigo)}`, { method: 'POST', body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.erro);
      ok += 1;
      if (d.substituida) substituidas += 1;
    } catch (err) {
      erros.push(`${arquivo.name}: ${err.message}`);
    }
  }
  fecharProgresso();
  versaoFotos = Date.now();
  await carregar();

  const semFoto = produtos.filter((p) => p.ativo !== false && !p.foto).map((p) => p.codigo);
  let html = `<p>✅ <strong>${ok}</strong> foto(s) importada(s)${substituidas ? ` (${substituidas} substituíram fotos que já existiam)` : ''}.</p>`;
  if (erros.length) html += `<p>❌ Com erro:</p><ul>${erros.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>`;
  if (semProduto.length) html += `<p>Ignoradas (nenhum produto com esse código): ${esc(semProduto.join(', '))}</p>`;
  if (semFoto.length) html += `<p>Produtos ativos que continuam <strong>sem foto</strong>: ${esc(semFoto.join(', '))}</p>`;
  if (ok) html += '<p>Clique em <strong>🔄 Sincronizar</strong> para enviar as fotos para a outra máquina.</p>';
  mostrarMensagem('Importação concluída', html);
});
