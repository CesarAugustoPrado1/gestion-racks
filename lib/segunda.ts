/**
 * CÓMO SE VE EL PRODUCTO DE SEGUNDA. Lo eligen los dos tildes del encabezado y
 * vale para todo lo que se mira: Resumen, Stock, Estadísticas y Movimientos.
 *
 * - `oculta`: la segunda no existe. No suma en ningún total ni aparece en
 *   ninguna lista.
 * - `junta`: es stock como cualquier otro. Suma, y no se la distingue.
 * - `discriminada`: suma, y se dice aparte cuánto de cada cosa es de segunda.
 *
 * Es una forma de MIRAR, no un dato: se guarda en una cookie del navegador, así
 * cada uno la deja como le sirve y nadie le cambia la pantalla a otro.
 *
 * Lo que NO cambia: las pantallas donde se opera (Mover, Control, Racks, el
 * plano). Ahí manda lo que hay en el rack: un palet de segunda oculto sería un
 * hueco que parece libre y no lo está.
 *
 * Módulo puro: lo usan el servidor y el encabezado.
 */
export type VistaSegunda = "oculta" | "junta" | "discriminada";

export const COOKIE_SEGUNDA = "vista_segunda";

/** Sin elegir, discriminada: es la que no esconde ni mezcla nada. */
export const VISTA_POR_DEFECTO: VistaSegunda = "discriminada";

export function leerVista(valor: string | null | undefined): VistaSegunda {
  return valor === "oculta" || valor === "junta" || valor === "discriminada" ? valor : VISTA_POR_DEFECTO;
}

/** Si la segunda entra en las cuentas. */
export const sumaSegunda = (v: VistaSegunda): boolean => v !== "oculta";

/** Si se dice aparte qué es de segunda. */
export const distingueSegunda = (v: VistaSegunda): boolean => v === "discriminada";

/**
 * Las pantallas donde la vista de segunda cambia algo: las de MIRAR. La franja
 * del encabezado se muestra solo ahí.
 */
const RUTAS_CON_VISTA = ["/resumen", "/stock", "/estadisticas", "/movimientos"];

export const aplicaVistaSegunda = (ruta: string): boolean =>
  RUTAS_CON_VISTA.some((r) => ruta === r || ruta.startsWith(`${r}/`));
