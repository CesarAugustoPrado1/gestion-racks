/**
 * El estado de la carga inicial de un grupo. Puro: lo usan el servidor y la
 * pantalla. La lógica de la carga vive en lib/acciones/carga-motor.ts.
 */
export type EstadoCarga = "sin_iniciar" | "en_curso" | "cerrada";

export function estadoDeCarga(g: {
  cargaInicialDesde: Date | string | null;
  cargaInicialCerradaEn: Date | string | null;
}): EstadoCarga {
  if (g.cargaInicialDesde == null) return "sin_iniciar";
  return g.cargaInicialCerradaEn == null ? "en_curso" : "cerrada";
}
