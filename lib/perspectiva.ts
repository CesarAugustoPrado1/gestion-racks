/**
 * La geometría de la vista en perspectiva. Módulo PURO: sin base ni React,
 * para poder probar lo único que importa de un dibujo así, que es que no mienta.
 *
 * PENETRABLE. Cada calle es un plano vertical visto en diagonal (proyección
 * oblicua): la pared queda atrás, el piso baja en diagonal hacia el pasillo, y
 * los niveles se apilan derecho para arriba. Las calles van una al lado de la
 * otra, a lo largo del pasillo, en su orden físico.
 *
 * SELECTIVO. Se ve de frente, que es como se ve parado en el pasillo: cada
 * módulo es una grilla de columnas × niveles, con una cara de arriba y una de
 * costado finitas que le dan volumen.
 *
 * LA REGLA QUE NO SE PUEDE ROMPER: los bordes de arriba y de abajo de cada
 * hueco son PARALELOS AL PISO, y los de los costados, a la pared. Un borde que
 * se inclina distinto que el piso hace que el palet parezca caído, o que el
 * nivel parezca otro. Por eso el hueco se achica para separarlo del vecino en
 * las coordenadas del rack -profundidad y nivel- y nunca en píxeles de
 * pantalla, que es como se rompía en el primer boceto.
 */

export type Punto = [number, number];

/** De qué lado entra el clark a las calles de un penetrable. */
export type LadoAcceso = "izquierda" | "derecha";

export const MEDIDAS = {
  /** Un paso de profundidad: cuánto se corre hacia el costado y hacia arriba. */
  pasoX: 34,
  pasoY: 22,
  /** Un nivel. */
  alto: 40,
  /** Aire entre calles, además de lo que ocupa la diagonal de la calle. */
  aireEntreCalles: 46,
  /** Separación visual entre huecos vecinos, en fracción de hueco. */
  margen: 0.07,
  /** Un hueco de selectivo, de frente. */
  anchoSelectivo: 36,
  /** La profundidad aparente de un selectivo. */
  fondoX: 14,
  fondoY: 10,
  aireEntreModulos: 14,
} as const;

/* -------------------------------------------------------------------------- */
/* Penetrable                                                                 */
/* -------------------------------------------------------------------------- */

export type GeometriaPenetrable = {
  calles: number;
  niveles: number;
  profundidad: number;
  acceso: LadoAcceso;
};

/** Cuánto ocupa una calle a lo ancho, contando su diagonal. */
export function anchoDeCalle(g: Pick<GeometriaPenetrable, "profundidad">): number {
  return g.profundidad * MEDIDAS.pasoX + MEDIDAS.aireEntreCalles;
}

/**
 * Dónde cae un punto de una calle en el dibujo.
 *
 * `calle` y `nivel` van desde 0; `prof` también, con 0 en el borde del
 * PASILLO y `profundidad` contra la PARED. Acepta fracciones: así se ubican
 * los bordes de un hueco achicado.
 *
 * El origen de cada calle es la esquina del pasillo a nivel del piso. Desde
 * ahí la profundidad se va en diagonal hacia arriba y hacia el lado contrario
 * al acceso: si se entra por la derecha, la pared queda a la izquierda.
 */
export function puntoPenetrable(
  g: GeometriaPenetrable,
  calle: number,
  nivel: number,
  prof: number,
  origen: Punto,
): Punto {
  const haciaPared = g.acceso === "derecha" ? -1 : 1;
  // Las calles avanzan siempre de izquierda a derecha, en su orden físico. El
  // lado de acceso solo da vuelta hacia dónde se va la profundidad.
  const baseX =
    origen[0] +
    calle * anchoDeCalle(g) +
    (g.acceso === "derecha" ? g.profundidad * MEDIDAS.pasoX : 0);
  return [
    baseX + haciaPared * prof * MEDIDAS.pasoX,
    origen[1] - prof * MEDIDAS.pasoY - nivel * MEDIDAS.alto,
  ];
}

/**
 * Las cuatro esquinas de un hueco, ya separado de sus vecinos:
 * abajo-pasillo, abajo-pared, arriba-pared, arriba-pasillo.
 */
export function huecoPenetrable(
  g: GeometriaPenetrable,
  calle: number,
  nivel: number,
  prof: number,
  origen: Punto,
): [Punto, Punto, Punto, Punto] {
  const e = MEDIDAS.margen;
  const p = (n: number, d: number) => puntoPenetrable(g, calle, n, d, origen);
  return [
    p(nivel + e, prof + e),
    p(nivel + e, prof + 1 - e),
    p(nivel + 1 - e, prof + 1 - e),
    p(nivel + 1 - e, prof + e),
  ];
}

/** El tamaño total del dibujo de un penetrable, sin márgenes. */
export function tamanoPenetrable(g: GeometriaPenetrable): { ancho: number; alto: number } {
  return {
    ancho: g.calles * anchoDeCalle(g) - MEDIDAS.aireEntreCalles,
    alto: g.niveles * MEDIDAS.alto + g.profundidad * MEDIDAS.pasoY,
  };
}

/* -------------------------------------------------------------------------- */
/* Selectivo                                                                  */
/* -------------------------------------------------------------------------- */

export type GeometriaSelectivo = {
  modulos: number;
  ancho: number;
  niveles: number;
};

/** El borde izquierdo de un módulo, contando el aire entre módulos. */
export function xDeModulo(g: GeometriaSelectivo, modulo: number): number {
  return modulo * (g.ancho * MEDIDAS.anchoSelectivo + MEDIDAS.aireEntreModulos);
}

/**
 * Las cuatro esquinas de un hueco de selectivo, de frente: rectángulo con los
 * bordes de arriba y de abajo horizontales, que en esta vista es el piso.
 * `columnaEnModulo` y `nivel` desde 0.
 */
export function huecoSelectivo(
  g: GeometriaSelectivo,
  modulo: number,
  columnaEnModulo: number,
  nivel: number,
  origen: Punto,
): [Punto, Punto, Punto, Punto] {
  const e = MEDIDAS.margen;
  const x0 = origen[0] + xDeModulo(g, modulo) + (columnaEnModulo + e) * MEDIDAS.anchoSelectivo;
  const x1 = origen[0] + xDeModulo(g, modulo) + (columnaEnModulo + 1 - e) * MEDIDAS.anchoSelectivo;
  const y0 = origen[1] - (nivel + e) * MEDIDAS.alto;
  const y1 = origen[1] - (nivel + 1 - e) * MEDIDAS.alto;
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
}

export function tamanoSelectivo(g: GeometriaSelectivo): { ancho: number; alto: number } {
  return {
    ancho: xDeModulo(g, g.modulos) - MEDIDAS.aireEntreModulos + MEDIDAS.fondoX,
    alto: g.niveles * MEDIDAS.alto + MEDIDAS.fondoY,
  };
}

/* -------------------------------------------------------------------------- */
/* Utilidades                                                                 */
/* -------------------------------------------------------------------------- */

export const comoPuntos = (ps: Punto[]): string =>
  ps.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

export const centro = (ps: Punto[]): Punto => [
  ps.reduce((s, p) => s + p[0], 0) / ps.length,
  ps.reduce((s, p) => s + p[1], 0) / ps.length,
];

/** Pendiente de un segmento. Para los tests de paralelismo. */
export function pendiente(a: Punto, b: Punto): number {
  return (b[1] - a[1]) / (b[0] - a[0]);
}
