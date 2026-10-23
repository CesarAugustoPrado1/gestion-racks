import "server-only";
import { sql } from "drizzle-orm";
import { db } from "./db";
import {
  completarDias,
  mediana,
  TRAMOS_ANTIGUEDAD,
  tramoDeAntiguedad,
  type Periodo,
} from "./estadisticas-calculo";

/**
 * Estadísticas: lo que PASÓ en un período, para analizar y decidir.
 *
 * Todo sale del historial de movimientos y chequeos, filtrando SIEMPRE los
 * anulados (ver `movimientos`): un movimiento corregido sigue guardado y
 * sumarlo contaría dos veces.
 *
 * Las fechas se agrupan en hora de Argentina. Agrupar en UTC corre a medianoche
 * todo lo que pasa después de las 21, y un día de trabajo se parte en dos.
 *
 * Igual que en el tablero, las unidades NO se suman entre líneas: van abiertas
 * por línea, con su unidad. Lo que se compara entre líneas son bultos y
 * movimientos.
 */

const TZ = "America/Argentina/Buenos_Aires";

export type SerieDiaria = Array<{ dia: string; valor: number }>;

export type FlujoPorLinea = {
  linea: string;
  unidadPlural: string;
  ingresaron: number;
  egresaron: number;
  /** Lo que control corrigió, con signo: más es "había más de lo registrado". */
  ajusteNeto: number;
  /** Lo que control corrigió en valor absoluto: el tamaño del error. */
  ajusteBruto: number;
};

export type ModeloEnFlujo = {
  id: number;
  nombre: string;
  linea: string;
  unidadPlural: string;
  ingresaron: number;
  egresaron: number;
};

export type Estadisticas = {
  dias: Periodo;
  hoy: string;
  porDia: Record<"meter" | "sacar" | "mover" | "ajuste", SerieDiaria>;
  totales: Record<string, number>;
  /** Ingresos que fueron directo a "sin ubicar": cuánto faltó lugar. */
  ingresosSinUbicar: number;
  flujoPorLinea: FlujoPorLinea[];
  modelos: ModeloEnFlujo[];
  motivosEgreso: Array<{ motivo: string; esEgreso: boolean; movimientos: number }>;
  /** Días que estuvo en el rack lo que salió entero en el período, por línea. */
  permanencia: Array<{ linea: string; bultos: number; mediana: number | null; promedio: number | null }>;
  control: {
    chequeos: number;
    ok: number;
    vacioOk: number;
    corregidos: number;
    porDia: SerieDiaria;
    motivosAjuste: Array<{ motivo: string; ajustes: number }>;
  };
  porUsuario: Array<{ usuario: string; ingresos: number; egresos: number; reubicaciones: number; ajustes: number; chequeos: number }>;
  porHora: Array<{ hora: number; movimientos: number }>;
  antiguedad: {
    tramos: Array<{ tramo: string; bultos: number }>;
    masViejos: Array<{ id: number; codigo: string; contenido: string; ubicacion: string | null; dias: number }>;
  };
};

export async function estadisticas(dias: Periodo): Promise<Estadisticas> {
  const desde = sql`now() - (${dias}::int * interval '1 day')`;

  const [
    [{ hoy }],
    porDia,
    totales,
    sinUbicar,
    flujo,
    modelos,
    motivos,
    permanencia,
    chequeos,
    chequeosPorDia,
    motivosAjuste,
    porUsuario,
    chequeosPorUsuario,
    porHora,
    tramos,
    masViejos,
  ] = await Promise.all([
    db.execute(sql`
      select to_char(now() at time zone ${TZ}, 'YYYY-MM-DD') as hoy
    `) as unknown as Promise<Array<{ hoy: string }>>,

    db.execute(sql`
      select to_char(m.creado_en at time zone ${TZ}, 'YYYY-MM-DD') as dia, m.tipo,
             count(*)::int as valor
        from movimientos m
       where m.anulado_en is null and m.creado_en >= ${desde}
       group by 1, 2
    `) as unknown as Promise<Array<{ dia: string; tipo: string; valor: number }>>,

    db.execute(sql`
      select m.tipo, count(*)::int as n from movimientos m
       where m.anulado_en is null and m.creado_en >= ${desde}
       group by m.tipo
    `) as unknown as Promise<Array<{ tipo: string; n: number }>>,

    db.execute(sql`
      select count(*)::int as n from movimientos m
       where m.anulado_en is null and m.creado_en >= ${desde}
         and m.tipo = 'meter' and m.posicion_hasta_id is null
    `) as unknown as Promise<Array<{ n: number }>>,

    /**
     * Por línea, con la resta antes → después que usa todo el sistema: el
     * efecto de cada línea de movimiento es `cantidad - cantidad_antes`. Un
     * egreso parcial también cuenta, por eso no se mira el tipo de bulto.
     */
    db.execute(sql`
      select l.nombre as linea, l.unidad_plural, l.orden,
             coalesce(sum(ml.cantidad - ml.cantidad_antes) filter (where m.tipo = 'meter'), 0)::int as ingresaron,
             coalesce(-sum(ml.cantidad - ml.cantidad_antes) filter (where m.tipo = 'sacar'), 0)::int as egresaron,
             coalesce(sum(ml.cantidad - ml.cantidad_antes) filter (where m.tipo = 'ajuste'), 0)::int as ajuste_neto,
             coalesce(sum(abs(ml.cantidad - ml.cantidad_antes)) filter (where m.tipo = 'ajuste'), 0)::int as ajuste_bruto
        from movimientos m
        join movimiento_lineas ml on ml.movimiento_id = m.id
        join modelos mo on mo.id = ml.modelo_id
        join lineas l on l.id = mo.linea_id
       where m.anulado_en is null and m.creado_en >= ${desde}
       group by l.id
       order by l.orden
    `) as unknown as Promise<
      Array<{
        linea: string;
        unidad_plural: string;
        ingresaron: number;
        egresaron: number;
        ajuste_neto: number;
        ajuste_bruto: number;
      }>
    >,

    db.execute(sql`
      select mo.id, mo.nombre, l.nombre as linea, l.unidad_plural,
             coalesce(sum(ml.cantidad - ml.cantidad_antes) filter (where m.tipo = 'meter'), 0)::int as ingresaron,
             coalesce(-sum(ml.cantidad - ml.cantidad_antes) filter (where m.tipo = 'sacar'), 0)::int as egresaron
        from movimientos m
        join movimiento_lineas ml on ml.movimiento_id = m.id
        join modelos mo on mo.id = ml.modelo_id
        join lineas l on l.id = mo.linea_id
       where m.anulado_en is null and m.creado_en >= ${desde}
         and m.tipo in ('meter', 'sacar')
       group by mo.id, l.id
       order by l.orden, egresaron desc, mo.nombre
    `) as unknown as Promise<
      Array<{ id: number; nombre: string; linea: string; unidad_plural: string; ingresaron: number; egresaron: number }>
    >,

    db.execute(sql`
      select coalesce(m.motivo_nombre, 'Objeto, sin motivo') as motivo,
             coalesce(mt.es_egreso, false) as es_egreso,
             count(*)::int as movimientos
        from movimientos m
        left join motivos mt on mt.id = m.motivo_id
       where m.anulado_en is null and m.creado_en >= ${desde} and m.tipo = 'sacar'
       group by 1, 2
       order by 3 desc
    `) as unknown as Promise<Array<{ motivo: string; es_egreso: boolean; movimientos: number }>>,

    /**
     * Cuánto estuvo en el rack lo que salió ENTERO (cantidad final 0): desde
     * que nació el bulto hasta el egreso. Los parciales no cuentan -el bulto
     * sigue ahí- y los objetos tampoco, porque no son producto.
     */
    db.execute(sql`
      select l.nombre as linea, l.orden,
             extract(epoch from m.creado_en - b.creado_en) / 86400 as dias
        from movimientos m
        join bultos b on b.id = m.bulto_id
        join lateral (
          select mo.linea_id from movimiento_lineas ml join modelos mo on mo.id = ml.modelo_id
           where ml.movimiento_id = m.id limit 1
        ) x on true
        join lineas l on l.id = x.linea_id
       where m.anulado_en is null and m.creado_en >= ${desde}
         and m.tipo = 'sacar' and m.cantidad = 0 and m.packaging <> 'objeto'
       limit 20000
    `) as unknown as Promise<Array<{ linea: string; orden: number; dias: number | string }>>,

    db.execute(sql`
      select resultado, count(*)::int as n from chequeos
       where creado_en >= ${desde}
       group by resultado
    `) as unknown as Promise<Array<{ resultado: string; n: number }>>,

    db.execute(sql`
      select to_char(creado_en at time zone ${TZ}, 'YYYY-MM-DD') as dia, count(*)::int as valor
        from chequeos where creado_en >= ${desde}
       group by 1
    `) as unknown as Promise<Array<{ dia: string; valor: number }>>,

    db.execute(sql`
      select coalesce(m.motivo_nombre, 'Sin motivo') as motivo, count(*)::int as ajustes
        from movimientos m
       where m.anulado_en is null and m.creado_en >= ${desde} and m.tipo = 'ajuste'
       group by 1 order by 2 desc
    `) as unknown as Promise<Array<{ motivo: string; ajustes: number }>>,

    db.execute(sql`
      select m.usuario_nombre as usuario,
             count(*) filter (where m.tipo = 'meter')::int as ingresos,
             count(*) filter (where m.tipo = 'sacar')::int as egresos,
             count(*) filter (where m.tipo = 'mover')::int as reubicaciones,
             count(*) filter (where m.tipo = 'ajuste')::int as ajustes
        from movimientos m
       where m.anulado_en is null and m.creado_en >= ${desde}
       group by 1
    `) as unknown as Promise<
      Array<{ usuario: string; ingresos: number; egresos: number; reubicaciones: number; ajustes: number }>
    >,

    db.execute(sql`
      select usuario_nombre as usuario, count(*)::int as chequeos
        from chequeos where creado_en >= ${desde}
       group by 1
    `) as unknown as Promise<Array<{ usuario: string; chequeos: number }>>,

    db.execute(sql`
      select extract(hour from m.creado_en at time zone ${TZ})::int as hora, count(*)::int as movimientos
        from movimientos m
       where m.anulado_en is null and m.creado_en >= ${desde}
         -- La carga inicial no es trabajo del autoelevador: deformaría las horas pico.
         and m.tipo <> 'inicial'
       group by 1
    `) as unknown as Promise<Array<{ hora: number; movimientos: number }>>,

    /** La antigüedad del stock de HOY. No depende del período. */
    db.execute(sql`
      select extract(epoch from now() - b.creado_en) / 86400 as dias
        from bultos b
       where b.estado in ('ubicado', 'sin_ubicar') and b.packaging <> 'objeto'
    `) as unknown as Promise<Array<{ dias: number | string }>>,

    db.execute(sql`
      select b.id, b.codigo,
             coalesce((select string_agg(mo.nombre || ' ' || c.cantidad, ' + ' order by mo.nombre)
                         from bulto_contenido c join modelos mo on mo.id = c.modelo_id
                        where c.bulto_id = b.id), '') as contenido,
             case when p.id is null then null else g.codigo || '-' || p.codigo end as ubicacion,
             extract(epoch from now() - b.creado_en) / 86400 as dias
        from bultos b
        left join posiciones p on p.id = b.posicion_id
        left join grupos g on g.id = p.grupo_id
       where b.estado in ('ubicado', 'sin_ubicar') and b.packaging <> 'objeto'
       order by b.creado_en
       limit 10
    `) as unknown as Promise<
      Array<{ id: number; codigo: string; contenido: string; ubicacion: string | null; dias: number | string }>
    >,
  ]);

  const serie = (tipo: string) =>
    completarDias(
      porDia.filter((f) => f.tipo === tipo).map((f) => ({ dia: f.dia, valor: f.valor })),
      dias,
      hoy,
    );

  // Permanencia por línea: mediana y promedio en TS, porque la mediana en SQL
  // (percentile_cont) es más difícil de leer y son pocos miles de filas.
  const porLinea = new Map<string, { orden: number; dias: number[] }>();
  for (const f of permanencia) {
    const actual = porLinea.get(f.linea) ?? { orden: f.orden, dias: [] };
    actual.dias.push(Number(f.dias));
    porLinea.set(f.linea, actual);
  }

  const resultado = (r: string) => chequeos.find((c) => c.resultado === r)?.n ?? 0;

  // Los tramos de antigüedad, en el orden de la escala.
  const cuenta = new Map<string, number>();
  for (const t of tramos) {
    const tramo = tramoDeAntiguedad(Number(t.dias));
    cuenta.set(tramo, (cuenta.get(tramo) ?? 0) + 1);
  }

  const usuarios = new Map<string, Estadisticas["porUsuario"][number]>();
  for (const u of porUsuario) usuarios.set(u.usuario, { ...u, chequeos: 0 });
  for (const c of chequeosPorUsuario) {
    const actual =
      usuarios.get(c.usuario) ??
      { usuario: c.usuario, ingresos: 0, egresos: 0, reubicaciones: 0, ajustes: 0, chequeos: 0 };
    actual.chequeos = c.chequeos;
    usuarios.set(c.usuario, actual);
  }

  return {
    dias,
    hoy,
    porDia: {
      meter: serie("meter"),
      sacar: serie("sacar"),
      mover: serie("mover"),
      ajuste: serie("ajuste"),
    },
    totales: Object.fromEntries(totales.map((t) => [t.tipo, t.n])),
    ingresosSinUbicar: sinUbicar[0]?.n ?? 0,
    flujoPorLinea: flujo.map((f) => ({
      linea: f.linea,
      unidadPlural: f.unidad_plural,
      ingresaron: f.ingresaron,
      egresaron: f.egresaron,
      ajusteNeto: f.ajuste_neto,
      ajusteBruto: f.ajuste_bruto,
    })),
    modelos: modelos.map((m) => ({
      id: m.id,
      nombre: m.nombre,
      linea: m.linea,
      unidadPlural: m.unidad_plural,
      ingresaron: m.ingresaron,
      egresaron: m.egresaron,
    })),
    motivosEgreso: motivos.map((m) => ({
      motivo: m.motivo,
      esEgreso: m.es_egreso,
      movimientos: m.movimientos,
    })),
    permanencia: [...porLinea.entries()]
      .sort((a, b) => a[1].orden - b[1].orden)
      .map(([linea, { dias: d }]) => ({
        linea,
        bultos: d.length,
        mediana: mediana(d),
        promedio: d.length ? d.reduce((s, x) => s + x, 0) / d.length : null,
      })),
    control: {
      chequeos: chequeos.reduce((s, c) => s + c.n, 0),
      ok: resultado("ok"),
      vacioOk: resultado("vacio_ok"),
      corregidos: resultado("corregido"),
      porDia: completarDias(chequeosPorDia, dias, hoy),
      motivosAjuste,
    },
    porUsuario: [...usuarios.values()].sort(
      (a, b) =>
        b.ingresos + b.egresos + b.reubicaciones + b.ajustes + b.chequeos -
        (a.ingresos + a.egresos + a.reubicaciones + a.ajustes + a.chequeos),
    ),
    porHora: Array.from({ length: 24 }, (_, hora) => ({
      hora,
      movimientos: porHora.find((h) => h.hora === hora)?.movimientos ?? 0,
    })),
    antiguedad: {
      tramos: TRAMOS_ANTIGUEDAD.map((t) => ({ tramo: t.etiqueta, bultos: cuenta.get(t.etiqueta) ?? 0 })),
      masViejos: masViejos.map((v) => ({
        id: v.id,
        codigo: v.codigo,
        contenido: v.contenido,
        ubicacion: v.ubicacion,
        dias: Number(v.dias),
      })),
    },
  };
}
