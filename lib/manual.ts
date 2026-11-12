/**
 * El manual del operario vigente. Es el ÚNICO lugar donde se dice qué versión
 * es: de acá lo leen el botón del encabezado, la redirección de /manual.pdf
 * (next.config.ts) y el script que arma el PDF (docs/manual/generar-pdf.js).
 *
 * Cada versión es un archivo propio y nunca se reemplaza: las anteriores
 * quedan en public/manuales/ para que no se pierdan.
 */
export const MANUAL = {
  version: 6,
  fecha: "noviembre de 2026",
} as const;

export const archivoDelManual = (version: number) => `/manuales/manual-operario-v${version}.pdf`;

export const MANUAL_VIGENTE = archivoDelManual(MANUAL.version);
