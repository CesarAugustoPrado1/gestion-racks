import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../../lib/db/schema";
import { normalizarUrl } from "../../lib/db";
import { codigoDePosicion, posicionesDe } from "../../lib/posiciones";

/**
 * Una base descartable para los tests que tocan la base de verdad.
 *
 * POR QUE UNA BASE DE VERDAD Y NO UN MOCK. Lo que estos tests cuidan es la
 * invariante del stock -sumar el historial da el stock vivo-, y esa invariante
 * vive en las escrituras: en que `aplicarMovimiento` escriba antes y despues en
 * la misma transaccion que toca el contenido. Un mock del cliente probaria que
 * el codigo llama a las funciones que el mock espera, que es probar el mock.
 *
 * POR QUE UNA BASE APARTE Y NO LA DE DESARROLLO. Porque se borra entera al
 * empezar. Se llama `<base>_test` y se crea desde cero cada corrida: un test que
 * depende de lo que dejo el anterior falla el martes por algo que paso el lunes.
 *
 * Si no hay base a mano, los tests que la necesitan SE SALTEAN en vez de fallar.
 * Un fallo rojo por no tener Postgres instalado ensenia a ignorar el rojo, que
 * es lo peor que le puede pasar a una suite.
 */

/**
 * La raiz del proyecto. `process.cwd()` y no una ruta relativa al archivo,
 * porque tsx transpila a CJS y `import.meta.dirname` no existe ahi. Los tests
 * se corren siempre desde la raiz, con `npm test`.
 */
const RAIZ = process.cwd();

export function urlDeTest(): string | null {
  const base = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!base) return null;
  try {
    const u = new URL(normalizarUrl(base));
    // Neon y cualquier base remota quedan afuera a proposito: esto DROPEA.
    if (!["localhost", "127.0.0.1", "::1"].includes(u.hostname)) return null;
    if (!process.env.TEST_DATABASE_URL) u.pathname = `${u.pathname}_test`;
    return u.toString();
  } catch {
    return null;
  }
}

/** Las migraciones, en orden, como las aplicaria drizzle. */
function migraciones(): string[] {
  return readdirSync(join(RAIZ, "drizzle"))
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(RAIZ, "drizzle", f), "utf8"));
}

export async function baseDeTest() {
  const url = urlDeTest();
  if (!url) throw new Error("sin base");

  const u = new URL(url);
  const nombre = u.pathname.slice(1);
  const admin = postgres(
    Object.assign(new URL(url), { pathname: "/postgres" }).toString(),
    { prepare: false, max: 1, onnotice: () => {} },
  );
  await admin.unsafe(`drop database if exists "${nombre}" with (force)`);
  await admin.unsafe(`create database "${nombre}"`);
  await admin.end();

  const cliente = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
  for (const sql of migraciones()) {
    await cliente.unsafe(sql.replaceAll("--> statement-breakpoint", ""));
  }

  return {
    db: drizzle(cliente, { schema }),
    cerrar: () => cliente.end(),
  };
}

/**
 * Una planta minima pero REAL: dos lineas con unidades distintas, modelos con
 * norma y altura, y los dos tipos de rack.
 *
 * Las alturas estan elegidas para que el caso del palet alto exista sin
 * trucarlo: el optimizado de Laja mide 205 y el nivel 2 del penetrable admite
 * 190. Es el mismo caso que pasa en el galpon.
 */
export async function sembrar(db: Awaited<ReturnType<typeof baseDeTest>>["db"]) {
  const [linea] = await db
    .insert(schema.lineas)
    .values({
      codigo: "piedras",
      nombre: "Piedras",
      unidadSingular: "paquete",
      unidadPlural: "paquetes",
    })
    .returning();

  const [laja] = await db
    .insert(schema.modelos)
    .values({ lineaId: linea.id, nombre: "Laja" })
    .returning();
  const [patagonica] = await db
    .insert(schema.modelos)
    .values({ lineaId: linea.id, nombre: "Patagónica" })
    .returning();

  await db.insert(schema.normas).values([
    { modeloId: laja.id, packaging: "palet", cantidad: 48, alturaCm: 145 },
    { modeloId: laja.id, packaging: "optimizado", cantidad: 60, alturaCm: 205 },
    { modeloId: patagonica.id, packaging: "palet", cantidad: 40, alturaCm: 140 },
  ]);

  const [usuario] = await db
    .insert(schema.usuarios)
    .values({ usuario: "test", nombre: "Operario de prueba", pinHash: "x", rol: "admin" })
    .returning();

  const [motivo] = await db
    .insert(schema.motivos)
    .values({ nombre: "Entrega a cliente", ambito: "salida", esEgreso: true })
    .returning();

  // Penetrable: 1 calle, 3 niveles, 2 de profundidad. 190 cm en el nivel 2.
  const [pen] = await db
    .insert(schema.grupos)
    .values({
      codigo: "P",
      accesibilidad: "penetrable",
      niveles: 3,
      profundidad: 2,
      unidades: 1,
    })
    .returning();
  await db.insert(schema.nivelesDeGrupo).values([
    { grupoId: pen.id, nivel: 1, alturaMaxCm: 210 },
    { grupoId: pen.id, nivel: 2, alturaMaxCm: 190 },
    { grupoId: pen.id, nivel: 3, alturaMaxCm: 230 },
  ]);

  // Selectivo: 1 modulo de 2 columnas, 3 niveles. Nunca admite invasion.
  const [sel] = await db
    .insert(schema.grupos)
    .values({ codigo: "S", accesibilidad: "selectivo", ancho: 2, niveles: 3, unidades: 1 })
    .returning();
  await db.insert(schema.nivelesDeGrupo).values([
    { grupoId: sel.id, nivel: 1, alturaMaxCm: 200 },
    { grupoId: sel.id, nivel: 2, alturaMaxCm: 200 },
    { grupoId: sel.id, nivel: 3, alturaMaxCm: 200 },
  ]);

  const posiciones: Array<{ codigo: string; id: number }> = [];
  for (const [grupo, geo] of [
    [pen, { tipo: "penetrable" as const, ancho: null, niveles: 3, profundidad: 2, unidades: 1 }],
    [sel, { tipo: "selectivo" as const, ancho: 2, niveles: 3, profundidad: null, unidades: 1 }],
  ] as const) {
    for (const c of posicionesDe(geo)) {
      const codigo = codigoDePosicion(c);
      const [p] = await db
        .insert(schema.posiciones)
        .values({
          grupoId: grupo.id,
          codigo,
          unidad: c.unidad,
          columna: c.columna,
          nivel: c.nivel,
          profundidad: c.profundidad,
        })
        .returning();
      posiciones.push({ codigo: `${grupo.codigo}-${codigo}`, id: p.id });
    }
  }

  const pos = (codigo: string) => {
    const p = posiciones.find((x) => x.codigo === codigo);
    if (!p) throw new Error(`no existe la posición ${codigo} en el sembrado`);
    return p.id;
  };

  return { linea, laja, patagonica, usuario, motivo, pen, sel, pos };
}
