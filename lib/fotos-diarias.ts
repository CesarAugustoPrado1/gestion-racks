import "server-only";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { fotoEn, type Foto } from "./foto";
import { bultosConChequeo } from "./consultas";
import { semividaDias } from "./configuracion";
import { confianza, indice } from "./confiabilidad";
import { diaDe, inicioDelDia, sumarDias } from "./periodos";

/**
 * La FOTO DIARIA del stock: la foto del cierre de cada día, guardada.
 *
 * La toma un proceso programado apenas pasada la medianoche
 * (app/api/cron/foto-diaria). Guarda la foto entera -la misma que muestra el
 * Resumen- más lo que el historial no puede reconstruir después:
 *
 * - la confiabilidad de esa noche;
 * - la ocupación con los racks, el alcance y las exclusiones de ese día;
 * - los m² con los m² por unidad que tenía cada modelo ese día.
 *
 * Y queda como REGISTRO: si mañana se anula o corrige un movimiento de ayer, la
 * foto de ayer sigue diciendo lo que se informó. No se modifica ni se borra
 * (trigger en la base, migración 0013).
 *
 * Si una noche el proceso no corre, la próxima vez que corre rellena los días
 * que faltan con la foto reconstruida del historial, marcada como tal
 * (`origen = 'reconstruida'`, sin confiabilidad): el stock es exacto igual, lo
 * que falta es lo que no tiene historia.
 */

/** Sube cuando cambia la forma de `datos`, para poder leer las viejas. */
export const VERSION_FOTO = 1;

/** Cuánto después de la medianoche una foto todavía cuenta como "al cierre". */
const VENTANA_AL_CIERRE_MS = 3 * 3_600_000;

/** Cuántos días para atrás se rellenan huecos, como mucho, en una corrida. */
const MAXIMO_RELLENO = 62;

export type FotoGuardada = {
  dia: string;
  tomadaEn: Date;
  origen: "al_cierre" | "reconstruida";
  foto: Foto;
  /** Solo en las tomadas al cierre. */
  confiabilidad: { valor: number | null; medidos: number; sinDatos: number } | null;
};

type Datos = Omit<Foto, "instante"> & {
  instante: string;
  confiabilidad: FotoGuardada["confiabilidad"];
};

export async function fotoGuardada(dia: string): Promise<FotoGuardada | null> {
  const [f] = (await db.execute(sql`
    select dia::text as dia, tomada_en, origen, datos from fotos_diarias where dia = ${dia}
  `)) as unknown as Array<{ dia: string; tomada_en: Date | string; origen: FotoGuardada["origen"]; datos: Datos }>;
  if (!f) return null;
  const { confiabilidad, instante, ...resto } = f.datos;
  return {
    dia: f.dia,
    tomadaEn: new Date(f.tomada_en),
    origen: f.origen,
    foto: { ...resto, instante: new Date(instante) },
    confiabilidad,
  };
}

/**
 * Toma y guarda la foto del cierre de `dia`. Si ya existe, no hace nada: una
 * foto guardada no se reemplaza nunca.
 */
export async function tomarFoto(dia: string, ahora: Date): Promise<"guardada" | "ya_estaba" | "dia_abierto"> {
  const instante = inicioDelDia(sumarDias(dia, 1));
  if (instante.getTime() > ahora.getTime()) return "dia_abierto";

  const [ya] = (await db.execute(sql`select 1 as x from fotos_diarias where dia = ${dia}`)) as unknown as Array<unknown>;
  if (ya) return "ya_estaba";

  const alCierre = ahora.getTime() - instante.getTime() <= VENTANA_AL_CIERRE_MS;
  const foto = await fotoEn(instante, alCierre);

  let confiabilidad: FotoGuardada["confiabilidad"] = null;
  if (alCierre) {
    const [bultos, semivida] = await Promise.all([bultosConChequeo(), semividaDias()]);
    confiabilidad = indice(bultos.map((b) => confianza(b, semivida, instante)));
  }

  const datos: Datos = { ...foto, instante: instante.toISOString(), confiabilidad };
  const insertadas = (await db.execute(sql`
    insert into fotos_diarias (dia, origen, version, datos)
    values (${dia}, ${alCierre ? "al_cierre" : "reconstruida"}, ${VERSION_FOTO}, ${JSON.stringify(datos)}::jsonb)
    on conflict (dia) do nothing
    returning id
  `)) as unknown as Array<{ id: number }>;
  return insertadas.length > 0 ? "guardada" : "ya_estaba";
}

/**
 * Lo que corre cada noche: la foto de ayer y, si faltan días desde la primera
 * foto guardada (noches en que no corrió), esos días reconstruidos.
 */
export async function ponerAlDia(ahora: Date = new Date()): Promise<Array<{ dia: string; resultado: string }>> {
  const ayer = sumarDias(diaDe(ahora), -1);
  const salida = [{ dia: ayer, resultado: await tomarFoto(ayer, ahora) }];

  const [primera] = (await db.execute(sql`
    select min(dia)::text as dia from fotos_diarias
  `)) as unknown as Array<{ dia: string | null }>;
  if (!primera?.dia) return salida;

  const desde = primera.dia > sumarDias(ayer, -MAXIMO_RELLENO) ? primera.dia : sumarDias(ayer, -MAXIMO_RELLENO);
  const faltan = (await db.execute(sql`
    select d::date::text as dia
      from generate_series(${desde}::date, ${sumarDias(ayer, -1)}::date, interval '1 day') d
     where not exists (select 1 from fotos_diarias f where f.dia = d::date)
     order by 1
  `)) as unknown as Array<{ dia: string }>;
  for (const f of faltan) salida.push({ dia: f.dia, resultado: await tomarFoto(f.dia, ahora) });
  return salida;
}

/** Para mostrar desde cuándo hay fotos y cuál fue la última. */
export async function estadoDeFotos(): Promise<{ primera: string | null; ultima: string | null; cantidad: number; ultimaOrigen: string | null }> {
  const [f] = (await db.execute(sql`
    select min(dia)::text as primera, max(dia)::text as ultima, count(*)::int as cantidad,
           (select origen from fotos_diarias order by dia desc limit 1) as ultima_origen
      from fotos_diarias
  `)) as unknown as Array<{ primera: string | null; ultima: string | null; cantidad: number; ultima_origen: string | null }>;
  return { primera: f?.primera ?? null, ultima: f?.ultima ?? null, cantidad: f?.cantidad ?? 0, ultimaOrigen: f?.ultima_origen ?? null };
}
