# Fontes do PDF

Baixadas automaticamente por `scripts/baixar-fontes.js`.
Não edite à mão — rode o script de novo se precisar atualizar.

As declarações `@font-face` correspondentes já estão em `templates/pdf.css`:

```css
@font-face {
  font-family: 'Rye';
  font-weight: 400;
  font-style: normal;
  font-display: swap;
  src: url('/assets/fonts/rye-400-normal.woff2') format('woff2');
}

@font-face {
  font-family: 'Work Sans';
  font-weight: 500;
  font-style: normal;
  font-display: swap;
  src: url('/assets/fonts/work-sans-500-normal.woff2') format('woff2');
}

@font-face {
  font-family: 'Work Sans';
  font-weight: 600;
  font-style: normal;
  font-display: swap;
  src: url('/assets/fonts/work-sans-600-normal.woff2') format('woff2');
}

@font-face {
  font-family: 'Work Sans';
  font-weight: 700;
  font-style: normal;
  font-display: swap;
  src: url('/assets/fonts/work-sans-700-normal.woff2') format('woff2');
}
```
