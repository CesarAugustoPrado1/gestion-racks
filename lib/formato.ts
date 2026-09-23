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

/**
 * Qué se cuenta en cada solapa, que NO es lo mismo en todas.
 *
 * El suelto se cuenta en unidades -20 paquetes sueltos-, porque no hay otra
 * cosa que contar: son paquetes arriba de un palet de madera.
 *
 * El palet y el optimizado se cuentan EN PALETS. Si hay 3 palets de Laja, el
 * número es 3: es lo que el autoelevador levanta, lo que entra en el camión y
 * lo que el cliente pide. Decir 144 ahí es dar un número que quien pregunta no
 * puede usar para nada, y peor: se confunde con los 20 de la solapa de al lado,
 * que sí son paquetes.
 *
 * El equivalente en unidades no se esconde, va al lado: 3 palets (144 paquetes).
 * Los dos números hacen falta, pero uno es el principal y el otro la
 * traducción.
 */
export function medidaDeSolapa(
  solapa: string,
  cuenta: { bultos: number; unidades: number },
  unidadSingular: string,
  unidadPlural: string,
): { valor: number; unidad: string; equivale: number | null } {
  if (solapa === "palet" || solapa === "optimizado") {
    return {
      valor: cuenta.bultos,
      unidad: cuenta.bultos === 1 ? "palet" : "palets",
      equivale: cuenta.unidades,
    };
  }
  return {
    valor: cuenta.unidades,
    unidad: cuenta.unidades === 1 ? unidadSingular : unidadPlural,
    equivale: null,
  };
}

/**
 * "3 palets", "Suelto: 21 placas", "5 optimizados". Para listas compactas.
 *
 * El suelto va como etiqueta y no como adjetivo -"Suelto: 21 placas" y no
 * "21 placas sueltas"- porque la unidad sale de la línea y no sabemos su
 * género: placa y caja son femeninas, paquete masculino. Un adjetivo obligaría
 * a cargar el género de cada unidad para que la app no escriba "21 placas
 * sueltos", y no vale un campo más por una `s`.
 */
export function resumenPackaging(
  packaging: string,
  cuenta: { bultos: number; unidades: number },
  unidadSingular: string,
  unidadPlural: string,
): string {
  if (packaging === "palet") {
    return `${numero(cuenta.bultos)} palet${cuenta.bultos === 1 ? "" : "s"}`;
  }
  if (packaging === "optimizado") {
    return `${numero(cuenta.bultos)} optimizado${cuenta.bultos === 1 ? "" : "s"}`;
  }
  return `Suelto: ${unidades(cuenta.unidades, unidadSingular, unidadPlural)}`;
}

/**
 * Abreviaturas de dos letras, únicas entre sí.
 *
 * En el tablero cada celda lleva la abreviatura de su línea además del color:
 * el color solo no puede cargar la identidad -hay quien no lo distingue, y una
 * pantalla al sol tampoco-. Y "Placas" y "Piedras" empiezan igual, así que la
 * abreviatura se calcula mirando a las demás en vez de cortar las dos primeras
 * letras y rezar.
 */
export function abreviaturas(nombres: string[]): Record<string, string> {
  const salida: Record<string, string> = {};
  const usadas = new Set<string>();

  for (const nombre of nombres) {
    const limpio = nombre
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toUpperCase();
    const palabras = limpio.split(/\s+/).filter(Boolean);

    const candidatos = [
      // Iniciales de las palabras: "Pisos Flotantes" -> PF.
      palabras.length > 1 ? palabras[0][0] + palabras[1][0] : "",
      limpio.slice(0, 2),
      ...[...limpio.slice(1)].map((c) => limpio[0] + c),
    ].filter((c) => c.length === 2);

    const elegida = candidatos.find((c) => !usadas.has(c)) ?? limpio.slice(0, 2);
    usadas.add(elegida);
    salida[nombre] = elegida;
  }
  return salida;
}
