/**
 * La geometría de los racks. Módulo PURO: sin base, para que el generador, el
 * motor y la pantalla usen las mismas reglas.
 *
 * Tres niveles de vocabulario, y son tres de verdad:
 *
 *   GRUPO     A, B, C… Un lugar físico con características uniformes. Puede
 *             haber dos grupos iguales: el grupo es un lugar, no un tipo.
 *   UNIDAD    un MÓDULO en un selectivo, una CALLE en un penetrable.
 *   POSICIÓN  un slot para UN bulto, con dirección propia.
 *
 * Selectivo:  ancho × niveles       módulo de 2×3 = 6 posiciones
 * Penetrable: niveles × profundidad calle de 3×2 = 6 posiciones
 */

export type TipoGrupo = "selectivo" | "penetrable";

export type Geometria = {
  tipo: TipoGrupo;
  /** Columnas por módulo. Solo selectivo. */
  ancho: number | null;
  niveles: number;
  /** Bultos uno detrás de otro. Solo penetrable. */
  profundidad: number | null;
  /** Cuántos módulos o calles tiene el grupo. */
  unidades: number;
};

/**
 * Nombres de los niveles, derivados de cuántos hay.
 *
 * En la planta les dicen piso, medio y arriba. Con cuatro no tenían nombre, así
 * que se numeran los del medio: piso, medio 1, medio 2, arriba. Se derivan y no
 * se cargan a mano porque son los mismos en todos los grupos, y un nombre que se
 * escribe una vez por grupo es un nombre que un día va a estar mal escrito.
 */
export function nombreDeNivel(nivel: number, niveles: number): string {
  if (nivel === 1) return "piso";
  if (nivel === niveles) return "arriba";
  if (niveles === 3) return "medio";
  return `medio ${nivel - 1}`;
}

/**
 * Nombres de la profundidad. `pasillo` es por donde entra el autoelevador y
 * `pared` el fondo, que es exactamente el orden en que hay que sacarlos.
 */
export function nombreDeProfundidad(p: number, profundidad: number): string {
  if (profundidad === 1) return "única";
  if (p === 1) return "pasillo";
  if (p === profundidad) return "pared";
  // "centro" y no "medio": el nivel del medio ya se llama medio, y una posición
  // descrita como "medio, medio" no le dice nada a nadie.
  if (profundidad === 3) return "centro";
  return `centro ${p - 1}`;
}

export type Coordenada = {
  unidad: number;
  /** Columna corrida dentro del grupo. Solo selectivo. */
  columna: number | null;
  nivel: number;
  /** Solo penetrable. 1 es el del pasillo. */
  profundidad: number | null;
};

const dos = (n: number) => String(n).padStart(2, "0");

/**
 * El código que se pinta en el fierro y se dice por handy.
 *
 *   D-06-3     selectivo: columna 6, nivel 3
 *   B-07-2-1   penetrable: calle 7, nivel 2, profundidad 1 (pasillo)
 *
 * En los selectivos las columnas van corridas por grupo en vez de "módulo 3,
 * columna 2": para el que busca, "06" es un solo número, y "módulo 3 derecha"
 * son dos datos y una convención más para recordar.
 */
export function codigoDePosicion(c: Coordenada): string {
  return c.profundidad != null
    ? `${dos(c.unidad)}-${c.nivel}-${c.profundidad}`
    : `${dos(c.columna ?? c.unidad)}-${c.nivel}`;
}

/** Todas las posiciones que le corresponden a un grupo por su geometría. */
export function posicionesDe(g: Geometria): Coordenada[] {
  const salida: Coordenada[] = [];

  for (let u = 1; u <= g.unidades; u++) {
    for (let nivel = 1; nivel <= g.niveles; nivel++) {
      if (g.tipo === "penetrable") {
        for (let p = 1; p <= (g.profundidad ?? 1); p++) {
          salida.push({ unidad: u, columna: null, nivel, profundidad: p });
        }
      } else {
        for (let col = 1; col <= (g.ancho ?? 1); col++) {
          salida.push({
            unidad: u,
            // La columna corrida: módulo 3, columna 2 de un rack de 2 = columna 6.
            columna: (u - 1) * (g.ancho ?? 1) + col,
            nivel,
            profundidad: null,
          });
        }
      }
    }
  }
  return salida;
}

export function cuantasPosiciones(g: Geometria): number {
  const porUnidad =
    g.tipo === "penetrable"
      ? g.niveles * (g.profundidad ?? 1)
      : g.niveles * (g.ancho ?? 1);
  return porUnidad * g.unidades;
}

/** "2 × 3, 5 módulos" o "3 × 2, 15 calles". */
export function describirGeometria(g: Geometria): string {
  const unidad = g.tipo === "penetrable" ? "calle" : "módulo";
  const forma =
    g.tipo === "penetrable"
      ? `${g.niveles} × ${g.profundidad} (niveles × profundidad)`
      : `${g.ancho} × ${g.niveles} (ancho × niveles)`;
  return `${forma}, ${g.unidades} ${unidad}${g.unidades === 1 ? "" : "s"}`;
}

/* -------------------------------------------------------------------------- */
/* Accesibilidad                                                              */
/* -------------------------------------------------------------------------- */

export type Ocupada = {
  nivel: number;
  profundidad: number | null;
  /** Para poder nombrar en el mensaje qué está estorbando. */
  etiqueta: string;
};

/**
 * Qué está tapando a una posición de un penetrable. Vacío = se puede tocar.
 *
 * Son DOS bloqueos distintos y los dos vienen de cómo se mueve el autoelevador:
 *
 * 1. **El mismo nivel, más cerca del pasillo.** Para llegar al del fondo hay que
 *    bajar el de adelante. Es el LIFO clásico del drive-in.
 *
 * 2. **El piso, hasta esa profundidad.** El clark entra manejando por adentro de
 *    la calle, así que un palet en el piso le corta el camino: no puede sacar el
 *    del nivel medio si el del pasillo del piso está ocupado. Esta es la regla
 *    que hace que un penetrable se vacíe de arriba hacia abajo y de afuera hacia
 *    adentro, y la que más movimientos va a rechazar.
 *
 * En un selectivo no hay nada de esto: cada posición se alcanza sin mover nada.
 */
export function loQueTapa(
  objetivo: { nivel: number; profundidad: number | null },
  ocupadas: Ocupada[],
): Ocupada[] {
  if (objetivo.profundidad == null) return [];
  const p = objetivo.profundidad;

  return ocupadas.filter((o) => {
    if (o.profundidad == null) return false;
    // Mismo nivel, más cerca del pasillo.
    if (o.nivel === objetivo.nivel && o.profundidad < p) return true;
    // El piso le corta el camino al clark, hasta la profundidad que necesita.
    if (objetivo.nivel > 1 && o.nivel === 1 && o.profundidad <= p) return true;
    return false;
  });
}

/** "B-07-2-1 · medio, pasillo". Para los selectores de posición. */
export function describirPosicion(p: {
  codigo: string;
  nivel: number;
  niveles: number;
  profundidad: number | null;
  profundidadMax: number | null;
}): string {
  const partes = [nombreDeNivel(p.nivel, p.niveles)];
  if (p.profundidad != null) {
    partes.push(nombreDeProfundidad(p.profundidad, p.profundidadMax ?? 1));
  }
  return `${p.codigo} · ${partes.join(", ")}`;
}
