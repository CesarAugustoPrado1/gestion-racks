/* eslint-disable @typescript-eslint/no-require-imports -- script suelto de Node, fuera de la app: corre con `node`, sin compilar. */
/**
 * Arma el PDF del manual a partir de docs/manual/index.html.
 *
 * La versión sale de lib/manual.ts, que es el único lugar donde se dice. El PDF
 * queda en public/manuales/manual-operario-v<versión>.pdf y lleva la versión en
 * el pie de cada hoja. Nunca pisa una versión anterior.
 *
 * Uso, desde la raíz del repo y con Playwright instalado aparte:
 *   node docs/manual/generar-pdf.js
 * (si hace falta, CHROMIUM=/ruta/al/chromium para elegir el navegador).
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const fuente = fs.readFileSync(path.resolve("lib/manual.ts"), "utf8");
const version = Number(/version:\s*(\d+)/.exec(fuente)[1]);
const fecha = /fecha:\s*"([^"]+)"/.exec(fuente)[1];
const salida = path.resolve(`public/manuales/manual-operario-v${version}.pdf`);

(async () => {
  const html = fs.readFileSync(path.resolve("docs/manual/index.html"), "utf8");
  if (!html.includes(`Versión ${version}`)) {
    throw new Error(`La tapa del manual no dice "Versión ${version}": actualizala antes de generar.`);
  }
  const br = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const p = await br.newPage();
  await p.goto("file://" + path.resolve("docs/manual/index.html"), { waitUntil: "networkidle" });
  await p.pdf({
    path: salida,
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: "<div></div>",
    footerTemplate: `<div style="font-family:Inter,sans-serif;font-size:7px;color:#64748b;width:100%;padding:0 15mm;display:flex;justify-content:space-between"><span>Manual del operario · versión ${version} · ${fecha} · Gestión de Racks</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
    margin: { top: "16mm", bottom: "16mm", left: "15mm", right: "15mm" },
  });
  await br.close();
  console.log(`Listo: ${path.relative(process.cwd(), salida)}`);
})();
