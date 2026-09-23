import "server-only";
import { sql } from "drizzle-orm";
import { db } from "./db";

/**
 * Si la base de verdad tiene el esquema que el codigo espera.
 *
 * Por que no alcanza con mirar `drizzle.__drizzle_migrations`: en esta
 * instalacion las migraciones se aplican a mano, pegando el SQL en el editor de
 * Neon y despues la fila de control. Son dos pasos, y el segundo puede salir
 * bien con el primero a medias -una sentencia que fallo y se siguio de largo-.
 * Entonces la tabla de control diria "0004 aplicada" sobre una base sin la tabla
 * `grupos`, y la app recien lo contaria al abrir la pantalla de racks, en la
 * planta, con el autoelevador esperando.
 *
 * Asi que se chequean las dos cosas por separado y se cuenta cual es cual:
 * la contabilidad (que dice la tabla de control) y la estructura (que hay
 * realmente). La que manda es la estructura.
 */

export type Exigencia = {
  migracion: string;
  /** En castellano y sin jerga: es lo que se lee cuando algo falta. */
  que: string;
  objeto: string;
  presente: boolean;
};

export type EstadoDelEsquema = {
  contabilidad: Array<{ tag: string; aplicada: boolean }>;
  exigencias: Exigencia[];
  /** Lo que falta, ya separado, porque es lo unico que hay que leer. */
  faltantes: Exigencia[];
  /** Tablas y columnas que sobran de un esquema viejo. */
  sobrantes: Exigencia[];
  veredicto: "al_dia" | "incompleto" | "sin_migrar";
};

/**
 * El diario de migraciones, copiado de drizzle/meta/_journal.json.
 *
 * Copiado y no importado: `drizzle/` no entra en el bundle de Vercel, y una
 * pantalla de diagnostico que se cae por un import que no resuelve es peor que
 * no tenerla. Si algun dia se agrega una migracion, se agrega el renglon acá;
 * que sea un paso manual es aceptable porque escribir la migracion ya lo es.
 */
const DIARIO: Array<{ tag: string; when: number }> = [
  { tag: "0000_inicial", when: 1790046861364 },
  { tag: "0001_dominio", when: 1790071737254 },
  { tag: "0002_bultos-mezclados", when: 1790090743726 },
  { tag: "0003_movimientos", when: 1790105452228 },
  { tag: "0004_grupos", when: 1790120489325 },
];

/**
 * Que tuvo que dejar cada migracion.
 *
 * No es el esquema entero: es una huella por migracion, elegida entre lo que esa
 * migracion agrego y ninguna otra toca. Alcanza para distinguir "corrio" de "no
 * corrio", que es la pregunta.
 */
type Huella = { migracion: string; que: string; objeto: string; debeEstar?: false };

const HUELLAS: Huella[] = [
  { migracion: "0000_inicial", que: "los usuarios y la configuración", objeto: "usuarios" },
  { migracion: "0000_inicial", que: "los parámetros del sistema", objeto: "config" },

  { migracion: "0001_dominio", que: "las líneas de producto", objeto: "lineas" },
  { migracion: "0001_dominio", que: "los modelos", objeto: "modelos" },
  { migracion: "0001_dominio", que: "las cantidades normalizadas", objeto: "normas" },
  { migracion: "0001_dominio", que: "las posiciones", objeto: "posiciones" },
  { migracion: "0001_dominio", que: "la profundidad de la posición", objeto: "posiciones.profundidad" },
  { migracion: "0001_dominio", que: "la altura máxima de la posición", objeto: "posiciones.altura_max_cm" },
  { migracion: "0001_dominio", que: "los bultos", objeto: "bultos" },
  { migracion: "0001_dominio", que: "los chequeos de control", objeto: "chequeos" },

  { migracion: "0002_bultos-mezclados", que: "el contenido de cada bulto, que permite mezclar modelos", objeto: "bulto_contenido" },
  { migracion: "0002_bultos-mezclados", que: "las líneas de cada movimiento", objeto: "movimiento_lineas" },
  { migracion: "0002_bultos-mezclados", que: "el modelo suelto en el bulto, que ahora vive en bulto_contenido", objeto: "bultos.modelo_id", debeEstar: false },

  { migracion: "0003_movimientos", que: "el ANTES de cada movimiento, de donde sale todo el stock", objeto: "movimientos.cantidad_antes" },
  { migracion: "0003_movimientos", que: "el ANTES de cada línea", objeto: "movimiento_lineas.cantidad_antes" },
  { migracion: "0003_movimientos", que: "el packaging anterior, que muestra palet → suelto", objeto: "movimientos.packaging_antes" },
  { migracion: "0003_movimientos", que: "la anulación de un movimiento", objeto: "movimientos.anulado_en" },
  { migracion: "0003_movimientos", que: "qué movimiento reemplaza a cuál", objeto: "movimientos.reemplaza_a" },
  { migracion: "0003_movimientos", que: "si un motivo saca producto", objeto: "motivos.es_egreso" },

  { migracion: "0004_grupos", que: "los grupos de racks", objeto: "grupos" },
  { migracion: "0004_grupos", que: "la geometría del grupo (ancho, niveles, profundidad)", objeto: "grupos.profundidad" },
  { migracion: "0004_grupos", que: "cuántos módulos o calles tiene el grupo", objeto: "grupos.unidades" },
  { migracion: "0004_grupos", que: "la altura máxima por nivel", objeto: "niveles" },
  { migracion: "0004_grupos", que: "el módulo o calle de cada posición", objeto: "posiciones.unidad" },
  { migracion: "0004_grupos", que: "la columna de cada posición", objeto: "posiciones.columna" },
  { migracion: "0004_grupos", que: "el grupo al que pertenece la posición (antes era rack_id)", objeto: "posiciones.grupo_id" },
  { migracion: "0004_grupos", que: "la altura que admite el modelo así empaquetado", objeto: "normas.altura_cm" },
  { migracion: "0004_grupos", que: "la tabla vieja de racks, que pasó a llamarse grupos", objeto: "racks", debeEstar: false },
  { migracion: "0004_grupos", que: "el rack viejo de la posición, que pasó a llamarse grupo_id", objeto: "posiciones.rack_id", debeEstar: false },
  { migracion: "0004_grupos", que: "la capacidad por posición, que ya no se usa: una posición lleva un bulto", objeto: "posiciones.capacidad_bultos", debeEstar: false },
  { migracion: "0004_grupos", que: "la profundidad en el bulto, que es de la posición y no del bulto", objeto: "bultos.profundidad", debeEstar: false },
];

/** Una sola consulta para todo: veintipico de round-trips a Neon sería absurdo. */
async function loQueHay(): Promise<Set<string>> {
  const filas = (await db.execute(sql`
    select table_name as objeto from information_schema.tables
     where table_schema = 'public'
    union all
    select table_name || '.' || column_name from information_schema.columns
     where table_schema = 'public'
  `)) as unknown as Array<{ objeto: string }>;
  return new Set(filas.map((f) => f.objeto));
}

export async function estadoDelEsquema(): Promise<EstadoDelEsquema> {
  const [hay, aplicadas] = await Promise.all([
    loQueHay(),
    db
      .execute(
        sql`select created_at from drizzle.__drizzle_migrations order by created_at`,
      )
      .then((f) => (f as unknown as Array<{ created_at: string | number }>)
        .map((x) => Number(x.created_at)))
      // Si la tabla no existe, no se aplicó ninguna migración con drizzle.
      // Es un estado válido, no un error.
      .catch(() => [] as number[]),
  ]);

  const contabilidad = DIARIO.map((m) => ({
    tag: m.tag,
    aplicada: aplicadas.includes(m.when),
  }));

  const exigencias: Exigencia[] = HUELLAS.map((h) => ({
    migracion: h.migracion,
    que: h.que,
    objeto: h.objeto,
    presente: hay.has(h.objeto) === (h.debeEstar !== false),
  }));

  const rotas = exigencias.filter((e) => !e.presente);
  const esSobrante = (e: Exigencia) =>
    HUELLAS.find((h) => h.objeto === e.objeto)?.debeEstar === false;

  return {
    contabilidad,
    exigencias,
    faltantes: rotas.filter((e) => !esSobrante(e)),
    sobrantes: rotas.filter(esSobrante),
    veredicto:
      rotas.length === 0
        ? "al_dia"
        : hay.has("usuarios")
          ? "incompleto"
          : "sin_migrar",
  };
}

/**
 * La invariante del dominio: el stock que sale de sumar movimientos tiene que
 * dar lo mismo que el stock vivo.
 *
 * Es la unica consulta que puede decir "las migraciones entraron pero los datos
 * quedaron mal", que es exactamente lo que paso con la 0003: los tipos estaban
 * traducidos y las salidas viejas seguian sumando en vez de restar. El esquema
 * daba bien y el numero daba mal.
 */
export async function cuadraElStock(): Promise<{
  ok: boolean;
  detalle: string;
}> {
  try {
    const filas = (await db.execute(sql`
      with por_movimientos as (
        select l.modelo_id, sum(l.cantidad - l.cantidad_antes) as q
          from movimiento_lineas l
          join movimientos m on m.id = l.movimiento_id
         where m.anulado_en is null
         group by 1),
      vivo as (
        select c.modelo_id, sum(c.cantidad) as q
          from bulto_contenido c
          join bultos b on b.id = c.bulto_id
         where b.estado in ('ubicado', 'sin_ubicar')
         group by 1)
      select count(*)::int as modelos,
             count(*) filter (
               where coalesce(p.q, 0) <> coalesce(v.q, 0)
             )::int as difieren
        from por_movimientos p
        full join vivo v on v.modelo_id = p.modelo_id
    `)) as unknown as Array<{ modelos: number; difieren: number }>;

    const { modelos, difieren } = filas[0];
    if (modelos === 0) return { ok: true, detalle: "todavía no hay movimientos" };
    if (difieren > 0) {
      return {
        ok: false,
        detalle: `${difieren} de ${modelos} modelos no cuadran: el historial y el stock vivo dicen cosas distintas`,
      };
    }
    return {
      ok: true,
      detalle: `${modelos} modelo${modelos === 1 ? "" : "s"}: sumar el historial da el stock vivo`,
    };
  } catch (e) {
    return { ok: false, detalle: e instanceof Error ? e.message : String(e) };
  }
}
