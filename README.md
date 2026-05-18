# Tati Cintos — Sistema de Catálogo

Sistema local para gerar catálogos PDF de cintos de couro artesanais.
Edita preços e produtos numa interface web, gera o PDF em segundos.

## O que tem dentro

- **`server.js`** — Servidor Express com API REST (produtos, intro, upload, gerar PDF).
- **`admin/`** — Interface web local para CRUD de produtos.
- **`templates/`** — HTML + CSS dos PDFs (intro, 1/página, 2/página).
- **`data/produtos.json`** — Banco de dados simples (texto). Não edite à mão se possível.
- **`scripts/remove-bg.py`** — Remove fundo de várias fotos em lote.
- **`uploads/`** — Fotos dos produtos e recortes de cor (criadas pelo admin).
- **`output/`** — PDFs gerados.

## Pré-requisitos

- Node.js 18+ (você tem v19)
- Python 3.10+ (você tem 3.12), apenas para remover fundo das fotos

## Primeiro uso

```bash
# 1. Instalar dependências do servidor (já feito na 1ª execução)
npm install

# 2. (Opcional) Instalar rembg para remover fundo das fotos
pip install -r scripts/requirements.txt

# 3. Subir o servidor
npm start
```

Abra http://localhost:3000/admin no navegador.

## Fluxo de trabalho

### a) Preparar as fotos (uma vez)

1. Jogue as fotos originais dos cintos em [fotos-originais/](fotos-originais/).
2. Rode `python scripts/remove-bg.py` — gera PNGs sem fundo em
   [uploads/produtos/sem-fundo/](uploads/produtos/sem-fundo/).
3. (Para o círculo de cor) Recorte um pedaço pequeno da textura do couro
   de cada cinto (pode ser no Paint ou qualquer editor) e salve numa pasta.

### b) Cadastrar produtos

1. No admin, preencha a **Introdução** uma vez.
2. Para cada cinto, preencha o formulário e faça upload:
   - Foto do produto (a PNG sem fundo)
   - Recorte da textura do couro (vira o círculo de cor no catálogo)
3. Clique em **Adicionar produto**.

### c) Gerar PDF

- **Gerar PDF (1 por página)** — layout luxuoso, ~45 páginas para 40 cintos.
- **Gerar PDF (2 por página)** — layout equilibrado, ~22 páginas.

O PDF abre numa nova aba e fica salvo em [output/](output/).
Pode gerar quantas vezes quiser — cada arquivo tem timestamp no nome.

### d) Atualizar preços

Abra o admin, clique **Editar** no produto, mude o preço, salve, regere o PDF.

## Identidade visual (para você customizar depois)

Cores e fontes do PDF estão em [templates/pdf.css](templates/pdf.css), nas variáveis
no topo do arquivo:

```css
:root {
  --cor-fundo: #faf6f1;       /* fundo das páginas */
  --cor-acento: #6b4226;      /* marrom principal (títulos, preços) */
  --cor-suave: #8a6e57;       /* secundário (códigos, legendas) */
  --cor-linha: #d8c9b8;       /* divisórias */
}
```

Para usar a fonte/logo da marca, é só substituir essas variáveis e o conteúdo da
página de introdução em [templates/intro.html](templates/intro.html).

## Estrutura de pastas

```
handmade-cintos/
├── server.js                  Servidor + API
├── package.json
├── admin/                     Interface web (index.html, admin.js, admin.css)
├── templates/                 HTML/CSS do PDF
├── data/
│   ├── produtos.json          Banco de produtos
│   └── intro.json             Dados da página de introdução
├── uploads/
│   ├── produtos/              Fotos dos cintos (PNG sem fundo)
│   └── cores/                 Recortes de textura para o círculo de cor
├── scripts/
│   ├── remove-bg.py           Remoção de fundo em lote
│   └── requirements.txt
├── fotos-originais/           Fotos com fundo (entrada do remove-bg.py)
└── output/                    PDFs gerados
```
