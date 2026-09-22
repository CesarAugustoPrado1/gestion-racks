import type { Packaging } from "./db/schema";

/**
 * Reglas sobre la composicion de un bulto. Modulo PURO: sin base de datos, para
 * poder usarlo en el servidor y en la pantalla sin duplicar la regla.
 */

export type LineaContenido = { modeloId: number; cantidad: number };

/** Un bulto es mezclado cuando lleva mas de un modelo. Se deriva, no se carga. */
export function esMezclado(contenido: LineaContenido[]): boolean {
  return contenido.length > 1;
}

/**
 * Por que un bulto mezclado no puede ser `palet` ni `optimizado`.
 *
 * La norma vive en (modelo, packaging): "un palet de Laja lleva 48 paquetes".
 * Un bulto con dos modelos no tiene contra que compararse -no hay UN modelo del
 * cual sea el palet- asi que no puede ser normalizado por definicion, no por una
 * limitacion del sistema. Y `palet` y `optimizado` significan exactamente eso
 * para el que vende: producto normalizado, con una cantidad que el cliente ya
 * sabe. Dejar que un mezclado se registre como palet haria que el stock de
 * palets de Laja incluyera bultos que nadie puede despachar como palet de Laja.
 *
 * Por eso va como `suelto`, que es lo que es: producto arriba de un palet de
 * madera, contado de a uno.
 */
export function validarComposicion(
  packaging: Packaging,
  contenido: LineaContenido[],
): string | null {
  if (contenido.length === 0) {
    return "El bulto tiene que llevar al menos un modelo.";
  }
  if (contenido.some((l) => l.cantidad <= 0)) {
    return "Las cantidades tienen que ser mayores a cero.";
  }
  const repetidos = new Set(contenido.map((l) => l.modeloId)).size !== contenido.length;
  if (repetidos) {
    return "Hay un modelo repetido: cada modelo va en una sola línea.";
  }
  if (esMezclado(contenido) && packaging !== "suelto") {
    return (
      "Un bulto con más de un modelo va como suelto: mezclado no es " +
      "normalizado, porque la cantidad normalizada es de un modelo y un " +
      "packaging."
    );
  }
  return null;
}

export const total = (contenido: LineaContenido[]): number =>
  contenido.reduce((suma, l) => suma + l.cantidad, 0);

/**
 * Si la cantidad coincide con la norma. `null` cuando no hay norma contra que
 * comparar -producto suelto, bulto mezclado- y eso NO es "fuera de norma": es
 * que la pregunta no aplica.
 */
export function fueraDeNorma(
  cantidad: number,
  norma: number | null,
): boolean | null {
  if (norma == null) return null;
  return cantidad !== norma;
}
