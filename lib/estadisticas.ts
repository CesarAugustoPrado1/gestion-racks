import "server-only";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { mediana } from "./estadisticas-calculo";
import { FORMATO_SQL, tramosDe, type Rango } from "./periodos";

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

/** Una serie en el tiempo, un valor por tramo (hora, día, semana o mes), con los vacíos en cero. */
export type Serie = Array<{ clave: string; etiqueta: string; valor: number }>;

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
  porTramo: Record<"meter" | "sacar" | "mover" | "ajuste", Serie>;
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
    porTramo: Serie;
    motivosAjuste: Array<{ motivo: string; ajustes: number }>;
  };
  porUsuario: Array<{ usuario: string; ingresos: number; egresos: number; reubicaciones: number; ajustes: number; chequeos: number }>;
  porHora: Array<{ hora: number; movimientos: number }>;
};

/** Las dos puntas del intervalo, [desde, hasta), como parámetros de la consulta. */
export const puntas = (inicio: Date, fin: Date) => ({
  desde: sql`${inicio.toISOString()}::timestamptz`,
  hasta: sql`${fin.toISOString()}::timestamptz`,
});

/** La clave del tramo de un instante, igual a la de `tramosDe`. */
export const claveDe = (columna: ReturnType<typeof sql.raw>, r: Rango) => {
  const g = r.granularidad === "dia" ? "day" : r.granularidad === "semana" ? "week" : r.granularidad === "mes" ? "month" : "hour";
  return sql`to_char(date_trunc(${g}, ${columna} at time zone ${TZ}), ${FORMATO_SQL[r.granularidad]})`;
};

/** Completa una serie con los tramos sin datos, en cero. */
export function completar(r: Rango, filas: Array<{ clave: string; valor: number }>): Serie {
  const porClave = new Map(filas.map((f) => [f.clave, f.valor]));
  return tramosDe(r).map((t) => ({ clave: t.clave, etiqueta: t.etiqueta, valor: porClave.get(t.clave) ?? 0 }));
}

export async function estadisticas(r: Rango): Promise<Estadisticas> {
  const { desde, hasta } = puntas(r.inicio, r.fin);

  const [
    porTramo,
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
  ] = await Promise.all([
    db.execute(sql`
      select ${claveDe(sql.raw("m.creado_en"), r)} as clave, m.tipo,
             count(*)::int as valor
        from movimientos m
       where m.anulado_en is null and m.creado_en >= ${desde} and m.creado_en < ${hasta}
       group by 1, 2
    `) as unknown as Promise<Array<{ clave: string; tipo: string; valor: number }>>,

    db.execute(sql`
      select m.tipo, count(*)::int as n from movimientos m
       where m.anulado_en is null and m.creado_en >= ${desde} and m.creado_en < ${hasta}
       group by m.tipo
    `) as unknown as Promise<Array<{ tipo: string; n: number }>>,

    db.execute(sql`
      select count(*)::int as n from movimientos m
       where m.anulado_en is null and m.creado_en >= ${desde} and m.creado_en < ${hasta}
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
       where m.anulado_en is null and m.creado_en >= ${desde} and m.creado_en < ${hasta}
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
       where m.anulado_en is null and m.creado_en >= ${desde} and m.creado_en < ${hasta}
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
       where m.anulado_en is null and m.creado_en >= ${desde} and m.creado_en < ${hasta} and m.tipo = 'sacar'
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
       where m.anulado_en is null and m.creado_en >= ${desde} and m.creado_en < ${hasta}
         and m.tipo = 'sacar' and m.cantidad = 0 and m.packaging <> 'objeto'
       limit 20000
    `) as unknown as Promise<Array<{ linea: string; orden: number; dias: number | string }>>,

    db.execute(sql`
      select resultado, count(*)::int as n from chequeos
       where creado_en >= ${desde} and creado_en < ${hasta}
       group by resultado
    `) as unknown as Promise<Array<{ resultado: string; n: number }>>,

    db.execute(sql`
      select ${claveDe(sql.raw("creado_en"), r)} as clave, count(*)::int as valor
        from chequeos where creado_en >= ${desde} and creado_en < ${hasta}
       group by 1
    `) as unknown as Promise<Array<{ clave: string; valor: number }>>,

    db.execute(sql`
      select coalesce(m.motivo_nombre, 'Sin motivo') as motivo, count(*)::int as ajustes
        from movimientos m
       where m.anulado_en is null and m.creado_en >= ${desde} and m.creado_en < ${hasta} and m.tipo = 'ajuste'
       group by 1 order by 2 desc
    `) as unknown as Promise<Array<{ motivo: string; ajustes: number }>>,

    db.execute(sql`
      select m.usuario_nombre as usuario,
             count(*) filter (where m.tipo = 'meter')::int as ingresos,
             count(*) filter (where m.tipo = 'sacar')::int as egresos,
             count(*) filter (where m.tipo = 'mover')::int as reubicaciones,
             count(*) filter (where m.tipo = 'ajuste')::int as ajustes
        from movimientos m
       where m.anulado_en is null and m.creado_en >= ${desde} and m.creado_en < ${hasta}
       group by 1
    `) as unknown as Promise<
      Array<{ usuario: string; ingresos: number; egresos: number; reubicaciones: number; ajustes: number }>
    >,

    db.execute(sql`
      select usuario_nombre as usuario, count(*)::int as chequeos
        from chequeos where creado_en >= ${desde} and creado_en < ${hasta}
       group by 1
    `) as unknown as Promise<Array<{ usuario: string; chequeos: number }>>,

    db.execute(sql`
      select extract(hour from m.creado_en at time zone ${TZ})::int as hora, count(*)::int as movimientos
        from movimientos m
       where m.anulado_en is null and m.creado_en >= ${desde} and m.creado_en < ${hasta}
         -- La carga inicial no es trabajo del autoelevador: deformaría las horas pico.
         and m.tipo <> 'inicial'
       group by 1
    `) as unknown as Promise<Array<{ hora: number; movimientos: number }>>,

  ]);

  const serie = (tipo: string) =>
    completar(
      r,
      porTramo.filter((f) => f.tipo === tipo),
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
    porTramo: {
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
      porTramo: completar(r, chequeosPorDia),
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
  };
}

/* -------------------------------------------------------------------------- */
/* Primera y segunda                                                          */
/* -------------------------------------------------------------------------- */

export type CambioDeCategoria = {
  creadoEn: Date;
  bultoId: number;
  bultoCodigo: string;
  /** `categoria` = pasaje; `ajuste` = corrección de control. */
  tipo: "categoria" | "ajuste";
  desde: string;
  hasta: string;
  contenido: string;
  usuario: string;
  /** El porqué: la nota del pasaje, o el motivo y la nota de la corrección. */
  porQue: string | null;
};

export type EstadisticasDeCategoria = {
  /** Pasajes de categoría en el período, por sentido. */
  pasajes: { aSegunda: number; aPrimera: number };
  /** Correcciones de control que cambiaron la categoría: errores de registro. */
  correcciones: { aSegunda: number; aPrimera: number };
  /** Lo que pasó a segunda en el período, por línea y en su unidad. */
  aSegundaPorLinea: Array<{ linea: string; unidadPlural: string; unidades: number; bultos: number }>;
  porUsuario: Array<{ usuario: string; pasajes: number; correcciones: number }>;
  /** Los últimos cambios del período, uno por uno: para auditar. */
  ultimos: CambioDeCategoria[];
  /** Lo que hay HOY de segunda, por línea. No depende del período. */
  stockSegunda: Array<{ linea: string; unidadPlural: string; unidades: number; bultos: number }>;
};

/**
 * Los cambios de categoría: pasajes (`categoria`) y correcciones de control
 * (`ajuste` con la categoría distinta antes y después). Se reconocen por el
 * antes y el después del movimiento, no por notas.
 */
export async function estadisticasDeCategoria(r: Rango): Promise<EstadisticasDeCategoria> {
  const { desde, hasta } = puntas(r.inicio, r.fin);
  const cambio = sql`m.anulado_en is null and m.creado_en >= ${desde} and m.creado_en < ${hasta} and m.calidad_antes <> m.calidad`;

  const [conteos, porLinea, porUsuario, ultimos, stock] = await Promise.all([
    db.execute(sql`
      select m.tipo, m.calidad, count(*)::int as n
        from movimientos m where ${cambio}
       group by 1, 2
    `) as unknown as Promise<Array<{ tipo: string; calidad: string; n: number }>>,

    db.execute(sql`
      select l.nombre as linea, l.unidad_plural, sum(ml.cantidad)::int as unidades,
             count(distinct m.id)::int as bultos
        from movimientos m
        join movimiento_lineas ml on ml.movimiento_id = m.id
        join modelos mo on mo.id = ml.modelo_id
        join lineas l on l.id = mo.linea_id
       where ${cambio} and m.calidad = 'segunda'
       group by l.id, l.nombre, l.unidad_plural, l.orden
       order by l.orden
    `) as unknown as Promise<Array<{ linea: string; unidad_plural: string; unidades: number; bultos: number }>>,

    db.execute(sql`
      select m.usuario_nombre as usuario,
             count(*) filter (where m.tipo = 'categoria')::int as pasajes,
             count(*) filter (where m.tipo = 'ajuste')::int as correcciones
        from movimientos m where ${cambio}
       group by 1 order by count(*) desc
    `) as unknown as Promise<Array<{ usuario: string; pasajes: number; correcciones: number }>>,

    db.execute(sql`
      select m.creado_en, m.bulto_id, m.bulto_codigo, m.tipo, m.calidad_antes, m.calidad,
             m.usuario_nombre, m.nota, m.motivo_nombre,
             (select string_agg(ml.modelo_nombre || ' ' || ml.cantidad, ' + ' order by ml.modelo_nombre)
                from movimiento_lineas ml where ml.movimiento_id = m.id) as contenido
        from movimientos m where ${cambio}
       order by m.creado_en desc, m.id desc
       limit 50
    `) as unknown as Promise<
      Array<{
        creado_en: Date | string;
        bulto_id: number;
        bulto_codigo: string;
        tipo: "categoria" | "ajuste";
        calidad_antes: string;
        calidad: string;
        usuario_nombre: string;
        nota: string | null;
        motivo_nombre: string | null;
        contenido: string | null;
      }>
    >,

    db.execute(sql`
      select l.nombre as linea, l.unidad_plural, sum(c.cantidad)::int as unidades,
             count(distinct b.id)::int as bultos
        from bultos b
        join bulto_contenido c on c.bulto_id = b.id
        join modelos mo on mo.id = c.modelo_id
        join lineas l on l.id = mo.linea_id
       where b.estado in ('ubicado', 'sin_ubicar') and b.calidad = 'segunda'
       group by l.id, l.nombre, l.unidad_plural, l.orden
       order by l.orden
    `) as unknown as Promise<Array<{ linea: string; unidad_plural: string; unidades: number; bultos: number }>>,
  ]);

  const contar = (tipo: string, calidad: string) =>
    conteos.find((c) => c.tipo === tipo && c.calidad === calidad)?.n ?? 0;

  return {
    pasajes: { aSegunda: contar("categoria", "segunda"), aPrimera: contar("categoria", "primera") },
    correcciones: { aSegunda: contar("ajuste", "segunda"), aPrimera: contar("ajuste", "primera") },
    aSegundaPorLinea: porLinea.map((f) => ({ linea: f.linea, unidadPlural: f.unidad_plural, unidades: f.unidades, bultos: f.bultos })),
    porUsuario,
    ultimos: ultimos.map((f) => ({
      creadoEn: new Date(f.creado_en),
      bultoId: f.bulto_id,
      bultoCodigo: f.bulto_codigo,
      tipo: f.tipo,
      desde: f.calidad_antes,
      hasta: f.calidad,
      contenido: f.contenido ?? "",
      usuario: f.usuario_nombre,
      porQue: [f.motivo_nombre, f.nota].filter(Boolean).join(" · ") || null,
    })),
    stockSegunda: stock.map((f) => ({ linea: f.linea, unidadPlural: f.unidad_plural, unidades: f.unidades, bultos: f.bultos })),
  };
}

/* -------------------------------------------------------------------------- */
/* Totales comparables y evolución del stock                                  */
/* -------------------------------------------------------------------------- */

/** Los números de cabecera de un intervalo: se calculan igual para el período y para el anterior. */
export type Totales = {
  /** Movimientos por tipo, sin anulados. */
  movimientos: Record<string, number>;
  /** Bultos que entraron (ingresos) y que salieron ENTEROS. */
  bultosEntraron: number;
  bultosSalieron: number;
  chequeos: number;
  chequeosBien: number;
  /** En m², todas las líneas juntas (solo los modelos con m² por unidad). */
  m2Entraron: number;
  m2Salieron: number;
  /** Por línea, en su unidad: lo que entró y lo que salió. */
  porLinea: Record<string, { unidadPlural: string; entraron: number; salieron: number }>;
};

export async function totales(inicio: Date, fin: Date): Promise<Totales> {
  const { desde, hasta } = puntas(inicio, fin);
  const [movs, chequeos, lineas] = await Promise.all([
    db.execute(sql`
      select m.tipo, count(*)::int as n,
             count(*) filter (where m.tipo = 'meter' and m.packaging <> 'objeto')::int as entraron,
             count(*) filter (where m.tipo = 'sacar' and m.cantidad = 0 and m.packaging <> 'objeto')::int as salieron
        from movimientos m
       where m.anulado_en is null and m.creado_en >= ${desde} and m.creado_en < ${hasta}
       group by m.tipo
    `) as unknown as Promise<Array<{ tipo: string; n: number; entraron: number; salieron: number }>>,
    db.execute(sql`
      select count(*)::int as n, count(*) filter (where resultado <> 'corregido')::int as bien
        from chequeos where creado_en >= ${desde} and creado_en < ${hasta}
    `) as unknown as Promise<Array<{ n: number; bien: number }>>,
    db.execute(sql`
      select l.nombre as linea, l.unidad_plural,
             coalesce(sum(ml.cantidad - ml.cantidad_antes) filter (where m.tipo = 'meter'), 0)::int as entraron,
             coalesce(-sum(ml.cantidad - ml.cantidad_antes) filter (where m.tipo = 'sacar'), 0)::int as salieron,
             coalesce(sum((ml.cantidad - ml.cantidad_antes) * mo.m2_por_unidad) filter (where m.tipo = 'meter'), 0)::float8 as m2_entraron,
             coalesce(-sum((ml.cantidad - ml.cantidad_antes) * mo.m2_por_unidad) filter (where m.tipo = 'sacar'), 0)::float8 as m2_salieron
        from movimientos m
        join movimiento_lineas ml on ml.movimiento_id = m.id
        join modelos mo on mo.id = ml.modelo_id
        join lineas l on l.id = mo.linea_id
       where m.anulado_en is null and m.creado_en >= ${desde} and m.creado_en < ${hasta}
       group by l.id
    `) as unknown as Promise<
      Array<{ linea: string; unidad_plural: string; entraron: number; salieron: number; m2_entraron: number; m2_salieron: number }>
    >,
  ]);
  return {
    movimientos: Object.fromEntries(movs.map((m) => [m.tipo, m.n])),
    bultosEntraron: movs.reduce((s, m) => s + m.entraron, 0),
    bultosSalieron: movs.reduce((s, m) => s + m.salieron, 0),
    chequeos: chequeos[0]?.n ?? 0,
    chequeosBien: chequeos[0]?.bien ?? 0,
    m2Entraron: lineas.reduce((s2, l) => s2 + l.m2_entraron, 0),
    m2Salieron: lineas.reduce((s2, l) => s2 + l.m2_salieron, 0),
    porLinea: Object.fromEntries(
      lineas.map((l) => [l.linea, { unidadPlural: l.unidad_plural, entraron: l.entraron, salieron: l.salieron }]),
    ),
  };
}

export type Evolucion = {
  /** Bultos de producto en stock al cierre de cada tramo. */
  bultos: Serie;
  /** m² en stock al cierre de cada tramo, todas las líneas (modelos con m² por unidad). */
  m2: Serie;
  /** Por línea, unidades en stock al cierre de cada tramo. */
  lineas: Array<{ linea: string; unidadPlural: string; serie: Serie; alInicio: number }>;
  bultosAlInicio: number;
};

/**
 * Cuánto stock había al CIERRE de cada tramo del período.
 *
 * Sale del historial con la misma cuenta que sostiene todo el sistema: el stock
 * en un instante es la suma de `cantidad - cantidad_antes` de los movimientos
 * vigentes anteriores. Se calcula el saldo al inicio y se le van sumando los
 * netos de cada tramo.
 *
 * Los bultos se cuentan igual: +1 cuando un bulto pasa de 0 a algo (entra), −1
 * cuando pasa de algo a 0 (sale entero). Los objetos no cuentan: no son stock.
 */
export async function evolucion(r: Rango): Promise<Evolucion> {
  const { desde, hasta } = puntas(r.inicio, r.fin);
  const efectoBulto = sql`case when m.cantidad_antes = 0 and m.cantidad > 0 then 1
                               when m.cantidad_antes > 0 and m.cantidad = 0 then -1 else 0 end`;
  const efectoM2 = sql`(ml.cantidad - ml.cantidad_antes) * mo.m2_por_unidad`;
  const [lineas, inicialLineas, netoLineas, inicialBultos, netoBultos, inicialM2, netoM2] = await Promise.all([
    db.execute(sql`select nombre, unidad_plural from lineas where activa order by orden`) as unknown as Promise<
      Array<{ nombre: string; unidad_plural: string }>
    >,
    db.execute(sql`
      select l.nombre as linea, coalesce(sum(ml.cantidad - ml.cantidad_antes), 0)::int as q
        from movimientos m
        join movimiento_lineas ml on ml.movimiento_id = m.id
        join modelos mo on mo.id = ml.modelo_id
        join lineas l on l.id = mo.linea_id
       where m.anulado_en is null and m.creado_en < ${desde}
       group by l.id
    `) as unknown as Promise<Array<{ linea: string; q: number }>>,
    db.execute(sql`
      select l.nombre as linea, ${claveDe(sql.raw("m.creado_en"), r)} as clave,
             sum(ml.cantidad - ml.cantidad_antes)::int as valor
        from movimientos m
        join movimiento_lineas ml on ml.movimiento_id = m.id
        join modelos mo on mo.id = ml.modelo_id
        join lineas l on l.id = mo.linea_id
       where m.anulado_en is null and m.creado_en >= ${desde} and m.creado_en < ${hasta}
       group by 1, 2
    `) as unknown as Promise<Array<{ linea: string; clave: string; valor: number }>>,
    db.execute(sql`
      select coalesce(sum(${efectoBulto}), 0)::int as q from movimientos m
       where m.anulado_en is null and m.creado_en < ${desde} and m.packaging <> 'objeto'
    `) as unknown as Promise<Array<{ q: number }>>,
    db.execute(sql`
      select ${claveDe(sql.raw("m.creado_en"), r)} as clave, sum(${efectoBulto})::int as valor
        from movimientos m
       where m.anulado_en is null and m.creado_en >= ${desde} and m.creado_en < ${hasta}
         and m.packaging <> 'objeto'
       group by 1
    `) as unknown as Promise<Array<{ clave: string; valor: number }>>,
    db.execute(sql`
      select coalesce(sum(${efectoM2}), 0)::float8 as q
        from movimientos m
        join movimiento_lineas ml on ml.movimiento_id = m.id
        join modelos mo on mo.id = ml.modelo_id
       where m.anulado_en is null and m.creado_en < ${desde}
    `) as unknown as Promise<Array<{ q: number }>>,
    db.execute(sql`
      select ${claveDe(sql.raw("m.creado_en"), r)} as clave, coalesce(sum(${efectoM2}), 0)::float8 as valor
        from movimientos m
        join movimiento_lineas ml on ml.movimiento_id = m.id
        join modelos mo on mo.id = ml.modelo_id
       where m.anulado_en is null and m.creado_en >= ${desde} and m.creado_en < ${hasta}
       group by 1
    `) as unknown as Promise<Array<{ clave: string; valor: number }>>,
  ]);

  const acumular = (inicial: number, netos: Array<{ clave: string; valor: number }>): Serie => {
    let saldo = inicial;
    return completar(r, netos).map((t) => ({ ...t, valor: (saldo += t.valor) }));
  };

  return {
    bultosAlInicio: inicialBultos[0]?.q ?? 0,
    bultos: acumular(inicialBultos[0]?.q ?? 0, netoBultos),
    m2: acumular(inicialM2[0]?.q ?? 0, netoM2).map((t) => ({ ...t, valor: Math.round(t.valor) })),
    lineas: lineas.map((l) => {
      const alInicio = inicialLineas.find((x) => x.linea === l.nombre)?.q ?? 0;
      return {
        linea: l.nombre,
        unidadPlural: l.unidad_plural,
        alInicio,
        serie: acumular(alInicio, netoLineas.filter((x) => x.linea === l.nombre)),
      };
    }),
  };
}

/* -------------------------------------------------------------------------- */
/* Merma                                                                      */
/* -------------------------------------------------------------------------- */

export type RegistroDeMerma = {
  creadoEn: Date;
  bultoCodigo: string;
  posicion: string | null;
  contenido: string;
  motivo: string;
  nota: string | null;
  usuario: string;
  /** `sacar` = la registró el clarkista; `ajuste` = la encontró control. */
  tipo: string;
};

export type EstadisticasDeMerma = {
  /** m² perdidos (solo modelos con m² por unidad) y cuántos registros. */
  m2: number;
  registros: number;
  /** Lo mismo en el período anterior equivalente, para comparar. */
  anterior: { m2: number; registros: number };
  /** De todo lo que salió del rack en m², qué parte fue merma (0 a 1). Null si no salió nada. */
  parteDeLoQueSalio: number | null;
  /** Registrada por el clarkista al sacar, o encontrada por control en un chequeo. */
  porOrigen: { egreso: number; chequeo: number };
  porLinea: Array<{ linea: string; unidadPlural: string; unidades: number; m2: number; salieron: number }>;
  porMotivo: Array<{ motivo: string; registros: number; m2: number }>;
  porGrupo: Array<{ grupo: string; registros: number; m2: number }>;
  porPosicion: Array<{ posicion: string; registros: number; m2: number }>;
  porModelo: Array<{ id: number; modelo: string; linea: string; unidadPlural: string; unidades: number; m2: number }>;
  porUsuario: Array<{ usuario: string; registros: number; m2: number }>;
  /** m² perdidos por tramo del período. */
  serie: Serie;
  ultimos: RegistroDeMerma[];
};

/**
 * La MERMA de un período: lo que se perdió o se arruinó en el depósito. Sale de
 * los movimientos marcados como merma (egresos del clarkista y ajustes de
 * control), sin anulados. Lo perdido de cada modelo es lo que bajó: `cantidad
 * antes − cantidad después` de sus líneas.
 */
export async function estadisticasDeMerma(
  r: Rango,
  anterior: { inicio: Date; fin: Date },
): Promise<EstadisticasDeMerma> {
  const { desde, hasta } = puntas(r.inicio, r.fin);
  const ant = puntas(anterior.inicio, anterior.fin);
  const enRango = sql`m.anulado_en is null and m.creado_en >= ${desde} and m.creado_en < ${hasta}`;
  const perdido = sql`(ml.cantidad_antes - ml.cantidad)`;
  const m2Perdido = sql`(ml.cantidad_antes - ml.cantidad) * mo.m2_por_unidad`;
  const lineasDe = sql`
    from movimientos m
    join movimiento_lineas ml on ml.movimiento_id = m.id
    join modelos mo on mo.id = ml.modelo_id
    join lineas l on l.id = mo.linea_id`;

  const [cabecera, cabeceraAnterior, salido, porLinea, porMotivo, porGrupo, porPosicion, porModelo, porUsuario, serie, ultimos] =
    await Promise.all([
      db.execute(sql`
        select count(distinct m.id)::int as registros,
               coalesce(sum(${m2Perdido}), 0)::float8 as m2,
               count(distinct m.id) filter (where m.tipo = 'sacar')::int as egreso,
               count(distinct m.id) filter (where m.tipo <> 'sacar')::int as chequeo
          ${lineasDe}
         where ${enRango} and m.es_merma
      `) as unknown as Promise<Array<{ registros: number; m2: number; egreso: number; chequeo: number }>>,
      db.execute(sql`
        select count(distinct m.id)::int as registros, coalesce(sum(${m2Perdido}), 0)::float8 as m2
          ${lineasDe}
         where m.anulado_en is null and m.creado_en >= ${ant.desde} and m.creado_en < ${ant.hasta} and m.es_merma
      `) as unknown as Promise<Array<{ registros: number; m2: number }>>,
      db.execute(sql`
        select coalesce(sum(${m2Perdido}), 0)::float8 as m2
          ${lineasDe}
         where ${enRango} and (m.tipo = 'sacar' or m.es_merma)
      `) as unknown as Promise<Array<{ m2: number }>>,
      db.execute(sql`
        select l.nombre as linea, l.unidad_plural,
               coalesce(sum(${perdido}) filter (where m.es_merma), 0)::int as unidades,
               coalesce(sum(${m2Perdido}) filter (where m.es_merma), 0)::float8 as m2,
               coalesce(sum(${perdido}) filter (where m.tipo = 'sacar' or m.es_merma), 0)::int as salieron
          ${lineasDe}
         where ${enRango} and (m.tipo = 'sacar' or m.es_merma)
         group by l.id, l.nombre, l.unidad_plural, l.orden
        having coalesce(sum(${perdido}) filter (where m.es_merma), 0) > 0
         order by l.orden
      `) as unknown as Promise<Array<{ linea: string; unidad_plural: string; unidades: number; m2: number; salieron: number }>>,
      db.execute(sql`
        select coalesce(m.motivo_nombre, 'Sin motivo') as motivo, count(distinct m.id)::int as registros,
               coalesce(sum(${m2Perdido}), 0)::float8 as m2
          ${lineasDe}
         where ${enRango} and m.es_merma
         group by 1 order by 3 desc, 2 desc
      `) as unknown as Promise<Array<{ motivo: string; registros: number; m2: number }>>,
      db.execute(sql`
        select coalesce(g.codigo, 'Sin ubicar') as grupo, count(distinct m.id)::int as registros,
               coalesce(sum(${m2Perdido}), 0)::float8 as m2
          ${lineasDe}
          left join posiciones p on p.id = m.posicion_desde_id
          left join grupos g on g.id = p.grupo_id
         where ${enRango} and m.es_merma
         group by 1 order by 3 desc, 2 desc
      `) as unknown as Promise<Array<{ grupo: string; registros: number; m2: number }>>,
      db.execute(sql`
        select m.posicion_desde_codigo as posicion, count(distinct m.id)::int as registros,
               coalesce(sum(${m2Perdido}), 0)::float8 as m2
          ${lineasDe}
         where ${enRango} and m.es_merma and m.posicion_desde_codigo is not null
         group by 1 order by 2 desc, 3 desc
         limit 10
      `) as unknown as Promise<Array<{ posicion: string; registros: number; m2: number }>>,
      db.execute(sql`
        select mo.id, mo.nombre as modelo, l.nombre as linea, l.unidad_plural,
               sum(${perdido})::int as unidades, coalesce(sum(${m2Perdido}), 0)::float8 as m2
          ${lineasDe}
         where ${enRango} and m.es_merma
         group by mo.id, l.id
         order by 6 desc, 5 desc
      `) as unknown as Promise<Array<{ id: number; modelo: string; linea: string; unidad_plural: string; unidades: number; m2: number }>>,
      db.execute(sql`
        select m.usuario_nombre as usuario, count(distinct m.id)::int as registros,
               coalesce(sum(${m2Perdido}), 0)::float8 as m2
          ${lineasDe}
         where ${enRango} and m.es_merma
         group by 1 order by 2 desc
      `) as unknown as Promise<Array<{ usuario: string; registros: number; m2: number }>>,
      db.execute(sql`
        select ${claveDe(sql.raw("m.creado_en"), r)} as clave, coalesce(sum(${m2Perdido}), 0)::float8 as valor
          ${lineasDe}
         where ${enRango} and m.es_merma
         group by 1
      `) as unknown as Promise<Array<{ clave: string; valor: number }>>,
      db.execute(sql`
        select m.creado_en, m.bulto_codigo, m.posicion_desde_codigo as posicion, m.motivo_nombre, m.nota,
               m.usuario_nombre, m.tipo,
               (select string_agg(x.modelo_nombre || ' ' || (x.cantidad_antes - x.cantidad), ' + ' order by x.modelo_nombre)
                  from movimiento_lineas x where x.movimiento_id = m.id and x.cantidad_antes > x.cantidad) as contenido
          from movimientos m
         where ${enRango} and m.es_merma
         order by m.creado_en desc, m.id desc
         limit 30
      `) as unknown as Promise<
        Array<{
          creado_en: Date | string;
          bulto_codigo: string;
          posicion: string | null;
          motivo_nombre: string | null;
          nota: string | null;
          usuario_nombre: string;
          tipo: string;
          contenido: string | null;
        }>
      >,
    ]);

  const c = cabecera[0];
  const totalSalido = salido[0]?.m2 ?? 0;
  return {
    m2: c?.m2 ?? 0,
    registros: c?.registros ?? 0,
    anterior: { m2: cabeceraAnterior[0]?.m2 ?? 0, registros: cabeceraAnterior[0]?.registros ?? 0 },
    parteDeLoQueSalio: totalSalido > 0 ? (c?.m2 ?? 0) / totalSalido : null,
    porOrigen: { egreso: c?.egreso ?? 0, chequeo: c?.chequeo ?? 0 },
    porLinea: porLinea.map((l) => ({ linea: l.linea, unidadPlural: l.unidad_plural, unidades: l.unidades, m2: l.m2, salieron: l.salieron })),
    porMotivo,
    porGrupo,
    porPosicion,
    porModelo: porModelo.map((x) => ({ ...x, unidadPlural: x.unidad_plural })),
    porUsuario,
    serie: completar(r, serie),
    ultimos: ultimos.map((u) => ({
      creadoEn: new Date(u.creado_en),
      bultoCodigo: u.bulto_codigo,
      posicion: u.posicion,
      contenido: u.contenido ?? "",
      motivo: u.motivo_nombre ?? "Sin motivo",
      nota: u.nota,
      usuario: u.usuario_nombre,
      tipo: u.tipo,
    })),
  };
}
