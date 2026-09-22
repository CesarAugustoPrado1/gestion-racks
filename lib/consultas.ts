import "server-only";
import { sql } from "drizzle-orm";
import { db } from "./db";
import type { Packaging } from "./db/schema";

/**
 * TODAS las lecturas de pantalla viven acá, como en Control-Secaderos.
 *
 * Una regla que no se puede olvidar: **solo son stock los bultos `en_rack` y
 * `en_piso`**. Un `entregado` salió de la fábrica y un `desarmado` se reempacó
 * en otro; si una consulta nueva se olvida el filtro, el stock incluye producto
 * que ya no existe.
 */
const EN_STOCK = sql`b.estado in ('en_rack', 'en_piso')`;

export type TotalPorPackaging = Partial<
  Record<Packaging, { unidades: number; bultos: number }>
>;

export type ModeloConStock = {
  id: number;
  nombre: string;
  lineaId: number;
  lineaNombre: string;
  unidadSingular: string;
  unidadPlural: string;
  porPackaging: TotalPorPackaging;
  unidades: number;
  bultos: number;
};

export type LineaConStock = {
  id: number;
  codigo: string;
  nombre: string;
  unidadPlural: string;
  modelos: ModeloConStock[];
};

/**
 * El stock de toda la planta, por línea y modelo.
 *
 * Son dos consultas y no una con `left join` a propósito: mezclarlas obligaría a
 * distinguir "modelo sin stock" de "grupo sin packaging" dentro del mismo
 * resultado, y esa es la clase de consulta que un día suma bultos entregados
 * sin que nadie lo note.
 */
export async function stockPorLinea(): Promise<LineaConStock[]> {
  const [modelos, totales] = await Promise.all([
    db.execute(sql`
      select m.id, m.nombre, m.orden,
             l.id as linea_id, l.codigo as linea_codigo, l.nombre as linea_nombre,
             l.unidad_singular, l.unidad_plural, l.orden as linea_orden
      from modelos m
      join lineas l on l.id = m.linea_id
      where m.activo and l.activa
      order by l.orden, m.orden
    `) as unknown as Promise<
      Array<{
        id: number;
        nombre: string;
        linea_id: number;
        linea_codigo: string;
        linea_nombre: string;
        unidad_singular: string;
        unidad_plural: string;
      }>
    >,
    db.execute(sql`
      select c.modelo_id, b.packaging,
             sum(c.cantidad)::int as unidades,
             count(*)::int as bultos
      from bulto_contenido c
      join bultos b on b.id = c.bulto_id
      where ${EN_STOCK}
      group by c.modelo_id, b.packaging
    `) as unknown as Promise<
      Array<{
        modelo_id: number;
        packaging: Packaging;
        unidades: number;
        bultos: number;
      }>
    >,
  ]);

  const porModelo = new Map<number, TotalPorPackaging>();
  for (const t of totales) {
    const actual = porModelo.get(t.modelo_id) ?? {};
    actual[t.packaging] = { unidades: t.unidades, bultos: t.bultos };
    porModelo.set(t.modelo_id, actual);
  }

  const lineas = new Map<number, LineaConStock>();
  for (const m of modelos) {
    if (!lineas.has(m.linea_id)) {
      lineas.set(m.linea_id, {
        id: m.linea_id,
        codigo: m.linea_codigo,
        nombre: m.linea_nombre,
        unidadPlural: m.unidad_plural,
        modelos: [],
      });
    }
    const porPackaging = porModelo.get(m.id) ?? {};
    const valores = Object.values(porPackaging);
    lineas.get(m.linea_id)!.modelos.push({
      id: m.id,
      nombre: m.nombre,
      lineaId: m.linea_id,
      lineaNombre: m.linea_nombre,
      unidadSingular: m.unidad_singular,
      unidadPlural: m.unidad_plural,
      porPackaging,
      unidades: valores.reduce((s, v) => s + v.unidades, 0),
      bultos: valores.reduce((s, v) => s + v.bultos, 0),
    });
  }

  return [...lineas.values()];
}

export type BultoDeModelo = {
  id: number;
  codigo: string;
  packaging: Packaging;
  /** Unidades **de este modelo**. En un bulto mezclado no es el total. */
  unidades: number;
  /** Total del bulto, contando todos sus modelos. */
  totalBulto: number;
  /** Los otros modelos del bulto, si es mezclado. */
  otrosModelos: string | null;
  estado: string;
  ubicacion: string | null;
  accesibilidad: string | null;
  /** En un carril penetrable, 1 es el del frente. `null` en un rack selectivo. */
  profundidad: number | null;
  profundidadMax: number | null;
  chequeadoEn: Date | null;
  chequeosOk: number;
  chequeosTotal: number;
};

export type DetalleModelo = {
  id: number;
  nombre: string;
  lineaNombre: string;
  unidadSingular: string;
  unidadPlural: string;
  normas: Partial<Record<Packaging, number>>;
  bultos: BultoDeModelo[];
};

export async function detalleDeModelo(
  modeloId: number,
): Promise<DetalleModelo | null> {
  const [cabecera, normas, bultos] = await Promise.all([
    db.execute(sql`
      select m.id, m.nombre, l.nombre as linea_nombre,
             l.unidad_singular, l.unidad_plural
      from modelos m join lineas l on l.id = m.linea_id
      where m.id = ${modeloId}
      limit 1
    `) as unknown as Promise<
      Array<{
        id: number;
        nombre: string;
        linea_nombre: string;
        unidad_singular: string;
        unidad_plural: string;
      }>
    >,
    db.execute(sql`
      select packaging, cantidad from normas where modelo_id = ${modeloId}
    `) as unknown as Promise<
      Array<{ packaging: Packaging; cantidad: number }>
    >,
    db.execute(sql`
      select b.id, b.codigo, b.packaging, b.estado,
             c.cantidad as unidades, b.cantidad as total_bulto,
             b.chequeado_en, b.chequeos_ok, b.chequeos_total,
             case when p.id is null then null
                  else r.codigo || '-' || p.codigo end as ubicacion,
             r.accesibilidad, b.profundidad, p.profundidad as profundidad_max,
             (select string_agg(m2.nombre, ', ' order by m2.nombre)
                from bulto_contenido x
                join modelos m2 on m2.id = x.modelo_id
               where x.bulto_id = b.id and x.modelo_id <> c.modelo_id
             ) as otros_modelos
      from bulto_contenido c
      join bultos b on b.id = c.bulto_id
      left join posiciones p on p.id = b.posicion_id
      left join racks r on r.id = p.rack_id
      where c.modelo_id = ${modeloId} and ${EN_STOCK}
      order by r.orden nulls last, p.orden nulls last, b.profundidad nulls first, b.codigo
    `) as unknown as Promise<
      Array<{
        id: number;
        codigo: string;
        packaging: Packaging;
        estado: string;
        unidades: number;
        total_bulto: number;
        chequeado_en: Date | null;
        chequeos_ok: number;
        chequeos_total: number;
        ubicacion: string | null;
        accesibilidad: string | null;
        profundidad: number | null;
        profundidad_max: number | null;
        otros_modelos: string | null;
      }>
    >,
  ]);

  if (cabecera.length === 0) return null;
  const m = cabecera[0];

  return {
    id: m.id,
    nombre: m.nombre,
    lineaNombre: m.linea_nombre,
    unidadSingular: m.unidad_singular,
    unidadPlural: m.unidad_plural,
    normas: Object.fromEntries(normas.map((n) => [n.packaging, n.cantidad])),
    bultos: bultos.map((b) => ({
      id: b.id,
      codigo: b.codigo,
      packaging: b.packaging,
      unidades: b.unidades,
      totalBulto: b.total_bulto,
      otrosModelos: b.otros_modelos,
      estado: b.estado,
      ubicacion: b.ubicacion,
      accesibilidad: b.accesibilidad,
      profundidad: b.profundidad,
      profundidadMax: b.profundidad_max,
      chequeadoEn: b.chequeado_en,
      chequeosOk: b.chequeos_ok,
      chequeosTotal: b.chequeos_total,
    })),
  };
}
