/**
 * Prueba la base ANTES de escribir pantallas contra ella.
 *
 * Por que existe: en Control-Secaderos el pooler en modo transaccion colgaba
 * las consultas concurrentes con postgres-js, y se descubrio con la app ya
 * hecha, con las pantallas usando Promise.all en todos lados. El pooler de Neon
 * es tambien PgBouncer en modo transaccion, asi que la misma pregunta hay que
 * contestarla acá y de entrada, no asumirla.
 *
 * Que mide:
 *   1. Una consulta sola, que ademas paga el despertar del compute de Neon.
 *   2. Diez consultas EN PARALELO sobre el mismo cliente: el caso que rompia.
 *   3. Una transaccion con SELECT ... FOR UPDATE, que es como arranca todo
 *      movimiento de esta app.
 *
 * La rafaga es deliberadamente chica. Una prueba de carga contra una base de
 * produccion no mide: la tumba, y deja la planta sin app.
 *
 *   npm run probar-base
 */
import { config as cargarEnv } from "dotenv";
cargarEnv({ path: [".env.local", ".env"], quiet: true });

import postgres from "postgres";
import { normalizarUrl } from "../lib/db";

const EN_PARALELO = 10;

function medir(): () => number {
  const desde = Date.now();
  return () => Date.now() - desde;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL en .env.local");

  const host = new URL(url).host;
  if (!host.includes("-pooler")) {
    console.warn(
      "⚠ DATABASE_URL no apunta al endpoint pooled de Neon (el host no lleva\n" +
        "  '-pooler'). La app en Vercel abre una conexión por instancia, así que\n" +
        "  sin pooler el techo de instancias concurrentes es el límite de\n" +
        "  conexiones de la base.",
    );
  }
  console.log(`Base: ${host}\n`);

  // Misma URL normalizada y mismas opciones que lib/db/index.ts: probar otra
  // cosa no probaria nada.
  const sql = postgres(normalizarUrl(url), {
    prepare: false,
    max: 1,
    idle_timeout: 20,
    connect_timeout: 15,
  });

  let fallo = false;

  try {
    const t1 = medir();
    const [{ version }] = await sql<{ version: string }[]>`
      select version() as version
    `;
    const ms1 = t1();
    console.log(`✓ 1 consulta: ${ms1} ms`);
    console.log(`  ${version.split(" ").slice(0, 2).join(" ")}`);
    if (ms1 > 3000) {
      console.log(
        "  (lento: es el compute de Neon despertando de la suspensión. El\n" +
          "   primer movimiento de la mañana lo va a pagar igual.)",
      );
    }

    /**
     * El caso que importa. Si el pooler no tolerara el pipelining de
     * postgres-js, esto se cuelga hasta el statement timeout en vez de fallar
     * rapido: por eso el timeout propio, para que la prueba termine y diga que
     * paso en lugar de quedarse esperando.
     */
    const t2 = medir();
    const enParalelo = Promise.all(
      Array.from(
        { length: EN_PARALELO },
        (_, i) => sql`select ${i}::int as n, pg_sleep(0.05)`,
      ),
    );
    const vencido = new Promise((_, rechazar) =>
      setTimeout(
        () => rechazar(new Error("se colgó: más de 20 s para 10 consultas")),
        20_000,
      ),
    );
    const filas = (await Promise.race([enParalelo, vencido])) as Array<
      Array<{ n: number }>
    >;
    const ms2 = t2();

    const ok = filas.length === EN_PARALELO && filas.every((f, i) => f[0].n === i);
    if (!ok) throw new Error("las respuestas no coinciden con las consultas");
    console.log(`\n✓ ${EN_PARALELO} consultas en paralelo: ${ms2} ms`);
    console.log(
      `  Cada una duerme 50 ms. ${ms2 < EN_PARALELO * 50 ? "Se pipelinearon" : "Se serializaron"}.`,
    );

    const t3 = medir();
    await sql.begin(async (tx) => {
      await tx`create table if not exists _prueba_bloqueo (id int primary key)`;
      await tx`insert into _prueba_bloqueo (id) values (1) on conflict do nothing`;
      await tx`select * from _prueba_bloqueo where id = 1 for update`;
    });
    await sql`drop table if exists _prueba_bloqueo`;
    console.log(`\n✓ transacción con SELECT ... FOR UPDATE: ${t3()} ms`);

    console.log(
      "\nTodo bien: postgres-js sobre el pooler de Neon aguanta consultas\n" +
        "concurrentes y transacciones con bloqueo. Se puede seguir.",
    );
  } catch (e) {
    fallo = true;
    console.error("\n✗ FALLÓ:", e instanceof Error ? e.message : e);
    console.error(
      "\nSi lo que falló es el paralelo, el pooler de transacción no tolera el\n" +
        "pipelining de postgres-js. La salida es drizzle-orm/neon-serverless por\n" +
        "WebSocket, que soporta transacciones reales. Está anotado en\n" +
        "lib/db/index.ts.",
    );
  } finally {
    await sql.end();
  }

  process.exit(fallo ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
