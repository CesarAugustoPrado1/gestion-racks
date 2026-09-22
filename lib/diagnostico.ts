import "server-only";
import { sql } from "drizzle-orm";
import { db } from "./db";

/**
 * Las mismas tres mediciones que scripts/probar-base.ts, pero corriendo DENTRO
 * de la app.
 *
 * Por que existiendo el script: el script se corre desde una notebook, y lo que
 * importa no es como se porta el pooler desde una notebook. Importa como se
 * porta desde una instancia de Vercel en la misma region que la base, con el
 * cliente de lib/db/index.ts y sus opciones reales. Eso es lo que esto mide.
 *
 * Ademas queda como herramienta permanente: el dia que desde la planta digan
 * "la app esta lenta", esta pantalla separa "la base tarda" de "la red del
 * galpon anda mal", que son dos problemas de dos personas distintas.
 */

export type Medicion = {
  nombre: string;
  ms: number;
  ok: boolean;
  detalle: string;
};

export type Diagnostico = {
  host: string;
  mediciones: Medicion[];
  /** Si algo fallo, el texto que dice que hacer. */
  problema: string | null;
};

const EN_PARALELO = 10;
const MS_DORMIDO = 50;

/** Solo el host: la connection string lleva la password y no se muestra nunca. */
function hostDeLaBase(): string {
  const url = process.env.DATABASE_URL;
  if (!url) return "sin configurar";
  try {
    return new URL(url).host;
  } catch {
    return "ilegible";
  }
}

async function medir(
  nombre: string,
  fn: () => Promise<string>,
): Promise<Medicion> {
  const desde = performance.now();
  try {
    const detalle = await fn();
    return { nombre, ms: Math.round(performance.now() - desde), ok: true, detalle };
  } catch (e) {
    return {
      nombre,
      ms: Math.round(performance.now() - desde),
      ok: false,
      detalle: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function correrDiagnostico(): Promise<Diagnostico> {
  const mediciones: Medicion[] = [];

  mediciones.push(
    await medir("Una consulta", async () => {
      const filas = (await db.execute(
        sql`select version() as version`,
      )) as unknown as Array<{ version: string }>;
      return filas[0].version.split(" ").slice(0, 2).join(" ");
    }),
  );

  /**
   * El caso que importa, y el que rompia en Control-Secaderos: varias consultas
   * lanzadas juntas sobre la misma conexion. postgres-js las pipelinea, y un
   * pooler en modo transaccion que no lo tolere las cuelga en vez de fallar.
   *
   * Cada una duerme 50 ms. Si se pipelinearon, el total se parece a 50 ms; si
   * se serializaron, se parece a 500. Esa comparacion es toda la prueba.
   */
  mediciones.push(
    await medir(`${EN_PARALELO} consultas en paralelo`, async () => {
      const filas = await Promise.all(
        Array.from(
          { length: EN_PARALELO },
          (_, i) =>
            db.execute(
              sql`select ${i}::int as n, pg_sleep(${MS_DORMIDO / 1000})`,
            ) as unknown as Promise<Array<{ n: number }>>,
        ),
      );
      if (filas.length !== EN_PARALELO) {
        throw new Error("volvieron menos respuestas que consultas");
      }
      return "cada una duerme 50 ms";
    }),
  );

  mediciones.push(
    await medir("Transacción con bloqueo", async () => {
      await db.transaction(async (tx) => {
        await tx.execute(sql`select id from usuarios order by id limit 1 for update`);
      });
      return "SELECT … FOR UPDATE, como arranca todo movimiento";
    }),
  );

  const paralelo = mediciones[1];
  const seSerializaron =
    paralelo.ok && paralelo.ms > EN_PARALELO * MS_DORMIDO * 0.8;

  let problema: string | null = null;
  if (mediciones.some((m) => !m.ok)) {
    problema =
      "Algo falló. Si lo que falló son las consultas en paralelo, el pooler de " +
      "Neon no tolera el pipelining de postgres-js y hay que pasar a " +
      "drizzle-orm/neon-serverless por WebSocket. Está anotado en lib/db/index.ts.";
  } else if (seSerializaron) {
    problema =
      "Las consultas se serializaron en vez de pipelinearse: funciona, pero " +
      "cada pantalla que use Promise.all va a tardar la suma y no el máximo. " +
      "Conviene revisarlo antes de construir las pantallas de lectura.";
  }

  return { host: hostDeLaBase(), mediciones, problema };
}
