/**
 * Cuentas del tablero y de estadísticas que no necesitan base. Módulo PURO:
 * se prueba sin Postgres y lo usan las dos pantallas.
 */

/** Porcentaje entero, sin dividir por cero. */
export function porcentaje(parte: number, total: number): number {
  return total > 0 ? Math.round((parte / total) * 100) : 0;
}

/**
 * Los tramos de antigüedad del stock. Ordenados de nuevo a viejo: es una
 * escala, no categorías sueltas, y así se lee de izquierda a derecha.
 */
export const TRAMOS_ANTIGUEDAD = [
  { hasta: 7, etiqueta: "menos de 1 semana" },
  { hasta: 30, etiqueta: "1 semana a 1 mes" },
  { hasta: 90, etiqueta: "1 a 3 meses" },
  { hasta: 180, etiqueta: "3 a 6 meses" },
  { hasta: Infinity, etiqueta: "más de 6 meses" },
] as const;

export function tramoDeAntiguedad(dias: number): string {
  return TRAMOS_ANTIGUEDAD.find((t) => dias < t.hasta)!.etiqueta;
}

/** La mediana: la cuenta honesta de "cuánto tarda" cuando hay pocos muy largos. */
export function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const v = [...valores].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** "3 días", "1 día", "menos de 1 día". */
export function dias(n: number | null): string {
  if (n == null) return "—";
  if (n < 1) return "menos de 1 día";
  const r = Math.round(n);
  return `${r} día${r === 1 ? "" : "s"}`;
}
