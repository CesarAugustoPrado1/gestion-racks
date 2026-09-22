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

export const ETIQUETA_NIVEL: Record<Nivel, string> = {
  alta: "Confiable",
  media: "A chequear",
  baja: "Sin verificar hace mucho",
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
