# Catálogo Handmade

Sistema local em Node.js + Puppeteer para gerar catálogos PDF de cintos de couro
artesanais (marca **Handmade — Tati**). Admin web para cadastrar produtos por
categoria, fazer upload de fotos e regerar o PDF em segundos sempre que algum
preço mudar.

> Pensado para quem precisa atualizar preços com frequência sem ter que reabrir
> InDesign/Illustrator e re-exportar 40 páginas manualmente.

## Funcionalidades

- **Admin web local** com CRUD de produtos e categorias
- **Categorias com prefixo de código** — ao escolher a categoria, o próximo
  código é sugerido automaticamente (`CM-001`, `CM-002`, `CM-003`...)
- **Drag-and-drop** para reordenar categorias
- **Filtro por categoria** na lista de produtos
- **Upload de fotos** (PNG sem fundo) e recorte de cor (textura real do couro)
- **Dois layouts de PDF**: 1 produto por página (luxuoso) ou 2 produtos por
  página (equilibrado)
- **PDF filtrado por categoria** — gera só os produtos da categoria escolhida
- **Logo da marca** na página de introdução (grande) e no canto de cada página
  (pequeno)
- **Script Python** para remover fundo das fotos em lote (`rembg`)
- **IDs sequenciais e legíveis** (`p00001`, `c001`) — arquivos de imagem
  nomeados pelo código do produto (`CM-001.png`)

## Pré-requisitos

- **Node.js 18+** (recomendado 19+)
- **Python 3.10+** (opcional — só para remover fundo das fotos em lote)

## Instalação

```bash
git clone https://github.com/LeidsonG/catalogo-handmade.git
cd catalogo-handmade
npm install
```

Opcional, para o script de remoção de fundo:

```bash
pip install -r scripts/requirements.txt
```

## Como usar

```bash
npm start
```

Abra http://localhost:3000/admin no navegador.

### Fluxo de trabalho

1. **Logo da marca** — coloque `logo.svg` (ou `.png`) na pasta [assets/](assets/).
   Veja [assets/README.md](assets/README.md).
2. **Preparar fotos** (opcional, em lote) — jogue as fotos originais com
   fundo em [fotos-originais/](fotos-originais/) e rode:
   ```bash
   python scripts/remove-bg.py
   ```
   Isso gera os PNGs sem fundo em `uploads/produtos/sem-fundo/`.
3. **Criar categorias** — no admin, defina cada categoria (ex: "Cintos
   infantis masculino") e o **prefixo** (ex: `CM`).
4. **Cadastrar produtos** — para cada cinto, escolha a categoria (o código
   é preenchido automático: `CM-001`, `CM-002`...), preencha nome, preço,
   descrição e cor, faça upload da foto e do recorte de cor.
5. **Editar a introdução** — bloco de Introdução no admin (marca, subtítulo,
   texto, ano, Instagram, WhatsApp).
6. **Gerar PDF** — no topo do admin, escolha a categoria e clique em
   "Gerar PDF (1 por página)" ou "Gerar PDF (2 por página)". O PDF abre
   numa aba nova e fica salvo em [output/](output/) com o nome
   `catalogo-<categoria>-layout<N>-<timestamp>.pdf`.

### Atualizar preços

Abra o admin, clique **Editar** no produto, mude o preço, salve, regere o PDF.
São 5 segundos por mudança em vez de reabrir todo o documento de design.

## Personalização visual

Todo o visual do PDF está em [templates/pdf.css](templates/pdf.css). Os blocos
estão marcados com comentários para você achar rápido. Os mais úteis:

```css
:root {
  --cor-fundo: #ffffff;       /* fundo das páginas */
  --cor-acento: #1a1a1a;      /* cor principal */
  --cor-suave: #7a6a5a;       /* cor secundária */
  --cor-linha: #d8c9b8;       /* divisórias */
}
```

| O que mudar | Onde mexer |
|---|---|
| Margem das páginas | `.pagina-layout-1 { padding: ... }` ou `.pagina-layout-2 { padding: ... }` |
| Tamanho da foto (layout 1) | `.pagina-layout-1 .produto-foto { max-height: ... }` |
| Tamanho da foto (layout 2) | `.pagina-layout-2 .produto-foto { max-height: ... }` |
| Proporção foto/info (layout 2) | `.pagina-layout-2 .produto-bloco { grid-template-columns: ... }` |
| Tamanho do círculo de cor | `.produto-cor-amostra { width: ...; height: ... }` |
| Logo de canto | `.logo-canto { width: ...; top: ...; right: ... }` |

> Mudou só o CSS? **Não precisa reiniciar o servidor** — clique "Gerar PDF"
> de novo. Mudou `server.js`? Precisa reiniciar.

## Estrutura de pastas

```
catalogo-handmade/
├── server.js                  Servidor Express + API + geração de PDF
├── package.json
├── admin/                     Interface web (index.html, admin.js, admin.css)
├── templates/                 HTML/CSS do PDF (pdf.css, intro/layout-1/layout-2.html)
├── data/
│   ├── produtos.json          Banco de produtos
│   ├── categorias.json        Banco de categorias
│   └── intro.json             Texto da página de introdução
├── assets/
│   └── logo.svg               Logo da marca (você adiciona)
├── uploads/
│   ├── produtos/              Fotos dos cintos (PNG sem fundo)
│   └── cores/                 Recortes de textura para o círculo de cor
├── scripts/
│   ├── remove-bg.py           Remoção de fundo em lote (rembg)
│   ├── migrar-ids.js          Migração one-shot de IDs/arquivos
│   └── requirements.txt
├── fotos-originais/           Fotos com fundo (entrada do remove-bg.py)
└── output/                    PDFs gerados
```

## API REST

O admin web é apenas um cliente da API HTTP. Você pode integrar outra ferramenta
(planilha, importador) chamando essas rotas:

| Método | Rota | Descrição |
|---|---|---|
| GET    | `/api/produtos`                          | Lista todos os produtos |
| POST   | `/api/produtos`                          | Cria produto (exige `categoriaId`) |
| PUT    | `/api/produtos/:id`                      | Edita produto |
| DELETE | `/api/produtos/:id`                      | Remove produto |
| POST   | `/api/produtos/reordenar`                | Reordena (recebe `ordemIds: [...]`) |
| GET    | `/api/categorias`                        | Lista categorias |
| POST   | `/api/categorias`                        | Cria categoria |
| PUT    | `/api/categorias/:id`                    | Edita categoria |
| DELETE | `/api/categorias/:id`                    | Remove (bloqueia se houver produtos) |
| POST   | `/api/categorias/reordenar`              | Reordena categorias |
| GET    | `/api/categorias/:id/proximo-codigo`     | Próximo código sugerido para a categoria |
| POST   | `/api/upload/:tipo`                      | Upload de foto (`?codigo=XXX`) — tipo `foto` ou `cor` |
| GET    | `/api/intro` / PUT                        | Texto da página de introdução |
| GET    | `/render/:layout?categoria=ID`           | HTML do catálogo (1 ou 2) |
| POST   | `/api/gerar-pdf`                         | Gera PDF (`layout`, `categoriaId`) |

## Licença

[MIT](LICENSE) © Leidson F. Gonçalves
