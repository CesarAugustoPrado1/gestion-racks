/**
 * Cuentas del tablero y de estadísticas que no necesitan base. Módulo PURO:
 * se prueba sin Postgres y lo usan las dos pantallas.
 */

/** Los períodos que se pueden elegir en estadísticas, en días. */
export const PERIODOS = [7, 30, 90, 365] as const;
export type Periodo = (typeof PERIODOS)[number];

/** Lee `?dias=` de la URL. Cualquier cosa rara vuelve a 30. */
export function leerPeriodo(crudo: string | undefined): Periodo {
  const n = Number(crudo);
  return (PERIODOS as readonly number[]).includes(n) ? (n as Periodo) : 30;
}

export function etiquetaPeriodo(dias: Periodo): string {
  return dias === 365 ? "último año" : `últimos ${dias} días`;
}

/** Porcentaje entero, sin dividir por cero. */
export function porcentaje(parte: number, total: number): number {
  return total > 0 ? Math.round((parte / total) * 100) : 0;
}

/**
 * Completa una serie diaria con ceros en los días sin movimientos.
 *
 * Sin esto, un gráfico de barras por día salta del lunes al jueves sin avisar,
 * y dos días tranquilos se leen como uno. Los días van en hora de Argentina,
 * igual que los agrupa la consulta.
 */
export function completarDias(
  filas: Array<{ dia: string; valor: number }>,
  dias: number,
  hoy: string,
): Array<{ dia: string; valor: number }> {
  const porDia = new Map(filas.map((f) => [f.dia, f.valor]));
  const salida: Array<{ dia: string; valor: number }> = [];
  const fin = new Date(`${hoy}T12:00:00Z`);
  for (let i = dias - 1; i >= 0; i--) {
    const d = new Date(fin.getTime() - i * 86400000).toISOString().slice(0, 10);
    salida.push({ dia: d, valor: porDia.get(d) ?? 0 });
  }
  return salida;
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
