/**
 * La confiabilidad EN EL PASADO: cómo estaba en cada instante, para dibujar las
 * curvas. Módulo PURO: recibe los eventos ya leídos y no toca la base.
 *
 * Usa la misma `confianza()` e `indice()` que el resto del sistema, sobre las
 * mismas filas (un bulto por modelo que lleva, como `bultosConChequeo`), así
 * que en el presente da el mismo número que el índice de hoy.
 *
 * CÓMO SE REARMA. Se recorre la historia en orden, igual que pasó:
 *
 * - Un CHEQUEO en una posición verifica a los bultos que están ahí: les suma un
 *   chequeo (y un acierto si no hubo que corregir) y les pone la fecha.
 * - Un MOVIMIENTO le borra el chequeo al bulto y a las posiciones que toca,
 *   como hace el motor. La excepción son los ajustes de control que dejan el
 *   bulto en su lugar: traen su propio chequeo y no borran nada.
 * - Una CARGA INICIAL deja al bulto verificado en ese momento.
 *
 * Lo único que no se puede rearmar es el "Está" de la carga inicial sobre un
 * bulto que ya estaba cargado de antes: no deja fila. Para esos bultos la
 * curva del pasado queda más baja que lo que fue.
 */

import { confianza, indice } from "./confiabilidad";

export type EventoMovimiento = {
  t: number;
  /** Para desempatar en el mismo instante: el orden de la base. */
  id: number;
  bultoId: number;
  tipo: string;
  packaging: string;
  cantidad: number;
  desde: number | null;
  hasta: number | null;
  /** Contenido DESPUÉS del movimiento. */
  lineas: Array<{ modeloId: number; cantidad: number }>;
};

export type EventoChequeo = {
  t: number;
  id: number;
  posicionId: number;
  bien: boolean;
};

/** Cómo se agrupa: a qué grupo, nivel, línea… pertenece cada fila. */
export type Dimensiones = {
  grupoDe: (posicionId: number) => string | null;
  nivelDe: (posicionId: number) => string | null;
  lineaDe: (modeloId: number) => string | null;
};

export type Indice = ReturnType<typeof indice>;

export type PuntoDeCurva = {
  t: number;
  general: Indice;
  porGrupo: Record<string, Indice>;
  porNivel: Record<string, Indice>;
  porLinea: Record<string, Indice>;
  porModelo: Record<number, Indice>;
  /** La confianza de una posición pedida (la de la posición, no la del bulto). */
  posicion: number | null;
};

type Verificacion = { chequeadoEn: Date | null; chequeosOk: number; chequeosTotal: number };

/**
 * Un movimiento que NO borra el chequeo: el ajuste de control que deja el bulto
 * en una posición. Es lo que hace `conservarChequeo` en el motor.
 */
const conservaChequeo = (m: EventoMovimiento) => m.tipo === "ajuste" && m.hasta != null;

export function curvasDeConfianza(
  movimientos: EventoMovimiento[],
  chequeos: EventoChequeo[],
  instantes: number[],
  semivida: number,
  dim: Dimensiones,
  posicionPedida: number | null = null,
): PuntoDeCurva[] {
  // Todos los eventos en orden. A igual hora, el movimiento antes que el
  // chequeo: un ajuste y su chequeo se escriben en ese orden.
  const eventos = [
    ...movimientos.map((m) => ({ t: m.t, orden: 0, id: m.id, m, c: null as EventoChequeo | null })),
    ...chequeos.map((c) => ({ t: c.t, orden: 1, id: c.id, m: null as EventoMovimiento | null, c })),
  ].sort((a, b) => a.t - b.t || a.orden - b.orden || a.id - b.id);

  type Bulto = Verificacion & { pos: number | null; lineas: EventoMovimiento["lineas"]; enStock: boolean; objeto: boolean };
  const bultos = new Map<number, Bulto>();
  const enPosicion = new Map<number, Set<number>>();
  const posiciones = new Map<number, Verificacion>();

  const verificacionDePos = (p: number) =>
    posiciones.get(p) ?? posiciones.set(p, { chequeadoEn: null, chequeosOk: 0, chequeosTotal: 0 }).get(p)!;
  const sacarDe = (p: number | null, b: number) => {
    if (p != null) enPosicion.get(p)?.delete(b);
  };
  const ponerEn = (p: number | null, b: number) => {
    if (p != null) (enPosicion.get(p) ?? enPosicion.set(p, new Set()).get(p)!).add(b);
  };

  const salida: PuntoDeCurva[] = [];
  let i = 0;
  for (const instante of [...instantes].sort((a, b) => a - b)) {
    // Todo lo que pasó ANTES del instante.
    for (; i < eventos.length && eventos[i].t < instante; i++) {
      const e = eventos[i];
      if (e.m) {
        const m = e.m;
        const previo = bultos.get(m.bultoId);
        const salio = m.tipo === "sacar" && m.cantidad === 0;
        const b: Bulto = previo ?? { chequeadoEn: null, chequeosOk: 0, chequeosTotal: 0, pos: null, lineas: [], enStock: true, objeto: false };
        sacarDe(b.pos, m.bultoId);
        b.pos = salio ? null : m.hasta;
        b.lineas = m.lineas.filter((l) => l.cantidad > 0);
        b.enStock = !salio;
        b.objeto = m.packaging === "objeto";
        if (m.tipo === "inicial") {
          // La carga inicial deja el bulto verificado en ese momento.
          b.chequeadoEn = new Date(m.t);
          b.chequeosOk = 1;
          b.chequeosTotal = 1;
        } else if (!conservaChequeo(m)) {
          b.chequeadoEn = null;
          b.chequeosOk = 0;
          b.chequeosTotal = 0;
        }
        if (b.enStock) ponerEn(b.pos, m.bultoId);
        bultos.set(m.bultoId, b);
        // Las posiciones tocadas pierden la fecha, no los contadores.
        if (!conservaChequeo(m)) {
          for (const p of [m.desde, m.hasta]) if (p != null) verificacionDePos(p).chequeadoEn = null;
        }
        if (m.tipo === "inicial" && m.hasta != null) {
          const vp = verificacionDePos(m.hasta);
          vp.chequeadoEn = new Date(m.t);
          vp.chequeosOk++;
          vp.chequeosTotal++;
        }
      } else if (e.c) {
        const c = e.c;
        const vp = verificacionDePos(c.posicionId);
        vp.chequeadoEn = new Date(c.t);
        vp.chequeosTotal++;
        if (c.bien) vp.chequeosOk++;
        for (const id of enPosicion.get(c.posicionId) ?? []) {
          const b = bultos.get(id)!;
          b.chequeadoEn = new Date(c.t);
          b.chequeosTotal++;
          if (c.bien) b.chequeosOk++;
        }
      }
    }

    // La foto de la confiabilidad en este instante.
    const ahora = new Date(instante);
    const todas: Array<ReturnType<typeof confianza>> = [];
    const agregar = (mapa: Map<string, Array<ReturnType<typeof confianza>>>, clave: string | null, c: ReturnType<typeof confianza>) => {
      if (clave == null) return;
      (mapa.get(clave) ?? mapa.set(clave, []).get(clave)!).push(c);
    };
    const porGrupo = new Map<string, Array<ReturnType<typeof confianza>>>();
    const porNivel = new Map<string, Array<ReturnType<typeof confianza>>>();
    const porLinea = new Map<string, Array<ReturnType<typeof confianza>>>();
    const porModelo = new Map<string, Array<ReturnType<typeof confianza>>>();
    for (const b of bultos.values()) {
      if (!b.enStock || b.objeto) continue;
      const c = confianza(b, semivida, ahora);
      for (const l of b.lineas) {
        todas.push(c);
        if (b.pos != null) {
          agregar(porGrupo, dim.grupoDe(b.pos), c);
          agregar(porNivel, dim.nivelDe(b.pos), c);
        }
        agregar(porLinea, dim.lineaDe(l.modeloId), c);
        agregar(porModelo, String(l.modeloId), c);
      }
    }
    const aIndices = (m: Map<string, Array<ReturnType<typeof confianza>>>) =>
      Object.fromEntries([...m].map(([k, v]) => [k, indice(v)]));

    salida.push({
      t: instante,
      general: indice(todas),
      porGrupo: aIndices(porGrupo),
      porNivel: aIndices(porNivel),
      porLinea: aIndices(porLinea),
      porModelo: aIndices(porModelo),
      posicion:
        posicionPedida == null
          ? null
          : (confianza(verificacionDePos(posicionPedida), semivida, ahora)?.valor ?? null),
    });
  }
  return salida;
}
