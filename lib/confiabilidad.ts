/**
 * El índice de confiabilidad. Módulo PURO: sin base, para que el servidor y la
 * pantalla usen exactamente la misma cuenta.
 *
 * La idea, en una línea: un bulto chequeado ayer es más confiable que uno
 * chequeado hace dos meses. Pero eso solo no alcanza, porque una posición donde
 * el control SIEMPRE encuentra errores no es confiable aunque se haya chequeado
 * ayer. Por eso el índice tiene dos mitades.
 */

export type Confianza = {
  /** 0 a 1. Es `frescura × acierto`. */
  valor: number;
  /** Cuánto pesa todavía el último chequeo. */
  frescura: number;
  /** Qué proporción de los chequeos dio bien. */
  acierto: number;
  diasDesdeElChequeo: number;
};

/**
 * `null` significa **nunca se chequeó**, y no es lo mismo que cero.
 *
 * Cero sería "se miró y está mal". Nunca chequeado es una pregunta que todavía
 * no se hizo, y se muestra aparte en vez de promediarse: meterlo al denominador
 * hundiría el indicador con datos que no son malos, solo desconocidos. Es el
 * mismo criterio que `sinNorma` en la adherencia de Control-Secaderos.
 */
export function confianza(
  fila: {
    chequeadoEn: Date | string | null;
    chequeosOk: number;
    chequeosTotal: number;
  },
  semividaDias: number,
  ahora: Date = new Date(),
): Confianza | null {
  if (!fila.chequeadoEn) return null;

  const cuando =
    fila.chequeadoEn instanceof Date
      ? fila.chequeadoEn
      : new Date(fila.chequeadoEn);
  const dias = Math.max(
    0,
    (ahora.getTime() - cuando.getTime()) / (24 * 60 * 60 * 1000),
  );

  /**
   * Decaimiento por semivida: a los `semividaDias` vale la mitad, al doble un
   * cuarto. Con 30 días: ayer ≈ 0.98, hace un mes 0.50, hace dos 0.25.
   *
   * Se eligió una curva y no escalones porque los escalones hacen que un bulto
   * cambie de color de un día para el otro sin que haya pasado nada.
   */
  const frescura = Math.pow(0.5, dias / semividaDias);

  /**
   * Corrección de Laplace (+1 sobre +2). Sin ella, un único chequeo que dio
   * bien daría acierto 1 -confianza total con una sola observación- y uno que
   * dio mal daría 0, que condenaría a la posición para siempre. Con ella, un
   * solo chequeo bueno da 0.67 y uno malo 0.33: sospecha, no sentencia.
   */
  const acierto = (fila.chequeosOk + 1) / (fila.chequeosTotal + 2);

  return {
    valor: frescura * acierto,
    frescura,
    acierto,
    diasDesdeElChequeo: Math.floor(dias),
  };
}

export type Nivel = "alta" | "media" | "baja" | "sin_datos";

export function nivel(c: Confianza | null): Nivel {
  if (!c) return "sin_datos";
  if (c.valor >= 0.5) return "alta";
  if (c.valor >= 0.25) return "media";
  return "baja";
}

/**
 * Las etiquetas se componen con la fecha -"Confiable · hace 2 días"- así que
 * ninguna puede hablar del tiempo por su cuenta: "Sin verificar hace mucho ·
 * hace un mes" decía dos veces lo mismo y ninguna de las dos bien.
 */
export const ETIQUETA_NIVEL: Record<Nivel, string> = {
  alta: "Confiable",
  media: "A chequear",
  baja: "Poco confiable",
  sin_datos: "Nunca chequeado",
};

/** Clases de Tailwind por nivel. Los colores están en app/globals.css. */
export const COLOR_NIVEL: Record<Nivel, { chip: string; punto: string }> = {
  alta: { chip: "bg-confiable-suave text-confiable", punto: "bg-confiable" },
  media: { chip: "bg-dudoso-suave text-yellow-800", punto: "bg-dudoso" },
  baja: { chip: "bg-vencido-suave text-vencido", punto: "bg-vencido" },
  sin_datos: {
    chip: "bg-sin-datos-suave text-slate-500",
    punto: "bg-sin-datos",
  },
};

/**
 * Qué decir cuando no hay confianza que mostrar.
 *
 * "Nunca chequeado" y "se chequeó, pero después se movió" son dos cosas
 * distintas, y las dos dan `null`. Una posición con historial que quedó sin
 * fecha porque entró un bulto nuevo NO es una posición que nadie miró nunca, y
 * decirle así sería mentirle al que decide adónde ir.
 */
export function etiquetaDeEstado(
  fila: { chequeadoEn: Date | string | null; chequeosTotal: number },
  c: Confianza | null,
): string {
  if (c) return `${ETIQUETA_NIVEL[nivel(c)]} · ${hace(c.diasDesdeElChequeo)}`;
  return fila.chequeosTotal > 0
    ? "Sin verificar desde el último movimiento"
    : "Nunca chequeado";
}

/** "hace 3 días", "hace 2 meses". El número exacto de días no dice nada de lejos. */
export function hace(dias: number): string {
  if (dias <= 0) return "hoy";
  if (dias === 1) return "ayer";
  if (dias < 30) return `hace ${dias} días`;
  const meses = Math.round(dias / 30);
  return meses === 1 ? "hace un mes" : `hace ${meses} meses`;
}

/**
 * El índice de un conjunto: promedio de los que TIENEN dato, más la cuenta de
 * los que no.
 *
 * Devolver las dos cosas juntas es deliberado: un 0.82 sobre el 30% de los
 * bultos no es un 0.82, y la pantalla que muestre uno tiene que poder mostrar
 * el otro al lado.
 */
export function indice(confianzas: Array<Confianza | null>): {
  valor: number | null;
  medidos: number;
  sinDatos: number;
} {
  const conDato = confianzas.filter((c): c is Confianza => c != null);
  const sinDatos = confianzas.length - conDato.length;
  if (conDato.length === 0) return { valor: null, medidos: 0, sinDatos };
  return {
    valor: conDato.reduce((s, c) => s + c.valor, 0) / conDato.length,
    medidos: conDato.length,
    sinDatos,
  };
}

/**
 * El piso de olvido: qué posiciones suben al tope por viejas, no por grandes.
 *
 * POR QUÉ EXISTE. La recorrida ordena por `(1 − confianza) × cantidad`, y esa
 * multiplicación tiene un agujero: la urgencia máxima de una posición es su
 * cantidad, porque la confianza no baja de cero. Entonces una posición chica
 * puede quedar POR DEBAJO de una grande para siempre, no "mucho tiempo" sino
 * literalmente siempre. Medido con los datos de ejemplo: una posición de 90
 * unidades recién chequeada tiene urgencia 4.1, y una de 4 unidades que nadie
 * miró nunca tiene urgencia 4.0. La segunda no la alcanza jamás, por años que
 * pasen, y el sistema decide no mirar ese rincón nunca.
 *
 * CÓMO SE ARREGLA. Lo que hace mucho que nadie mira sube al tope, por chico que
 * sea. Adentro de ese grupo se sigue ordenando por urgencia, así que el
 * operario ve primero lo olvidado Y grande.
 *
 * POR QUÉ SOLO LAS QUE TIENEN PRODUCTO. Una posición que el sistema cree vacía
 * no guarda stock: si estuviera ocupada, el error aparece solo la primera vez
 * que alguien intente poner algo ahí. La dirección peligrosa es la otra -el
 * sistema dice que hay y no hay-, y esa tiene cantidad > 0, así que queda
 * cubierta. Sin esta condición el tope de la recorrida se llenaría de
 * posiciones vacías sin chequear (en el ejemplo son 67) y el operario tendría
 * que pasar por todas antes de llegar a un palet.
 *
 * `null` en `chequeadoEn` -nunca chequeada- cuenta como olvidada: es la que más
 * tiempo lleva sin mirarse, no la que menos.
 */
export function estaOlvidada(
  fila: { chequeadoEn: Date | string | null; unidades: number },
  pisoDias: number,
  ahora: Date = new Date(),
): boolean {
  if (pisoDias <= 0) return false; // 0 = piso desactivado
  if (fila.unidades <= 0) return false;
  if (!fila.chequeadoEn) return true;

  const cuando =
    fila.chequeadoEn instanceof Date
      ? fila.chequeadoEn
      : new Date(fila.chequeadoEn);
  const dias = (ahora.getTime() - cuando.getTime()) / (24 * 60 * 60 * 1000);
  return dias >= pisoDias;
}

/**
 * Ordena la recorrida: primero lo olvidado, después lo demás, y adentro de cada
 * grupo por urgencia.
 *
 * Ordena una copia y no la lista que recibe: una función que reordena el array
 * de quien la llama sorprende a alguien tarde o temprano.
 */
export function ordenarRecorrida<T extends { olvidada: boolean; urgencia: number }>(
  filas: T[],
): T[] {
  return [...filas].sort(
    (a, b) =>
      Number(b.olvidada) - Number(a.olvidada) || b.urgencia - a.urgencia,
  );
}

/**
 * El indice de cada grupo: "por linea", "por modelo", "por rack".
 *
 * Vive aca y no en la pantalla porque tiene una regla que se puede romper sin
 * que se note: los `null` de cada grupo se cuentan aparte, igual que en
 * `indice()`. Una agrupacion escrita al paso en un componente los promediaria
 * como cero, y el numero quedaria mal en la pantalla que existe justamente para
 * decir de que fiarse.
 *
 * El orden de salida es el de APARICION, no alfabetico: quien arma la lista ya
 * la trajo ordenada de la base -por `orden` de linea y de modelo- y reordenar
 * aca le pisaria esa decision.
 */
export function agruparIndices<T>(
  filas: T[],
  clave: (f: T) => string,
  confianzaDe: (f: T) => Confianza | null,
): Array<{ clave: string; valor: number | null; medidos: number; sinDatos: number }> {
  const mapa = new Map<string, Array<Confianza | null>>();
  for (const f of filas) {
    const k = clave(f);
    const previas = mapa.get(k);
    if (previas) previas.push(confianzaDe(f));
    else mapa.set(k, [confianzaDe(f)]);
  }
  return [...mapa.entries()].map(([k, cs]) => ({ clave: k, ...indice(cs) }));
}
