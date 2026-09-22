/** Formato de números para pantalla. Módulo puro. */

/** 1240 -> "1.240". Los miles se leen de lejos; los números pelados no. */
export const numero = (n: number) => n.toLocaleString("es-AR");

/** "48 paquetes", "1 paquete". */
export function unidades(
  n: number,
  singular: string,
  plural: string,
): string {
  return `${numero(n)} ${n === 1 ? singular : plural}`;
}

export const ETIQUETA_PACKAGING: Record<string, string> = {
  suelto: "Suelto",
  palet: "Palet",
  optimizado: "Optimizado",
};

/** El orden de las solapas, que es el que pidió la planta. */
export const PACKAGINGS = ["suelto", "palet", "optimizado"] as const;
