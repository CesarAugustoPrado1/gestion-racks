import "server-only";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { semividaDias } from "./configuracion";
import { nombreDeNivel } from "./posiciones";
import { tramosDe, type Rango } from "./periodos";
import { curvasDeConfianza, type EventoChequeo, type EventoMovimiento, type PuntoDeCurva } from "./confianza-historia";

/**
 * Las curvas de confiabilidad de un período: el índice al cierre de cada tramo,
 * general y abierto por grupo, nivel, línea y modelo, y el de una posición si
 * se pide. Lee la historia de la base y la rearma con `curvasDeConfianza`.
 */
export type Curvas = {
  puntos: Array<PuntoDeCurva & { etiqueta: string; clave: string }>;
  grupos: string[];
  niveles: string[];
  lineas: string[];
  modelos: Array<{ id: number; nombre: string; linea: string }>;
  posiciones: Array<{ id: number; codigo: string }>;
  posicionPedida: { id: number; codigo: string } | null;
};

export async function curvas(r: Rango, codigoPosicion: string | null = null): Promise<Curvas> {
  const fin = r.fin.toISOString();
  const [movs, cheqs, posiciones, modelos, lineas, semivida] = await Promise.all([
    db.execute(sql`
      select m.id, m.bulto_id, m.tipo, m.packaging, m.cantidad,
             m.posicion_desde_id, m.posicion_hasta_id,
             (extract(epoch from m.creado_en) * 1000)::float8 as t,
             coalesce((select json_agg(json_build_object('modeloId', ml.modelo_id, 'cantidad', ml.cantidad))
                         from movimiento_lineas ml where ml.movimiento_id = m.id), '[]') as lineas
        from movimientos m
       where m.anulado_en is null and m.creado_en < ${fin}
       order by m.creado_en, m.id
    `) as unknown as Promise<
      Array<{
        id: number;
        bulto_id: number;
        tipo: string;
        packaging: string;
        cantidad: number;
        posicion_desde_id: number | null;
        posicion_hasta_id: number | null;
        t: number;
        lineas: Array<{ modeloId: number; cantidad: number }>;
      }>
    >,
    db.execute(sql`
      select id, posicion_id, resultado <> 'corregido' as bien,
             (extract(epoch from creado_en) * 1000)::float8 as t
        from chequeos where creado_en < ${fin}
       order by creado_en, id
    `) as unknown as Promise<Array<{ id: number; posicion_id: number; bien: boolean; t: number }>>,
    db.execute(sql`
      select p.id, g.codigo || '-' || p.codigo as codigo, g.codigo as grupo, p.nivel, g.niveles, g.orden, p.orden as porden
        from posiciones p join grupos g on g.id = p.grupo_id
       where p.activa and g.activo
       order by g.orden, p.orden, p.id
    `) as unknown as Promise<
      Array<{ id: number; codigo: string; grupo: string; nivel: number; niveles: number; orden: number; porden: number }>
    >,
    db.execute(sql`
      select m.id, m.nombre, l.nombre as linea
        from modelos m join lineas l on l.id = m.linea_id
       order by l.orden, m.orden, m.nombre
    `) as unknown as Promise<Array<{ id: number; nombre: string; linea: string }>>,
    db.execute(sql`select nombre from lineas where activa order by orden`) as unknown as Promise<Array<{ nombre: string }>>,
    semividaDias(),
  ]);

  const posPorId = new Map(posiciones.map((p) => [p.id, p]));
  const lineaDe = new Map(modelos.map((m) => [m.id, m.linea]));
  const pedida = codigoPosicion
    ? posiciones.find((p) => p.codigo.toUpperCase() === codigoPosicion.trim().toUpperCase()) ?? null
    : null;

  const movimientos: EventoMovimiento[] = movs.map((m) => ({
    t: Number(m.t),
    id: m.id,
    bultoId: m.bulto_id,
    tipo: m.tipo,
    packaging: m.packaging,
    cantidad: m.cantidad,
    desde: m.posicion_desde_id,
    hasta: m.posicion_hasta_id,
    lineas: m.lineas,
  }));
  const chequeos: EventoChequeo[] = cheqs.map((c) => ({ t: Number(c.t), id: c.id, posicionId: c.posicion_id, bien: c.bien }));

  const tramos = tramosDe(r);
  const puntos = curvasDeConfianza(
    movimientos,
    chequeos,
    tramos.map((t) => t.fin.getTime()),
    semivida,
    {
      grupoDe: (p) => posPorId.get(p)?.grupo ?? null,
      nivelDe: (p) => {
        const x = posPorId.get(p);
        return x ? nombreDeNivel(x.nivel, x.niveles) : null;
      },
      lineaDe: (m) => lineaDe.get(m) ?? null,
    },
    pedida?.id ?? null,
  ).map((p, i) => ({ ...p, etiqueta: tramos[i].etiqueta, clave: tramos[i].clave }));

  // Los niveles por nombre, de abajo hacia arriba.
  // "medio" (el de los racks de 3) va entre "medio 1" y "medio 2".
  const ordenNivel = (n: string) =>
    n === "piso" ? 0 : n === "arriba" ? 99 : n === "medio" ? 1.5 : Number(n.replace(/\D/g, "")) || 50;
  const niveles = [...new Set(posiciones.map((p) => nombreDeNivel(p.nivel, p.niveles)))].sort(
    (a, b) => ordenNivel(a) - ordenNivel(b),
  );

  return {
    puntos,
    grupos: [...new Set(posiciones.map((p) => p.grupo))],
    niveles,
    lineas: lineas.map((l) => l.nombre),
    modelos,
    posiciones: posiciones.map((p) => ({ id: p.id, codigo: p.codigo })),
    posicionPedida: pedida ? { id: pedida.id, codigo: pedida.codigo } : null,
  };
}
