import "server-only";
import { sql } from "drizzle-orm";
import { db } from "./db";
import type { Packaging } from "./db/schema";

/**
 * TODAS las lecturas de pantalla viven acá, como en Control-Secaderos.
 *
 * Una regla que no se puede olvidar: **solo son stock los bultos `ubicado` y
 * `sin_ubicar`**. Un `salido` ya no está en el rack; si una consulta nueva se
 * olvida el filtro, el stock incluye producto que ya no existe.
 */
const EN_STOCK = sql`b.estado in ('ubicado', 'sin_ubicar')`;

/**
 * Los timestamps de `db.execute` con SQL crudo vuelven como TEXTO, no como
 * Date: el mapeo de tipos de drizzle solo corre en el query builder.
 *
 * Declararlos `Date` y devolver un string compila igual y explota en la
 * pantalla, que es donde se descubrió: `creadoEn.toLocaleTimeString is not a
 * function`, con la lista del día en blanco. Toda fecha que salga de una
 * consulta cruda pasa por acá, para que el tipo declarado sea verdad.
 */
const comoFecha = (v: Date | string | null): Date | null =>
  v == null ? null : v instanceof Date ? v : new Date(v);

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
                  else g.codigo || '-' || p.codigo end as ubicacion,
             g.accesibilidad, p.profundidad, g.profundidad as profundidad_max,
             (select string_agg(m2.nombre, ', ' order by m2.nombre)
                from bulto_contenido x
                join modelos m2 on m2.id = x.modelo_id
               where x.bulto_id = b.id and x.modelo_id <> c.modelo_id
             ) as otros_modelos
      from bulto_contenido c
      join bultos b on b.id = c.bulto_id
      left join posiciones p on p.id = b.posicion_id
      left join grupos g on g.id = p.grupo_id
      where c.modelo_id = ${modeloId} and ${EN_STOCK}
      order by g.orden nulls last, p.orden nulls last, b.codigo
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
      chequeadoEn: comoFecha(b.chequeado_en),
      chequeosOk: b.chequeos_ok,
      chequeosTotal: b.chequeos_total,
    })),
  };
}

/* -------------------------------------------------------------------------- */
/* Lecturas para la pantalla de mover                                         */
/* -------------------------------------------------------------------------- */

export type PosicionLibre = {
  id: number;
  codigo: string;
  rack: string;
  penetrable: boolean;
  nivel: number;
  niveles: number;
  profundidad: number | null;
  profundidadMax: number | null;
};

/**
 * Las posiciones donde entra algo, agrupadas por rack.
 *
 * Solo se ofrecen las que tienen lugar: una lista que incluye posiciones llenas
 * obliga al operario a acordarse de cuáles no sirven, y ese es trabajo que la
 * pantalla puede hacer sola.
 */
export async function posicionesLibres(): Promise<PosicionLibre[]> {
  const filas = (await db.execute(sql`
    select p.id,
           g.codigo || '-' || p.codigo as codigo,
           g.codigo as rack,
           g.accesibilidad, g.niveles, g.profundidad as profundidad_max,
           p.nivel, p.profundidad
      from posiciones p
      join grupos g on g.id = p.grupo_id
      left join bultos b on b.posicion_id = p.id and b.estado = 'ubicado'
     where p.activa and g.activo and b.id is null
       -- Y tampoco es libre la que un bulto alto de abajo se comió por
       -- sobresalir: no hay nada parado ahí, pero el hueco está tomado.
       and p.bloqueada_por_bulto_id is null
     order by g.orden, p.orden
  `)) as unknown as Array<{
    id: number;
    codigo: string;
    rack: string;
    accesibilidad: string;
    niveles: number;
    profundidad_max: number | null;
    nivel: number;
    profundidad: number | null;
  }>;

  return filas.map((f) => ({
    id: f.id,
    codigo: f.codigo,
    rack: f.rack,
    penetrable: f.accesibilidad === "penetrable",
    nivel: f.nivel,
    niveles: f.niveles,
    profundidad: f.profundidad,
    profundidadMax: f.profundidad_max,
  }));
}

export type ModeloParaCargar = {
  id: number;
  nombre: string;
  lineaId: number;
  lineaNombre: string;
  unidadPlural: string;
  normas: Partial<Record<Packaging, number>>;
};

/** Los modelos que se pueden cargar, con su norma por packaging. */
export async function modelosParaCargar(): Promise<ModeloParaCargar[]> {
  const [modelos, normas] = await Promise.all([
    db.execute(sql`
      select m.id, m.nombre, l.id as linea_id, l.nombre as linea_nombre,
             l.unidad_plural
        from modelos m join lineas l on l.id = m.linea_id
       where m.activo and l.activa
       order by l.orden, m.orden
    `) as unknown as Promise<
      Array<{
        id: number;
        nombre: string;
        linea_id: number;
        linea_nombre: string;
        unidad_plural: string;
      }>
    >,
    db.execute(sql`
      select modelo_id, packaging, cantidad from normas
    `) as unknown as Promise<
      Array<{ modelo_id: number; packaging: Packaging; cantidad: number }>
    >,
  ]);

  const porModelo = new Map<number, Partial<Record<Packaging, number>>>();
  for (const n of normas) {
    const actual = porModelo.get(n.modelo_id) ?? {};
    actual[n.packaging] = n.cantidad;
    porModelo.set(n.modelo_id, actual);
  }

  return modelos.map((m) => ({
    id: m.id,
    nombre: m.nombre,
    lineaId: m.linea_id,
    lineaNombre: m.linea_nombre,
    unidadPlural: m.unidad_plural,
    normas: porModelo.get(m.id) ?? {},
  }));
}

export type BultoEnLista = {
  id: number;
  codigo: string;
  packaging: Packaging;
  cantidad: number;
  ubicacion: string | null;
  contenido: string;
  unidadPlural: string;
  chequeadoEn: Date | null;
  chequeosOk: number;
  chequeosTotal: number;
};

const SELECT_BULTO = sql`
  select b.id, b.codigo, b.packaging, b.cantidad,
         b.chequeado_en, b.chequeos_ok, b.chequeos_total,
         case when p.id is null then null
              else g.codigo || '-' || p.codigo end as ubicacion,
         (select string_agg(m.nombre || ' ' || c.cantidad, ' + ' order by m.nombre)
            from bulto_contenido c join modelos m on m.id = c.modelo_id
           where c.bulto_id = b.id) as contenido,
         (select l.unidad_plural
            from bulto_contenido c join modelos m on m.id = c.modelo_id
            join lineas l on l.id = m.linea_id
           where c.bulto_id = b.id limit 1) as unidad_plural
    from bultos b
    left join posiciones p on p.id = b.posicion_id
    left join grupos g on g.id = p.grupo_id
`;

type FilaBulto = {
  id: number;
  codigo: string;
  packaging: Packaging;
  cantidad: number;
  ubicacion: string | null;
  contenido: string | null;
  unidad_plural: string | null;
  chequeado_en: Date | null;
  chequeos_ok: number;
  chequeos_total: number;
};

const aBulto = (f: FilaBulto): BultoEnLista => ({
  id: f.id,
  codigo: f.codigo,
  packaging: f.packaging,
  cantidad: f.cantidad,
  ubicacion: f.ubicacion,
  contenido: f.contenido ?? "Vacío",
  unidadPlural: f.unidad_plural ?? "unidades",
  chequeadoEn: comoFecha(f.chequeado_en),
  chequeosOk: f.chequeos_ok,
  chequeosTotal: f.chequeos_total,
});

/**
 * Busca un bulto por código, por ubicación o por modelo.
 *
 * Las tres cosas en un solo campo porque el operario tiene una sola mano libre:
 * escribe "B-4" o "laja" o "21" y la pantalla se arregla. Pedirle que elija
 * primero el tipo de búsqueda es un toque de más en cada uso.
 */
export async function buscarBultos(texto: string): Promise<BultoEnLista[]> {
  const q = texto.trim();
  if (q.length === 0) return [];
  const patron = `%${q}%`;

  const filas = (await db.execute(sql`
    ${SELECT_BULTO}
    where ${EN_STOCK}
      and (
        b.codigo ilike ${patron}
        or (g.codigo || '-' || p.codigo) ilike ${patron}
        or exists (select 1 from bulto_contenido c join modelos m on m.id = c.modelo_id
                    where c.bulto_id = b.id and m.nombre ilike ${patron})
      )
    order by b.visto_en desc
    limit 40
  `)) as unknown as FilaBulto[];

  return filas.map(aBulto);
}

export async function bultoPorId(id: number): Promise<BultoEnLista | null> {
  const filas = (await db.execute(sql`
    ${SELECT_BULTO} where b.id = ${id} and ${EN_STOCK} limit 1
  `)) as unknown as FilaBulto[];
  return filas.length > 0 ? aBulto(filas[0]) : null;
}

/** El contenido de un bulto, modelo por modelo. Para sacar una parte. */
export async function contenidoDeBulto(
  id: number,
): Promise<Array<{ modeloId: number; nombre: string; cantidad: number }>> {
  const filas = (await db.execute(sql`
    select c.modelo_id, m.nombre, c.cantidad
      from bulto_contenido c join modelos m on m.id = c.modelo_id
     where c.bulto_id = ${id}
     order by m.orden, m.nombre
  `)) as unknown as Array<{
    modelo_id: number;
    nombre: string;
    cantidad: number;
  }>;
  return filas.map((f) => ({
    modeloId: f.modelo_id,
    nombre: f.nombre,
    cantidad: f.cantidad,
  }));
}

/**
 * Los bultos sin lugar asignado.
 *
 * Va primero en la pantalla del autoelevador, y no escondido en un reporte: es
 * una cola de trabajo -"esto hay que ubicarlo"- y una cola que no se ve no se
 * vacía.
 */
export async function bultosSinUbicar(): Promise<BultoEnLista[]> {
  const filas = (await db.execute(sql`
    ${SELECT_BULTO} where b.estado = 'sin_ubicar' order by b.creado_en limit 50
  `)) as unknown as FilaBulto[];
  return filas.map(aBulto);
}

export async function motivosDeSalida(): Promise<
  Array<{ id: number; nombre: string; esEgreso: boolean }>
> {
  const filas = (await db.execute(sql`
    select id, nombre, es_egreso from motivos
     where ambito = 'salida' and activo order by orden, nombre
  `)) as unknown as Array<{ id: number; nombre: string; es_egreso: boolean }>;
  return filas.map((f) => ({
    id: f.id,
    nombre: f.nombre,
    esEgreso: f.es_egreso,
  }));
}

export type MovimientoDelDia = {
  id: number;
  tipo: string;
  bultoCodigo: string;
  desde: string | null;
  hasta: string | null;
  cantidadAntes: number;
  cantidad: number;
  motivo: string | null;
  usuario: string;
  creadoEn: Date;
};

/** Lo que se hizo hoy. Es lo que el operario mira para saber si ya lo registró. */
export async function actividadDeHoy(): Promise<MovimientoDelDia[]> {
  const filas = (await db.execute(sql`
    select id, tipo, bulto_codigo, posicion_desde_codigo, posicion_hasta_codigo,
           cantidad_antes, cantidad, motivo_nombre, usuario_nombre, creado_en
      from movimientos
     where anulado_en is null
       and creado_en >= date_trunc('day', now())
     order by creado_en desc
     limit 30
  `)) as unknown as Array<{
    id: number;
    tipo: string;
    bulto_codigo: string;
    posicion_desde_codigo: string | null;
    posicion_hasta_codigo: string | null;
    cantidad_antes: number;
    cantidad: number;
    motivo_nombre: string | null;
    usuario_nombre: string;
    creado_en: Date;
  }>;
  return filas.map((f) => ({
    id: f.id,
    tipo: f.tipo,
    bultoCodigo: f.bulto_codigo,
    desde: f.posicion_desde_codigo,
    hasta: f.posicion_hasta_codigo,
    cantidadAntes: f.cantidad_antes,
    cantidad: f.cantidad,
    motivo: f.motivo_nombre,
    usuario: f.usuario_nombre,
    creadoEn: comoFecha(f.creado_en)!,
  }));
}

/* -------------------------------------------------------------------------- */
/* Lecturas para control                                                      */
/* -------------------------------------------------------------------------- */

export type PosicionParaChequear = {
  id: number;
  codigo: string;
  rack: string;
  penetrable: boolean;
  nivel: number;
  niveles: number;
  profundidad: number | null;
  profundidadMax: number | null;
  bultos: number;
  unidades: number;
  unidadPlural: string | null;
  contenido: string | null;
  /** Código del bulto de abajo que se comió este hueco por alto, si lo hay. */
  invasor: string | null;
  chequeadoEn: Date | null;
  chequeosOk: number;
  chequeosTotal: number;
};

/**
 * Todas las posiciones activas con lo que el sistema dice que tienen.
 *
 * El orden lo decide la pantalla y no el SQL, porque la urgencia depende de la
 * semivida configurada: `(1 - confianza) × cantidad`. Primero lo que hace más
 * que no se mira y más producto tiene, que es lo que convierte el índice en el
 * plan del día en vez de un número de adorno.
 */
export async function posicionesParaChequear(): Promise<PosicionParaChequear[]> {
  const filas = (await db.execute(sql`
    select p.id,
           g.codigo || '-' || p.codigo as codigo,
           g.codigo as rack,
           g.accesibilidad, g.niveles, g.profundidad as profundidad_max,
           p.nivel, p.profundidad,
           p.chequeado_en, p.chequeos_ok, p.chequeos_total,
           count(b.id)::int as bultos,
           coalesce(sum(b.cantidad), 0)::int as unidades,
           (select string_agg(x.txt, ' · ')
              from (select m.nombre || ' ' || c.cantidad as txt
                      from bultos b2
                      join bulto_contenido c on c.bulto_id = b2.id
                      join modelos m on m.id = c.modelo_id
                     where b2.posicion_id = p.id and b2.estado = 'ubicado'
                     order by m.orden, m.nombre) x
           ) as contenido,
           (select l.unidad_plural
              from bultos b3
              join bulto_contenido c on c.bulto_id = b3.id
              join modelos m on m.id = c.modelo_id
              join lineas l on l.id = m.linea_id
             where b3.posicion_id = p.id and b3.estado = 'ubicado' limit 1
           ) as unidad_plural,
           (select bi.codigo from bultos bi where bi.id = p.bloqueada_por_bulto_id) as invasor
      from posiciones p
      join grupos g on g.id = p.grupo_id
      left join bultos b on b.posicion_id = p.id and b.estado = 'ubicado'
     where p.activa and g.activo
     group by p.id, g.id, g.codigo, g.accesibilidad, g.niveles, g.profundidad
  `)) as unknown as Array<{
    id: number;
    codigo: string;
    rack: string;
    accesibilidad: string;
    niveles: number;
    profundidad_max: number | null;
    nivel: number;
    profundidad: number | null;
    chequeado_en: Date | string | null;
    chequeos_ok: number;
    chequeos_total: number;
    bultos: number;
    unidades: number;
    contenido: string | null;
    unidad_plural: string | null;
    invasor: string | null;
  }>;

  return filas.map((f) => ({
    id: f.id,
    codigo: f.codigo,
    rack: f.rack,
    penetrable: f.accesibilidad === "penetrable",
    nivel: f.nivel,
    niveles: f.niveles,
    profundidad: f.profundidad,
    profundidadMax: f.profundidad_max,
    bultos: f.bultos,
    unidades: f.unidades,
    unidadPlural: f.unidad_plural,
    contenido: f.contenido,
    /** Si la tapa un bulto alto de abajo, su código. Ver §5.6 de DISENO.md. */
    invasor: f.invasor,
    chequeadoEn: comoFecha(f.chequeado_en),
    chequeosOk: f.chequeos_ok,
    chequeosTotal: f.chequeos_total,
  }));
}

export type BultoEnPosicion = {
  id: number;
  codigo: string;
  packaging: Packaging;
  cantidad: number;
  profundidad: number | null;
  unidadPlural: string;
  contenido: Array<{ modeloId: number; nombre: string; cantidad: number }>;
};

export async function posicionConBultos(id: number): Promise<{
  posicion: PosicionParaChequear;
  bultos: BultoEnPosicion[];
} | null> {
  const todas = await posicionesParaChequear();
  const posicion = todas.find((p) => p.id === id);
  if (!posicion) return null;

  const filas = (await db.execute(sql`
    select b.id, b.codigo, b.packaging, b.cantidad, pos.profundidad,
           c.modelo_id, m.nombre as modelo_nombre, c.cantidad as cantidad_modelo,
           l.unidad_plural
      from bultos b
      join posiciones pos on pos.id = b.posicion_id
      join bulto_contenido c on c.bulto_id = b.id
      join modelos m on m.id = c.modelo_id
      join lineas l on l.id = m.linea_id
     where b.posicion_id = ${id} and b.estado = 'ubicado'
     order by b.codigo, m.orden, m.nombre
  `)) as unknown as Array<{
    id: number;
    codigo: string;
    packaging: Packaging;
    cantidad: number;
    profundidad: number | null;
    modelo_id: number;
    modelo_nombre: string;
    cantidad_modelo: number;
    unidad_plural: string;
  }>;

  const bultos = new Map<number, BultoEnPosicion>();
  for (const f of filas) {
    if (!bultos.has(f.id)) {
      bultos.set(f.id, {
        id: f.id,
        codigo: f.codigo,
        packaging: f.packaging,
        cantidad: f.cantidad,
        profundidad: f.profundidad,
        unidadPlural: f.unidad_plural,
        contenido: [],
      });
    }
    bultos.get(f.id)!.contenido.push({
      modeloId: f.modelo_id,
      nombre: f.modelo_nombre,
      cantidad: f.cantidad_modelo,
    });
  }

  return { posicion, bultos: [...bultos.values()] };
}

export async function motivosDeAjuste(): Promise<
  Array<{ id: number; nombre: string }>
> {
  const filas = (await db.execute(sql`
    select id, nombre from motivos
     where ambito = 'ajuste' and activo order by orden, nombre
  `)) as unknown as Array<{ id: number; nombre: string }>;
  return filas;
}

/* -------------------------------------------------------------------------- */
/* El tablero: la foto de la planta                                           */
/* -------------------------------------------------------------------------- */

export type CeldaDelMapa = {
  posicionId: number;
  codigo: string;
  unidad: number;
  columna: number | null;
  nivel: number;
  profundidad: number | null;
  activa: boolean;
  bulto: {
    id: number;
    codigo: string;
    packaging: Packaging;
    cantidad: number;
    lineaNombre: string;
    lineaOrden: number;
    unidadPlural: string;
    contenido: string;
    chequeadoEn: Date | null;
    chequeosOk: number;
    chequeosTotal: number;
  } | null;
  /**
   * Código del bulto de abajo que se comió este hueco por sobresalir. Si está,
   * la celda está ocupada aunque `bulto` sea null: no hay nada parado acá, pero
   * tampoco entra nada.
   */
  invasor: string | null;
};

export type GrupoDelMapa = {
  id: number;
  codigo: string;
  nombre: string | null;
  penetrable: boolean;
  ancho: number | null;
  niveles: number;
  profundidad: number | null;
  unidades: number;
  celdas: CeldaDelMapa[];
};

/**
 * Todas las posiciones de la planta con lo que tienen adentro.
 *
 * Es una sola consulta y no una por grupo: son cientos de posiciones, no
 * millones, y traerlas juntas evita que la pantalla haga una consulta por rack
 * -que es como un tablero que hoy anda se vuelve lento el día que se agrega un
 * galpón-.
 */
export async function mapaDeRacks(): Promise<GrupoDelMapa[]> {
  const filas = (await db.execute(sql`
    select g.id as grupo_id, g.codigo as grupo_codigo, g.nombre as grupo_nombre,
           g.accesibilidad, g.ancho, g.niveles, g.profundidad as profundidad_max,
           g.unidades,
           p.id as posicion_id, p.codigo, p.unidad, p.columna, p.nivel,
           p.profundidad, p.activa,
           b.id as bulto_id, b.codigo as bulto_codigo, b.packaging, b.cantidad,
           b.chequeado_en, b.chequeos_ok, b.chequeos_total,
           l.nombre as linea_nombre, l.orden as linea_orden, l.unidad_plural,
           (select string_agg(m2.nombre || ' ' || c2.cantidad, ' + ' order by m2.nombre)
              from bulto_contenido c2 join modelos m2 on m2.id = c2.modelo_id
             where c2.bulto_id = b.id) as contenido,
           (select bi.codigo from bultos bi where bi.id = p.bloqueada_por_bulto_id) as invasor
      from posiciones p
      join grupos g on g.id = p.grupo_id
      left join bultos b on b.posicion_id = p.id and b.estado = 'ubicado'
      left join lateral (
        select m.linea_id from bulto_contenido c
          join modelos m on m.id = c.modelo_id
         where c.bulto_id = b.id
         order by m.orden limit 1
      ) primero on true
      left join lineas l on l.id = primero.linea_id
     where g.activo
     order by g.orden, p.nivel desc, p.unidad, p.profundidad nulls last, p.columna
  `)) as unknown as Array<{
    grupo_id: number;
    grupo_codigo: string;
    grupo_nombre: string | null;
    accesibilidad: string;
    ancho: number | null;
    niveles: number;
    profundidad_max: number | null;
    unidades: number;
    posicion_id: number;
    codigo: string;
    unidad: number;
    columna: number | null;
    nivel: number;
    profundidad: number | null;
    activa: boolean;
    bulto_id: number | null;
    bulto_codigo: string | null;
    packaging: Packaging | null;
    cantidad: number | null;
    chequeado_en: Date | string | null;
    chequeos_ok: number | null;
    chequeos_total: number | null;
    linea_nombre: string | null;
    linea_orden: number | null;
    unidad_plural: string | null;
    contenido: string | null;
    invasor: string | null;
  }>;

  const grupos = new Map<number, GrupoDelMapa>();
  for (const f of filas) {
    if (!grupos.has(f.grupo_id)) {
      grupos.set(f.grupo_id, {
        id: f.grupo_id,
        codigo: f.grupo_codigo,
        nombre: f.grupo_nombre,
        penetrable: f.accesibilidad === "penetrable",
        ancho: f.ancho,
        niveles: f.niveles,
        profundidad: f.profundidad_max,
        unidades: f.unidades,
        celdas: [],
      });
    }
    grupos.get(f.grupo_id)!.celdas.push({
      posicionId: f.posicion_id,
      codigo: f.codigo,
      unidad: f.unidad,
      columna: f.columna,
      nivel: f.nivel,
      profundidad: f.profundidad,
      activa: f.activa,
      bulto:
        f.bulto_id != null
          ? {
              id: f.bulto_id,
              codigo: f.bulto_codigo!,
              packaging: f.packaging!,
              cantidad: f.cantidad!,
              lineaNombre: f.linea_nombre ?? "Sin línea",
              lineaOrden: f.linea_orden ?? 99,
              unidadPlural: f.unidad_plural ?? "unidades",
              contenido: f.contenido ?? "",
              chequeadoEn: comoFecha(f.chequeado_en),
              chequeosOk: f.chequeos_ok ?? 0,
              chequeosTotal: f.chequeos_total ?? 0,
            }
          : null,
      invasor: f.invasor,
    });
  }

  return [...grupos.values()];
}

/** Una posición con todo lo que hace falta para su ficha. */
export async function fichaDePosicion(id: number): Promise<{
  grupo: GrupoDelMapa;
  celda: CeldaDelMapa;
  movimientos: MovimientoDelDia[];
} | null> {
  const mapa = await mapaDeRacks();
  for (const g of mapa) {
    const celda = g.celdas.find((c) => c.posicionId === id);
    if (!celda) continue;

    const filas = (await db.execute(sql`
      select id, tipo, bulto_codigo, posicion_desde_codigo, posicion_hasta_codigo,
             cantidad_antes, cantidad, motivo_nombre, usuario_nombre, creado_en
        from movimientos
       where anulado_en is null
         and (posicion_desde_id = ${id} or posicion_hasta_id = ${id})
       order by creado_en desc limit 10
    `)) as unknown as Array<{
      id: number;
      tipo: string;
      bulto_codigo: string;
      posicion_desde_codigo: string | null;
      posicion_hasta_codigo: string | null;
      cantidad_antes: number;
      cantidad: number;
      motivo_nombre: string | null;
      usuario_nombre: string;
      creado_en: Date | string;
    }>;

    return {
      grupo: g,
      celda,
      movimientos: filas.map((f) => ({
        id: f.id,
        tipo: f.tipo,
        bultoCodigo: f.bulto_codigo,
        desde: f.posicion_desde_codigo,
        hasta: f.posicion_hasta_codigo,
        cantidadAntes: f.cantidad_antes,
        cantidad: f.cantidad,
        motivo: f.motivo_nombre,
        usuario: f.usuario_nombre,
        creadoEn: comoFecha(f.creado_en)!,
      })),
    };
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Historial de movimientos                                                   */
/* -------------------------------------------------------------------------- */

export type FiltrosHistorial = {
  desde?: string | null;
  hasta?: string | null;
  tipo?: string | null;
  modeloId?: number | null;
  usuarioId?: number | null;
  /** Busca por código de bulto o por posición. */
  texto?: string | null;
  /** Los anulados NO se muestran salvo que se los pida. Ver abajo. */
  incluirAnulados?: boolean;
};

/**
 * El WHERE del historial, compartido por la pantalla y el export.
 *
 * Uno solo y no dos: si el CSV filtrara distinto que la pantalla, el número que
 * alguien lleva a una reunión no sería el que vio al exportarlo, y no habría
 * forma de saber cuál de los dos está mal.
 *
 * **Los anulados quedan afuera por defecto.** Un movimiento corregido sigue en
 * la base con sus datos originales -el error también es un dato- y sumarlo
 * contaría dos veces. Acá se pueden pedir, marcados, porque este es el único
 * lugar donde interesa ver qué se corrigió.
 */
function dondeHistorial(f: FiltrosHistorial) {
  const partes = [sql`1 = 1`];

  if (!f.incluirAnulados) partes.push(sql`m.anulado_en is null`);
  if (f.desde) partes.push(sql`m.creado_en >= ${f.desde}::date`);
  // `< hasta + 1 día` y no `<= hasta`: con timestamps, `<=` deja afuera todo lo
  // que pasó ese día después de medianoche, que es el día entero.
  if (f.hasta) partes.push(sql`m.creado_en < (${f.hasta}::date + interval '1 day')`);
  if (f.tipo) partes.push(sql`m.tipo = ${f.tipo}`);
  if (f.usuarioId) partes.push(sql`m.usuario_id = ${f.usuarioId}`);
  if (f.modeloId) {
    partes.push(sql`exists (select 1 from movimiento_lineas l
                             where l.movimiento_id = m.id and l.modelo_id = ${f.modeloId})`);
  }
  if (f.texto) {
    const patron = `%${f.texto.trim()}%`;
    partes.push(sql`(m.bulto_codigo ilike ${patron}
                     or m.posicion_desde_codigo ilike ${patron}
                     or m.posicion_hasta_codigo ilike ${patron})`);
  }

  return sql.join(partes, sql` and `);
}

export type MovimientoDelHistorial = {
  id: number;
  tipo: string;
  bultoCodigo: string;
  lineaCodigo: string;
  packaging: Packaging;
  packagingAntes: Packaging | null;
  cantidadAntes: number;
  cantidad: number;
  desde: string | null;
  hasta: string | null;
  motivo: string | null;
  usuario: string;
  nota: string | null;
  creadoEn: Date;
  anulado: boolean;
  motivoAnulacion: string | null;
  lineas: Array<{ modelo: string; antes: number; despues: number }>;
};

const POR_PAGINA = 50;

export async function historial(
  f: FiltrosHistorial,
  pagina = 0,
): Promise<{ movimientos: MovimientoDelHistorial[]; total: number }> {
  const donde = dondeHistorial(f);

  const [filas, conteo] = await Promise.all([
    db.execute(sql`
      select m.id, m.tipo, m.bulto_codigo, m.linea_codigo, m.packaging,
             m.packaging_antes, m.cantidad_antes, m.cantidad,
             m.posicion_desde_codigo, m.posicion_hasta_codigo,
             m.motivo_nombre, m.usuario_nombre, m.nota, m.creado_en,
             m.anulado_en, m.motivo_anulacion,
             (select json_agg(json_build_object(
                'modelo', l.modelo_nombre, 'antes', l.cantidad_antes, 'despues', l.cantidad)
                order by l.modelo_nombre)
                from movimiento_lineas l where l.movimiento_id = m.id) as lineas
        from movimientos m
       where ${donde}
       order by m.creado_en desc, m.id desc
       limit ${POR_PAGINA} offset ${pagina * POR_PAGINA}
    `) as unknown as Promise<
      Array<{
        id: number;
        tipo: string;
        bulto_codigo: string;
        linea_codigo: string;
        packaging: Packaging;
        packaging_antes: Packaging | null;
        cantidad_antes: number;
        cantidad: number;
        posicion_desde_codigo: string | null;
        posicion_hasta_codigo: string | null;
        motivo_nombre: string | null;
        usuario_nombre: string;
        nota: string | null;
        creado_en: Date | string;
        anulado_en: Date | string | null;
        motivo_anulacion: string | null;
        lineas: Array<{ modelo: string; antes: number; despues: number }> | null;
      }>
    >,
    db.execute(sql`
      select count(*)::int as total from movimientos m where ${donde}
    `) as unknown as Promise<Array<{ total: number }>>,
  ]);

  return {
    total: conteo[0]?.total ?? 0,
    movimientos: filas.map((f2) => ({
      id: f2.id,
      tipo: f2.tipo,
      bultoCodigo: f2.bulto_codigo,
      lineaCodigo: f2.linea_codigo,
      packaging: f2.packaging,
      packagingAntes: f2.packaging_antes,
      cantidadAntes: f2.cantidad_antes,
      cantidad: f2.cantidad,
      desde: f2.posicion_desde_codigo,
      hasta: f2.posicion_hasta_codigo,
      motivo: f2.motivo_nombre,
      usuario: f2.usuario_nombre,
      nota: f2.nota,
      creadoEn: comoFecha(f2.creado_en)!,
      anulado: f2.anulado_en != null,
      motivoAnulacion: f2.motivo_anulacion,
      lineas: f2.lineas ?? [],
    })),
  };
}

/**
 * El historial abierto POR MODELO, una fila por movimiento y modelo.
 *
 * Es la forma que sirve para una tabla dinámica: "cuánto salió de Laja en
 * septiembre" es una suma de una columna, no una lectura de notas. Por eso el
 * CSV sale así y no con los modelos concatenados en una celda.
 */
export async function historialPlano(f: FiltrosHistorial): Promise<
  Array<Record<string, string | number>>
> {
  const filas = (await db.execute(sql`
    select m.creado_en, m.tipo, m.bulto_codigo, m.linea_codigo,
           m.packaging_antes, m.packaging,
           l.modelo_nombre, l.cantidad_antes, l.cantidad,
           m.posicion_desde_codigo, m.posicion_hasta_codigo,
           m.motivo_nombre, m.usuario_nombre, m.nota,
           m.anulado_en, m.motivo_anulacion
      from movimientos m
      join movimiento_lineas l on l.movimiento_id = m.id
     where ${dondeHistorial(f)}
     order by m.creado_en desc, m.id desc, l.modelo_nombre
     limit 20000
  `)) as unknown as Array<{
    creado_en: Date | string;
    tipo: string;
    bulto_codigo: string;
    linea_codigo: string;
    packaging_antes: string | null;
    packaging: string;
    modelo_nombre: string;
    cantidad_antes: number;
    cantidad: number;
    posicion_desde_codigo: string | null;
    posicion_hasta_codigo: string | null;
    motivo_nombre: string | null;
    usuario_nombre: string;
    nota: string | null;
    anulado_en: Date | string | null;
    motivo_anulacion: string | null;
  }>;

  return filas.map((f2) => {
    const cuando = comoFecha(f2.creado_en)!;
    return {
      Fecha: cuando.toLocaleDateString("es-AR"),
      Hora: cuando.toLocaleTimeString("es-AR", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      Movimiento: f2.tipo,
      Bulto: f2.bulto_codigo,
      Linea: f2.linea_codigo,
      Modelo: f2.modelo_nombre,
      "Packaging antes": f2.packaging_antes ?? "",
      Packaging: f2.packaging,
      "Cantidad antes": f2.cantidad_antes,
      "Cantidad despues": f2.cantidad,
      // La columna que se suma. El signo lo pone la resta, no el tipo.
      Diferencia: f2.cantidad - f2.cantidad_antes,
      Desde: f2.posicion_desde_codigo ?? "",
      Hasta: f2.posicion_hasta_codigo ?? "",
      Motivo: f2.motivo_nombre ?? "",
      Usuario: f2.usuario_nombre,
      Nota: f2.nota ?? "",
      Anulado: f2.anulado_en ? "sí" : "",
      "Motivo de anulación": f2.motivo_anulacion ?? "",
    };
  });
}

export async function opcionesDeHistorial(): Promise<{
  usuarios: Array<{ id: number; nombre: string }>;
  modelos: Array<{ id: number; nombre: string; linea: string }>;
}> {
  const [usuarios, modelos] = await Promise.all([
    db.execute(sql`
      select id, nombre from usuarios order by nombre
    `) as unknown as Promise<Array<{ id: number; nombre: string }>>,
    db.execute(sql`
      select m.id, m.nombre, l.nombre as linea
        from modelos m join lineas l on l.id = m.linea_id
       order by l.orden, m.orden
    `) as unknown as Promise<
      Array<{ id: number; nombre: string; linea: string }>
    >,
  ]);
  return { usuarios, modelos };
}

/* -------------------------------------------------------------------------- */
/* Confiabilidad abierta                                                      */
/* -------------------------------------------------------------------------- */

export type BultoConChequeo = {
  modeloId: number;
  modelo: string;
  lineaId: number;
  linea: string;
  unidadPlural: string;
  cantidad: number;
  chequeadoEn: Date | null;
  chequeosOk: number;
  chequeosTotal: number;
};

/**
 * Un renglón por bulto EN STOCK, con su modelo y su chequeo.
 *
 * Devuelve filas crudas y no promedios porque el promedio lo calcula
 * `indice()`, que es el mismo que usa el tablero y la recorrida. Si esta
 * consulta promediara por su cuenta, habría dos fórmulas del mismo número y un
 * día iban a dar distinto -y el día que pase, nadie va a saber cuál creer-.
 *
 * Incluye los `sin_ubicar`: están en stock y son igual de opinables. Lo que sí
 * quedan afuera son los `salido`, que ya no están en el galpón.
 */
export async function bultosConChequeo(): Promise<BultoConChequeo[]> {
  const filas = (await db.execute(sql`
    select c.modelo_id, m.nombre as modelo,
           l.id as linea_id, l.nombre as linea, l.unidad_plural,
           c.cantidad,
           b.chequeado_en, b.chequeos_ok, b.chequeos_total
      from bultos b
      join bulto_contenido c on c.bulto_id = b.id
      join modelos m on m.id = c.modelo_id
      join lineas l on l.id = m.linea_id
     where b.estado in ('ubicado', 'sin_ubicar')
     order by l.orden, m.orden, m.nombre
  `)) as unknown as Array<{
    modelo_id: number;
    modelo: string;
    linea_id: number;
    linea: string;
    unidad_plural: string;
    cantidad: number;
    chequeado_en: Date | string | null;
    chequeos_ok: number;
    chequeos_total: number;
  }>;

  return filas.map((f) => ({
    modeloId: f.modelo_id,
    modelo: f.modelo,
    lineaId: f.linea_id,
    linea: f.linea,
    unidadPlural: f.unidad_plural,
    cantidad: f.cantidad,
    chequeadoEn: comoFecha(f.chequeado_en),
    chequeosOk: f.chequeos_ok,
    chequeosTotal: f.chequeos_total,
  }));
}
