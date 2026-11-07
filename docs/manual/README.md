# Manual del operario: el original

Acá está la fuente del manual que abre el botón **Manual** de la app
(`public/manual.pdf`):

- `index.html` — el texto y el armado, pensado para imprimir en A4.
- `img/` — las capturas de la app real, con datos de prueba.
- `generar-pdf.js` — lo convierte a PDF con Chromium (Playwright).

## Para sacar una versión nueva

1. **Guardar la vigente**: mover `public/manual.pdf` a
   `public/manuales/manual-operario-AAAA-MM.pdf`, con el mes de esa versión.
   Las versiones viejas no se borran.
2. Editar `index.html` y, si hace falta, rehacer las capturas de `img/` con la
   app levantada y los datos de ejemplo, en pantalla de celular (390 × 844).
3. Cambiar la fecha de la versión en la tapa y en el pie (`generar-pdf.js`).
4. Generar el PDF desde la raíz del repo, con Playwright instalado aparte:
   `node docs/manual/generar-pdf.js`. Queda en `public/manual.pdf`.

El servidor sirve `/manual.pdf` sin caché (ver `next.config.ts`), así que el
celular abre siempre la última versión apenas se despliega.

## Versiones

| Versión | Archivo |
|---|---|
| Noviembre 2026 (vigente) | `public/manual.pdf` |
| Octubre 2026 | `public/manuales/manual-operario-2026-10.pdf` |
