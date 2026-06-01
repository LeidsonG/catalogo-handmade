# Guia de contribuição — Catálogo Handmade

Este documento ensina alguém de fora a **rodar o projeto, fazer alterações com
segurança e enviar de volta**. Para entender o que cada parte faz, leia também
o [README.md](README.md).

---

## 1. Pré-requisitos

- **Node.js 18+** (recomendado 20+)
- **Python 3.10+** — opcional, só para o script que remove fundo das fotos
- Dependências de sistema do **Chromium** (o Puppeteer usa um Chrome headless
  para gerar o PDF). Em Debian/Ubuntu/WSL, se a geração de PDF falhar com erro
  tipo `libnss3.so: cannot open shared object file`, instale:

  ```bash
  sudo apt-get install -y libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
    libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
    libgbm1 libasound2t64
  ```

---

## 2. Rodar localmente

```bash
git clone git@github.com:LeidsonG/catalogo-handmade.git
cd catalogo-handmade
npm install
npm start          # sobe em http://localhost:3000/admin
```

- `npm run dev` — igual, mas reinicia sozinho ao salvar arquivos (`node --watch`).
- **Login padrão:** `handmade` / `@Hand55`. Troque pelo botão "Trocar senha"
  no admin. Esqueceu? Apague `data/auth.json` e reinicie.
- Mudou **só CSS do PDF**? Não precisa reiniciar — é só clicar "Gerar PDF" de
  novo. Mudou `.js` do servidor? Reinicie (ou use `npm run dev`).

### Fontes offline (opcional)

```bash
npm run baixar-fontes   # baixa Rye + Work Sans para assets/fonts/
```

Sem isso, o PDF usa as fontes via Google Fonts (precisa de internet no momento
da geração).

---

## 3. Como o projeto está organizado

Resumo (detalhe completo no [README.md](README.md#estrutura-de-pastas)):

| Pasta | Responsabilidade |
|---|---|
| `server.js`  | Entry point: middleware, arquivos estáticos, monta os routers |
| `lib/`       | Lógica de negócio (sem Express): dados, auth, ids, render, validação |
| `routes/`    | Endpoints HTTP (uma rota por arquivo) — finos, delegam para `lib/` |
| `admin/`     | Frontend do painel (HTML/CSS/JS puro, sem framework) |
| `templates/` | HTML + `pdf.css` que viram o PDF; `_backup/` guarda layouts desativados |
| `data/`      | "Banco de dados" em JSON (produtos, categorias, intro, auth) |
| `uploads/`   | Imagens enviadas pelo usuário (fotos e texturas de cor) |
| `assets/`    | Logo da marca e fontes locais |
| `scripts/`   | Utilitários one-shot (remover fundo, baixar fontes, migrar ids) |
| `output/`    | PDFs gerados (gitignorados) |

**Regra de ouro:** `routes/` cuida de HTTP (validar request, responder status);
`lib/` cuida da lógica. Não coloque `fs.writeFileSync` direto numa rota — use as
funções de [lib/dados.js](lib/dados.js), que fazem backup e serializam escritas
concorrentes com um mutex.

### Os dois PDFs

"PDF Catálogo" (com preço) e "PDF sem preço" usam **o mesmo** template e CSS
(`.pagina-layout-2`). A única diferença é a flag `semPreco` em
[lib/render.js](lib/render.js), que omite a linha de preço. **Não duplique CSS**
— qualquer ajuste visual deve valer para os dois.

---

## 4. Fluxo de branches

Duas branches permanentes:

- **`main`** — produção. Só recebe merge de `staging`. **Nunca commitar direto.**
- **`staging`** — validação. Recebe as features prontas para testar.

```bash
# começar uma feature
git checkout staging && git pull origin staging
git checkout -b feature/nome-da-feature

# quando pronto
git checkout staging && git merge feature/nome-da-feature
git push origin staging
# valide em staging; aprovado, então:
git checkout main && git merge staging && git push origin main
```

- `feature/*` são de vida curta — delete após o merge.
- **Nunca** `git push --force` em `main` ou `staging`.

---

## 5. Convenção de commits

[Conventional Commits](https://www.conventionalcommits.org/) **em português**:

```
<tipo>(<escopo>): <descrição curta, minúsculas, imperativo, sem ponto final>

[corpo opcional — explique o PORQUÊ quando não for óbvio pelo título]
- detalhe 1
- detalhe 2
```

Tipos: `feat`, `fix`, `refactor`, `chore`, `docs`, `style`, `test`, `perf`.
Escopos comuns: `pdf`, `admin`, `backend`, `data`, `scripts`.

- **Um commit por unidade lógica.** Não misture coisas sem relação (revert vira
  drama); não fragmente uma mesma tarefa em vários commits.
- **Adicione arquivos por nome** (`git add arquivo.js`), nunca `git add .`.
- Rode `git status` e `git diff` antes de commitar.

Exemplos reais:

```
feat(pdf): substituir layout 1-por-página por opção sem preço
fix(pdf): impedir circulo de cor de encolher quando nome quebra linha
refactor(pdf): mover layout-1 desativado para _backup e limpar codigo morto
docs: refletir PDFs com/sem preco e estrutura atual do projeto
```

---

## 6. O que NÃO commitar

Já coberto pelo `.gitignore`, mas atenção:

- `data/auth.json` (credenciais), `.env`, qualquer segredo
- `node_modules/`, `.venv/`, `__pycache__/`
- `output/*.pdf` (PDFs gerados), `data/*.bak`
- Imagens de trabalho temporárias

---

## 7. Antes de abrir um PR

- [ ] O servidor sobe sem erro (`npm start`)
- [ ] Gerou um PDF de teste e conferiu o visual (com e sem preço)
- [ ] Commits seguem a convenção acima
- [ ] Está partindo de `staging`, não de `main`
