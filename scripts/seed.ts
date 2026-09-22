/**
 * Datos iniciales. Es IDEMPOTENTE y no pisa lo que ya existe: volver a correrlo
 * no arregla filas viejas.
 *
 * Eso ultimo importa mas de lo que parece, y viene de haberlo sufrido en
 * Control-Secaderos: despues de una migracion que agrega una columna, las filas
 * que ya estaban quedan con el default, y el seed NO las corrige. El backfill
 * es un paso aparte y explicito.
 *
 *   npm run db:seed                  admin + parametros
 *   npm run db:seed -- --con-ejemplos  ademas, un usuario por puesto para probar
 */
import { config as cargarEnv } from "dotenv";
cargarEnv({ path: [".env.local", ".env"], quiet: true });

import { eq } from "drizzle-orm";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import bcrypt from "bcryptjs";
import { normalizarUrl } from "../lib/db";
import * as schema from "../lib/db/schema";
import { config, usuarios, type Rol } from "../lib/db/schema";

const conExamples = process.argv.includes("--con-ejemplos");

/**
 * El modo prueba NO se enciende solo.
 *
 * Mientras esta encendido, el admin puede borrar toda la instalacion desde una
 * pantalla. Que eso exija un flag explicito al sembrar -y no venga de fabrica-
 * es lo que evita que una base productiva nazca con el boton puesto.
 */
const conModoPrueba = process.argv.includes("--modo-prueba");

/**
 * Parametros con los que arranca el sistema.
 *
 * `confiabilidad_semivida_dias`: a los cuantos dias un chequeo vale la mitad.
 * Con 30, chequeado ayer da ~0.98, hace un mes 0.50 y hace dos meses 0.25.
 * Es el numero que define los colores que ve todo el mundo, asi que se cambia
 * desde el panel y no desplegando. Ver DISENO.md §5.3.
 */
const PARAMETROS: Array<{ clave: string; valor: string }> = [
  { clave: "confiabilidad_semivida_dias", valor: "30" },
];

const EJEMPLOS: Array<{ usuario: string; nombre: string; rol: Rol }> = [
  { usuario: "auto1", nombre: "Operario de autoelevador", rol: "autoelevador" },
  { usuario: "control1", nombre: "Operario de control", rol: "control" },
  { usuario: "comercial1", nombre: "Comercial", rol: "comercial" },
];

async function main() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL (o DIRECT_URL) en .env.local");

  const cliente = postgres(normalizarUrl(url), { prepare: false, max: 1 });
  const db = drizzle(cliente, { schema });

  const pinAdmin = process.env.ADMIN_PIN;
  if (!pinAdmin || !/^\d{4,8}$/.test(pinAdmin)) {
    throw new Error("ADMIN_PIN tiene que ser de 4 a 8 dígitos.");
  }

  const [existente] = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(eq(usuarios.usuario, "admin"))
    .limit(1);

  if (existente) {
    console.log("• admin ya existe, no se toca");
  } else {
    await db.insert(usuarios).values({
      usuario: "admin",
      nombre: "Administrador",
      pinHash: await bcrypt.hash(pinAdmin, 10),
      rol: "admin",
    });
    console.log("✓ admin creado (PIN: el de ADMIN_PIN)");
  }

  if (conModoPrueba) {
    await db
      .insert(config)
      .values({ clave: "modo_prueba", valor: "si" })
      .onConflictDoUpdate({ target: config.clave, set: { valor: "si" } });
    console.log("✓ modo prueba ENCENDIDO: el borrado masivo está habilitado");
  }

  for (const p of PARAMETROS) {
    // onConflictDoNothing y no DoUpdate: si alguien cambio la semivida desde el
    // panel, el seed no se la puede llevar puesta.
    await db.insert(config).values(p).onConflictDoNothing();
  }
  console.log(`✓ ${PARAMETROS.length} parámetro(s) verificado(s)`);

  if (conExamples) {
    for (const e of EJEMPLOS) {
      const [ya] = await db
        .select({ id: usuarios.id })
        .from(usuarios)
        .where(eq(usuarios.usuario, e.usuario))
        .limit(1);
      if (ya) {
        console.log(`• ${e.usuario} ya existe, no se toca`);
        continue;
      }
      await db.insert(usuarios).values({
        ...e,
        pinHash: await bcrypt.hash(pinAdmin, 10),
      });
      console.log(`✓ ${e.usuario} (${e.rol}) creado con el mismo PIN`);
    }
  }

  await cliente.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
