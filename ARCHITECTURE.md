# Arquitetura do projeto

Documento de referência para manutenção. Explica **o que é cada pasta da raiz**,
como as peças conversam e por que algumas decisões foram tomadas. Para rodar e
contribuir, veja [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Visão geral

É uma aplicação **Node.js + Express** local, de página única no admin, que serve
para cadastrar cintos de couro por categoria e **gerar catálogos em PDF**. Não há
banco de dados tradicional — os dados ficam em **arquivos JSON** em `data/`. O PDF
é gerado abrindo um HTML no **Chrome headless** (via Puppeteer) e "imprimindo"
para PDF.

```
Navegador (admin)  ──HTTP/JSON──>  Express (server.js + routes/)  ──>  lib/  ──>  data/*.json
                                          │
                                          └─ POST /api/gerar-pdf ─> Puppeteer abre /render ─> PDF em output/
```

Camadas, da borda para o núcleo:

1. **`admin/`** — interface no navegador (cliente burro da API).
2. **`routes/`** — endpoints HTTP. Validam a requisição e respondem; não contêm
   regra de negócio pesada.
3. **`lib/`** — a lógica de verdade (acesso a dados, auth, ids, render do PDF).
4. **`data/`** — a "fonte da verdade" em JSON.

> **Regra que mantém isso saudável:** `routes/` fala HTTP, `lib/` resolve a
> lógica. Uma rota nunca deve escrever em arquivo direto — chama as funções de
> [lib/dados.js](lib/dados.js), que fazem backup automático e serializam as
> escritas.

---

## Pastas e arquivos da raiz

### `server.js`
Entry point. Cria as pastas de upload/output se não existirem, aplica o
middleware de autenticação (tudo é protegido), registra os diretórios estáticos
(`/admin`, `/uploads`, `/templates`, `/assets`, `/output`) e monta cada router de
`routes/` sob seu prefixo. É só "fiação" — sem regra de negócio.

### `lib/` — lógica de negócio (sem Express)
O núcleo reutilizável. Cada arquivo tem uma responsabilidade:

| Arquivo | O que faz |
|---|---|
| `dados.js`     | Lê/escreve os JSONs de `data/`. Faz **backup** (`.bak`) antes de cada escrita e usa um **mutex** (`comLock`) para serializar operações concorrentes e evitar corrupção. Exporta `ROOT` (raiz do projeto). |
| `auth.js`      | Autenticação HTTP Basic com hash **bcrypt**. Cria `data/auth.json` no 1º start. Gera o **token interno** que o Puppeteer usa para renderizar sem precisar de senha. |
| `ids.js`       | Gera IDs sequenciais (`p00001`, `c001`), o próximo código por prefixo de categoria (`CM-001`) e detecta código duplicado. |
| `render.js`    | Monta o **HTML do PDF** (intro + páginas de produto) a partir dos templates. A flag `semPreco` decide se a linha de preço aparece. |
| `validacao.js` | Whitelists de campos editáveis por entidade (evita que o cliente grave campos arbitrários). |

### `routes/` — endpoints HTTP
Um arquivo por área. São finos: validam entrada, chamam `lib/`, devolvem JSON.

| Arquivo | Prefixo | Responsabilidade |
|---|---|---|
| `produtos.js`   | `/api/produtos`   | CRUD de produtos + reordenar. Valida código único. |
| `categorias.js` | `/api/categorias` | CRUD de categorias + reordenar + próximo-código. |
| `intro.js`      | `/api/intro`      | Lê/atualiza o texto da página de introdução. |
| `uploads.js`    | `/api/upload`     | Upload de foto e textura de cor (multer). |
| `auth.js`       | `/api/auth`       | Usuário logado e troca de senha. |
| `pdf.js`        | `/render`, `/api/gerar-pdf` | Gera o HTML e o PDF (Puppeteer). |

### `admin/` — frontend
Painel web em **HTML/CSS/JS puro**, sem framework. É um cliente da API.

| Arquivo | O que é |
|---|---|
| `index.html` | A página única (forms, lista, botões de PDF). |
| `admin.js`   | Toda a lógica: fetch da API, CRUD, filtros, drag-and-drop, uploads, disparo do PDF. |
| `admin.css`  | Tema do painel. **Não** afeta o PDF. |

### `templates/` — aparência do PDF
O que vira o catálogo impresso.

| Arquivo | O que é |
|---|---|
| `intro.html`   | Página de capa/introdução. |
| `layout-2.html`| Página com 2 produtos. É o **único** layout ativo — serve tanto o "PDF Catálogo" (com preço) quanto o "PDF sem preço". |
| `pdf.css`      | **Todo** o visual do PDF. Editar aqui muda os dois PDFs de uma vez. |
| `_backup/`     | Layout-1 (1 por página) **desativado**: html + css + README de reativação. |

> Os dois PDFs compartilham 100% do template e do CSS; a única diferença é a
> flag `semPreco` em `render.js`. **Não duplique CSS por causa do preço.**

### `data/` — "banco de dados" em JSON
A fonte da verdade. Editado pela API (nunca à mão, idealmente).

| Arquivo | Conteúdo |
|---|---|
| `produtos.json`   | Lista de produtos. |
| `categorias.json` | Categorias e seus prefixos de código. |
| `intro.json`      | Texto da introdução do catálogo. |
| `auth.json`       | Credenciais do admin (hash bcrypt). **Gitignorado.** |
| `*.bak`           | Backup automático da última escrita. **Gitignorado.** |

### `uploads/` — arquivos enviados pelo usuário
Imagens servidas em `/uploads/...`. Nomeadas pelo código do produto.

| Subpasta | Conteúdo |
|---|---|
| `produtos/`            | Fotos dos cintos (PNG sem fundo). |
| `produtos/sem-fundo/`  | Saída em lote do `scripts/remove-bg.py` (acervo de trabalho). |
| `cores/`               | Recortes de textura usados no círculo de cor. |

### `assets/` — recursos da marca
`logo.svg`/`.png` (logo que aparece no PDF) e `fonts/` (Rye + Work Sans locais,
baixadas por `npm run baixar-fontes` para o PDF funcionar offline).

### `scripts/` — utilitários one-shot
Rodados à mão, não fazem parte do servidor.

| Arquivo | O que faz |
|---|---|
| `remove-bg.py`     | Remove o fundo das fotos em lote (`rembg`). Requer Python. |
| `baixar-fontes.js` | Baixa as fontes do Google Fonts para `assets/fonts/`. |
| `migrar-ids.js`    | Migração one-shot de IDs antigos para o formato sequencial. |
| `requirements.txt` | Dependências Python do `remove-bg.py`. |

### `output/` — PDFs gerados
Destino dos PDFs (`catalogo-<categoria>-layout<N>-<timestamp>.pdf`). Servido em
`/output/...`. **Gitignorado.**

### Outros arquivos da raiz
- `package.json` — dependências e scripts npm.
- `README.md` — visão de produto e instruções de uso.
- `CONTRIBUTING.md` — como rodar e contribuir.
- `ARQUITETURA.md` — este documento.
- `Modelos .af/` — arquivo de edição das fotos (Affinity). Material de trabalho.

---

## Dois fluxos importantes

### Cadastrar um produto
1. Admin escolhe a categoria → `GET /api/categorias/:id/proximo-codigo` sugere o
   código (`CM-004`).
2. Usuário faz upload da foto → `POST /api/upload/foto?codigo=CM-004` salva em
   `uploads/produtos/` e devolve o caminho.
3. `POST /api/produtos` valida (categoria existe, código único), grava em
   `data/produtos.json` via `comLock`.

### Gerar um PDF
1. Admin chama `POST /api/gerar-pdf` com `{ layout, categoriaId }`.
2. O servidor sobe um **Chrome headless** (Puppeteer) e abre
   `http://localhost:PORTA/render/<layout>?categoria=<id>` — passando o **token
   interno** no header para driblar a autenticação.
3. `render.js` monta o HTML (intro + páginas) usando `templates/` e os dados de
   `data/`. O `layout='3'` ativa `semPreco`.
4. O Puppeteer espera as fontes carregarem e salva o PDF em `output/`.

---

## Decisões de arquitetura (por que assim?)

- **JSON em vez de banco** — o volume é pequeno (dezenas de produtos) e o uso é
  local/single-user. Um banco seria peso morto. O risco (corrupção em escrita
  concorrente) é mitigado pelo mutex + backup em `lib/dados.js`.
- **Separação `lib/` × `routes/`** — permite testar/reusar a lógica sem subir o
  Express e mantém as rotas legíveis.
- **Token interno para o Puppeteer** — como tudo é autenticado, o Chrome headless
  precisaria de senha para acessar `/render` e `/uploads`. O token, gerado a cada
  start e nunca exposto, resolve isso sem afrouxar a segurança externa.
- **HTML→PDF via Chrome** — reaproveita CSS conhecido para layout de impressão,
  em vez de uma lib de PDF de baixo nível. Editar o catálogo é editar CSS.
