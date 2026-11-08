# Manual del operario: el original

Acá está la fuente del manual que abre el botón **Manual** de la app
(`public/manual.pdf`):

- `index.html` — el texto y el armado, pensado para imprimir en A4.
- `img/` — las capturas de la app real, con datos de prueba.
- `generar-pdf.js` — lo convierte a PDF con Chromium (Playwright).

## Para sacar una versión nueva

La versión se dice en UN solo lugar: `lib/manual.ts`. De ahí la leen el botón
de la app ("Manual v3"), la redirección de `/manual.pdf` y este script.

1. Subir `version` (y la `fecha`) en `lib/manual.ts`.
2. Editar `index.html`: el contenido, "Versión N" en la tapa, y una fila nueva
   en la tabla "Versiones de este manual" del final.
3. Si cambió alguna pantalla, rehacer sus capturas en `img/` con la app
   levantada y los datos de ejemplo, en pantalla de celular (390 × 844).
4. Generar el PDF desde la raíz del repo, con Playwright instalado aparte:
   `node docs/manual/generar-pdf.js`. Queda en
   `public/manuales/manual-operario-vN.pdf`, y no pisa ninguna versión anterior
   (el script además se niega a generar si la tapa no dice la versión nueva).

Cada versión es un archivo con su número y nunca se reemplaza, así que el
celular no puede quedarse con una vieja por caché. `/manual.pdf` redirige a la
vigente, para quien tenga guardada la dirección de antes.

Los esquemas de racks y el dibujo del autoelevador son SVG dentro de
`index.html`; los genera `dibujos/gen.py` a partir de `dibujos/clark.svg`.

## Versiones

| Versión | Fecha | Archivo |
|---|---|---|
| 3 (vigente) | noviembre 2026 | `public/manuales/manual-operario-v3.pdf` |
| 2 | noviembre 2026 | `public/manuales/manual-operario-v2.pdf` |
| 1 | octubre 2026 | `public/manuales/manual-operario-v1.pdf` |
