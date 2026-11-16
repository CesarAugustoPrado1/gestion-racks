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
  // Un objeto no es producto: no lleva modelos, se describe con texto.
  if (packaging === "objeto") {
    return contenido.length > 0
      ? "Un objeto no lleva modelos: lo que hay se describe con texto."
      : null;
  }
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

/** Si el bulto es un objeto: algo que ocupa lugar pero no es producto. */
export const esObjeto = (packaging: Packaging | string): boolean => packaging === "objeto";

/**
 * Qué hay en un objeto. Obligatorio: es lo único que dice qué ocupa la
 * posición, y "objeto" a secas no le sirve a nadie que vaya a buscarlo.
 */
export function validarDescripcion(descripcion: string | null | undefined): string | null {
  const d = (descripcion ?? "").trim();
  if (d.length < 3) return "Escribí qué hay: por ejemplo «6 sillas a reparar».";
  if (d.length > 200) return "La descripción es muy larga.";
  return null;
}

export const total = (contenido: LineaContenido[]): number =>
  contenido.reduce((suma, l) => suma + l.cantidad, 0);

/** `palet` y `optimizado`: los dos packagings de cantidad normalizada. */
export const esNormalizado = (packaging: Packaging | string): boolean =>
  packaging === "palet" || packaging === "optimizado";

/**
 * LA REGLA DE LA CANTIDAD NORMALIZADA. Un palet y un optimizado llevan
 * exactamente la cantidad configurada para ese modelo: es fija, no la escribe
 * el operario y solo la cambia el administrador desde Configuración.
 *
 * - Sin cantidad configurada, ese modelo no se puede cargar como palet (u
 *   optimizado): va como suelto hasta que el admin la configure.
 * - Con otra cantidad, no es un palet: es suelto. Siempre.
 *
 * Al revés NO vale: un suelto con la misma cantidad que un palet sigue siendo
 * suelto. Un palet conlleva un armado, y 300 placas sueltas no son un palet de
 * 300 placas. Por eso el packaging lo dice el operario y nunca se deduce de la
 * cantidad.
 *
 * Pura: la pantalla y el servidor usan la misma, cada uno con sus normas.
 */
export function validarNormalizado(
  packaging: Packaging,
  contenido: LineaContenido[],
  normaDe: (modeloId: number) => number | null | undefined,
  nombreDe: (modeloId: number) => string = () => "ese modelo",
): string | null {
  if (!esNormalizado(packaging) || contenido.length !== 1) return null;
  const { modeloId, cantidad } = contenido[0];
  const norma = normaDe(modeloId);
  const como = packaging === "palet" ? "palet" : "optimizado";
  if (norma == null) {
    return (
      `${nombreDe(modeloId)} no tiene cantidad normalizada de ${como}. ` +
      `Cargalo como suelto, o pedile al administrador que la configure.`
    );
  }
  if (cantidad !== norma) {
    return (
      `Un ${como} de ${nombreDe(modeloId)} lleva ${norma}, y no se puede cambiar. ` +
      `Si hay ${cantidad}, va como suelto.`
    );
  }
  return null;
}

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
