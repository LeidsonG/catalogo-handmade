# Backup — Layout 1 (1 produto por página)

Este layout foi **desativado** e tirado do fluxo do gerador de PDF. Os arquivos
aqui são a referência completa caso você queira reativá-lo no futuro.

| Arquivo | O que é |
|---|---|
| `layout-1.html` | Template HTML de uma página com 1 produto |
| `layout-1.css`  | Regras `.pagina-layout-1` que estavam em `templates/pdf.css` |

## Como reativar o layout 1

São 3 pontos a restaurar (foi assim que ele foi desativado):

1. **CSS** — copie o conteúdo de `layout-1.css` de volta para
   `templates/pdf.css` (pode colar logo antes do bloco
   `/* ---------- Layout 2 produtos por página ---------- */`).

2. **Template** — copie `layout-1.html` de volta para
   `templates/layout-1.html`.

3. **Render** — em `lib/render.js`:
   - reintroduza a função `renderProduto(template, p)` (renderiza um produto
     por página aplicando as variáveis no template);
   - em `construirHtml`, volte a escolher o template por layout
     (`layout === '1' ? 'layout-1.html' : 'layout-2.html'`) e a ramificar o
     loop de páginas: `if (layout === '1')` chama `renderProduto` por produto,
     senão monta os blocos de 2 em 2.
   - aceite `'1'` na validação de layout em `routes/pdf.js`
     (`['1', '2', '3']`) e adicione o botão correspondente no admin.

> Histórico: o layout 1 saiu quando o catálogo passou a usar só os layouts de
> 2 por página ("PDF Catálogo" com preço e "PDF sem preço"). Veja o commit que
> menciona "substituir layout 1-por-página por opção sem preço".
