# Catálogo Handmade

Sistema local em Node.js + Puppeteer para gerar catálogos PDF de cintos de couro
artesanais (marca **Handmade — Tati**). Admin web para cadastrar produtos por
categoria, fazer upload de fotos e regerar o PDF em segundos sempre que algum
preço mudar.

> Pensado para quem precisa atualizar preços com frequência sem ter que reabrir
> InDesign/Illustrator e re-exportar 40 páginas manualmente.

## Funcionalidades

- **Autenticação obrigatória** (HTTP Basic Auth, senha criptografada com bcrypt).
  Padrão inicial: `handmade` / `@Hand55` — pode ser trocada pelo admin.
- **Admin web local** com CRUD de produtos e categorias
- **Categorias com prefixo de código** — ao escolher a categoria, o próximo
  código é sugerido automaticamente (`CM-001`, `CM-002`, `CM-003`...)
- **Validação de código único** — bloqueia produtos duplicados com mensagem
  clara e sugere o próximo código disponível
- **Drag-and-drop** para reordenar categorias
- **Filtro por categoria** na lista de produtos
- **Upload de fotos** (PNG sem fundo) e recorte de cor (textura real do couro)
- **Dois PDFs, mesmo layout (2 produtos por página)**: "PDF Catálogo" (com
  preço) e "PDF sem preço". Compartilham 100% do template e do CSS — a única
  diferença é a linha de preço
- **PDF filtrado por categoria** — gera só os produtos da categoria escolhida
- **Logo da marca** na página de introdução (grande) e no canto de cada página
  (pequeno)
- **Fontes country/western** (Rye + Work Sans) servidas localmente, geração
  de PDF funciona offline
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
   "PDF Catálogo" (com preço) ou "PDF sem preço". O PDF abre numa aba nova
   e fica salvo em [output/](output/) com o nome
   `catalogo-<categoria>-layout<N>-<timestamp>.pdf`.

### Atualizar preços

Abra o admin, clique **Editar** no produto, mude o preço, salve, regere o PDF.
São 5 segundos por mudança em vez de reabrir todo o documento de design.

### Compactar o PDF gerado

O PDF gerado pelo Puppeteer sai a 96 DPI, o que pode resultar em arquivos
grandes dependendo da quantidade de fotos. Para reduzir o tamanho sem perder
qualidade visível, use o **PDF24**:

1. Acesse https://tools.pdf24.org/pt/comprimir-pdf
2. Faça upload do PDF gerado (pasta `output/`)
3. Configure as opções:
   - **DPI:** `150`
   - **Qualidade de imagem:** `100%`
4. Marque **todos os checkboxes:**
   - [x] Remover miniaturas
   - [x] Deduplicar fluxos
   - [x] Rasterizar gráficos pesados
   - [x] Reduzir fontes incorporadas
   - [x] Compressão Flat Máxima
   - [x] Remover anotações
   - [x] Remover tópicos
   - [x] Remover metadados
   - [x] Remover informações estruturais
5. Clique em **Compactar** e baixe o resultado

## Sincronização entre máquinas

Os cadastros (`data/produtos.json`, `categorias.json`, `intro.json`) e a pasta
`uploads/` inteira **não ficam na `main`**: ficam na branch **`dados`** do
GitHub e são sincronizados pelo botão **🔄 Sincronizar** do admin (e
automaticamente ao abrir o admin). O app fala direto com a API do GitHub — não
precisa de Git instalado.

- **Configuração:** em cada máquina, "Configurar sincronização" → colar um
  token *fine-grained* com acesso só a este repositório e permissão
  **Contents: Read and write**. O token fica em `data/sincronizacao.json`
  (local, gitignorado). Os commits saem com a conta dona do token.
- **Merge:** de 3 vias contra o estado da última sincronização
  (`data/.sync/`). Mudanças em itens ou campos diferentes se juntam sozinhas;
  o mesmo campo alterado nas duas máquinas abre a tela "Escolha qual versão
  manter". Produtos novos cadastrados nas duas máquinas com o mesmo
  id/código são mantidos, e o local é renumerado (a foto é renomeada junto).
- **Não sincronizados:** `data/auth.json` (senha de cada máquina), o token e
  os backups `.bak`.
- **Primeira vez:** a branch `dados` é criada na primeira sincronização da
  máquina que já tem os cadastros. Só depois instale nas outras.

Código em [lib/sync.js](lib/sync.js) (motor), [lib/merge.js](lib/merge.js)
(merge) e [lib/github.js](lib/github.js) (cliente da API). Testes em `test/`
(`npm test`).

## App para Windows (.exe)

```bash
npm run build:exe            # empacota a branch main
node scripts/build-exe.js --ref staging
```

Gera `build/CatalogoHandmade-<versão>-win64.zip` (roda no Linux/WSL; baixa o
Node para Windows e o Chrome for Testing na primeira vez e guarda em
`build/cache/`). Dentro do zip:

```
CatalogoHandmade/
├── CatalogoHandmade.exe   Node + launcher/launcher.js embutido (abre o servidor e o navegador)
├── app/                   código da main (atualizado pelo botão Sincronizar)
├── node_modules/          dependências (só mudam com um zip novo)
├── runtime/chrome/        Chrome usado pelo Puppeteer
├── dados/                 cadastros, fotos e PDFs (criada no 1º uso)
└── COMO USAR.txt          o GUIA.md
```

**Atualizações:** ao sincronizar, o app empacotado compara a `main` do GitHub
com o `.manifesto.json` e baixa só os arquivos de código que mudaram, depois
reinicia sozinho. Se `dependencies` do `package.json` mudar, a atualização não
é aplicada e o app avisa que precisa de um zip novo. Por isso **tudo o que vai
para a `main` chega na máquina da cliente** — valide antes na `staging`.

Guia para quem usa o app: [GUIA.md](GUIA.md).

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
| Margem das páginas | `.pagina-layout-2 { padding: ... }` |
| Tamanho da foto | `.pagina-layout-2 .produto-foto { max-height: ... }` |
| Proporção foto/info | `.pagina-layout-2 .produto-bloco { grid-template-columns: ... }` |
| Tamanho do círculo de cor | `.produto-cor-amostra { width: ...; height: ... }` |
| Logo de canto | `.logo-canto { width: ...; top: ...; right: ... }` |

> Os dois PDFs ("Catálogo" e "sem preço") usam o **mesmo** `.pagina-layout-2`,
> então qualquer ajuste de CSS afeta os dois automaticamente.

> Mudou só o CSS? **Não precisa reiniciar o servidor** — clique "Gerar PDF"
> de novo. Mudou `server.js`? Precisa reiniciar.

## Estrutura de pastas

```
catalogo-handmade/
├── server.js                  Entry point (setup + middleware + monta routers)
├── package.json
├── lib/
│   ├── auth.js                Autenticação bcrypt + token interno
│   ├── dados.js               Read/write JSONs + mutex + backup (pasta DADOS)
│   ├── sync.js                Sincronização com a branch `dados` do GitHub
│   ├── merge.js               Merge de 3 vias de produtos/categorias/intro
│   ├── github.js              Cliente mínimo da API do GitHub
│   ├── atualizacao.js         Atualização do código no app .exe
│   ├── ids.js                 IDs e códigos sequenciais + validação de duplicata
│   ├── render.js              HTML do PDF (intro + páginas de produto)
│   └── validacao.js           Whitelists de campos editáveis
├── routes/
│   ├── auth.js                GET /me e POST /trocar-senha
│   ├── produtos.js            CRUD de produtos (com validação de código único)
│   ├── categorias.js          CRUD de categorias + próximo-código
│   ├── intro.js               GET/PUT da introdução
│   ├── uploads.js             Upload de foto + importação em lote
│   ├── sync.js                /api/sync, /api/sistema
│   └── pdf.js                 Render HTML + geração PDF (Puppeteer)
├── admin/                     Interface web (index.html, admin.js, sync.js, importar.js, admin.css)
├── launcher/launcher.js       Launcher embutido no .exe
├── test/                      Testes (npm test)
├── templates/                 HTML/CSS do PDF (pdf.css, intro.html, layout-2.html)
│   └── _backup/               Layout-1 desativado (html+css+README de reativação)
├── data/                      (gitignorado — sincronizado pela branch `dados`)
│   ├── produtos.json          Banco de produtos
│   ├── categorias.json        Banco de categorias
│   ├── intro.json             Texto da página de introdução
│   ├── auth.json              Credenciais do admin (criado no 1º start, não sincroniza)
│   ├── sincronizacao.json     Token do GitHub desta máquina (não sincroniza)
│   └── .sync/                 Estado da última sincronização
├── assets/
│   ├── logo.svg               Logo da marca (você adiciona)
│   └── fonts/                 Fontes baixadas localmente (npm run baixar-fontes)
├── uploads/                   (gitignorado — sincronizado pela branch `dados`)
│   ├── produtos/              Fotos dos cintos (PNG/WebP sem fundo)
│   └── background/            Fundo da página de introdução por categoria
├── scripts/
│   ├── remove-bg.py           Remoção de fundo em lote (rembg)
│   ├── migrar-ids.js          Migração one-shot de IDs/arquivos
│   ├── baixar-fontes.js       Baixa Work Sans + Rye localmente
│   ├── build-exe.js           Gera o zip com o .exe para Windows
│   └── requirements.txt
├── fotos-originais/           Fotos com fundo (entrada do remove-bg.py)
└── output/                    PDFs gerados
```

## Variáveis de ambiente

| Variável | Default  | Descrição |
|---|---|---|
| `PORT`   | `3000`   | Porta do servidor |
| `CATALOGO_DADOS` | raiz do projeto | Pasta com `data/`, `uploads/` e `output/` (o .exe usa `dados/`) |

## Autenticação

O servidor **sempre** exige login HTTP Basic. As credenciais ficam em
[data/auth.json](data/auth.json) com a senha **hasheada com bcrypt** (não fica
em plaintext). O arquivo é criado no primeiro start com os defaults:

- **Usuário:** `handmade`
- **Senha:**   `@Hand55`

**Recomendado trocar a senha pelo botão "Trocar senha"** no canto superior
direito do admin. A nova senha é validada (mínimo 6 caracteres) e regravada
hasheada.

**Esqueceu a senha?** Apague `data/auth.json` e reinicie o servidor — ele
recria com os defaults.

> O Puppeteer (renderizador do PDF) usa um **token interno** gerado a cada
> start do servidor, então não precisa saber a senha pra renderizar o catálogo
> internamente.

## Scripts npm

| Comando | O que faz |
|---|---|
| `npm start`             | Sobe o servidor em `http://localhost:3000` |
| `npm run dev`           | Igual, com `--watch` (reinicia ao salvar arquivos) |
| `npm run baixar-fontes` | Baixa Work Sans + Rye do Google Fonts para `assets/fonts/` (geração de PDF passa a funcionar offline) |
| `npm run migrar-ids`    | One-shot: migra IDs antigos (hash hex) para o formato sequencial novo, renomeia arquivos |
| `npm test`              | Testes da sincronização, do merge e da atualização |
| `npm run build:exe`     | Gera o zip com o app para Windows |

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
| POST   | `/api/upload/importar?codigo=XXX`        | Importa a foto de um produto existente (lote) |
| GET    | `/api/sistema`                           | Versão, status da sincronização |
| POST   | `/api/sync`                              | Sincroniza (`resolucoes` opcional) → `ok` / `conflitos` / `config-necessaria` |
| POST/DELETE | `/api/sync/config`                  | Salva (testando) / remove o token do GitHub |
| GET    | `/api/intro` / PUT                        | Texto da página de introdução |
| GET    | `/api/auth/me`                           | Retorna o usuário autenticado |
| POST   | `/api/auth/trocar-senha`                 | Troca senha (`senhaAtual`, `senhaNova`) |
| GET    | `/render/:layout?categoria=ID`           | HTML do catálogo (1 ou 2) |
| POST   | `/api/gerar-pdf`                         | Gera PDF (`layout`, `categoriaId`) |

## Licença

[MIT](LICENSE) © Leidson F. Gonçalves
