import "server-only";
import { sql } from "drizzle-orm";
import { db, MAX_CONEXIONES } from "./db";

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

/**
 * Cuantas consultas lanza junta la pantalla mas pesada. Es lo que hay que medir.
 *
 * Numero fijo, no el tamaño del pool: si se midiera con el pool, con `max: 1` la
 * prueba lanzaria una sola consulta y daria bien siempre, que es medir para no
 * enterarse. La pregunta no es si el pool se sirve a si mismo, es si la app
 * consigue la concurrencia que pide.
 *
 * Y la version anterior lanzaba 10 con el pool en 1 y despues se quejaba de que
 * habian tardado 500 ms. Tenian que tardar 500: un backend de Postgres ejecuta
 * una sentencia por vez, asi que diez esperas de 50 ms sobre una sola conexion
 * son medio segundo por definicion, con pipelining y sin el. La medicion estaba
 * mal, no la base, y la pantalla venia avisando de un problema inexistente.
 */
const EN_PARALELO = 5;
const MS_DORMIDO = 50;

/** En cuantas tandas entran, con el pool que hay. */
const TANDAS = Math.ceil(EN_PARALELO / MAX_CONEXIONES);

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
   * Abrir el pool ANTES de medir el reparto, y fuera del cronometro.
   *
   * Sin esto la medicion incluye levantar las cinco conexiones, y cada una
   * cuesta varios viajes de ida y vuelta hasta Neon. Contra la base local no se
   * notaba; con 20 ms de latencia simulada daba 181 ms y la pantalla acusaba de
   * encolarse a un pool que estaba naciendo. El arranque es un costo real -la
   * primera pantalla de la mañana lo paga- pero es costo de conexion y no de
   * reparto, y mezclarlos hace que la medicion no sirva para lo unico que tiene
   * que decidir.
   */
  await Promise.all(
    Array.from({ length: EN_PARALELO }, () => db.execute(sql`select 1`)),
  ).catch(() => {
    // Si falla, la medicion de abajo lo va a reportar con su mensaje.
  });

  /**
   * Lo que de verdad importa: si una pantalla que lanza varias consultas juntas
   * paga el maximo o la suma.
   *
   * Cada una duerme 50 ms y van tantas como conexiones tiene el pool. Si el
   * pool las reparte, el total se parece a 50 ms; si se encolan sobre una sola
   * conexion, se parece a 50 x N. Esa comparacion es toda la prueba.
   *
   * Tambien es el caso que rompia en Control-Secaderos: un pooler en modo
   * transaccion que no tolera el pipelining de postgres-js cuelga en vez de
   * fallar, y eso se ve aca como un timeout, no como lentitud.
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
      return `cada una duerme ${MS_DORMIDO} ms y el pool tiene ${MAX_CONEXIONES === 1 ? "1 conexión" : `${MAX_CONEXIONES} conexiones`}: entran en ${TANDAS === 1 ? "una sola tanda" : `${TANDAS} tandas`}`;
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

  /**
   * Dos preguntas distintas, y conviene no mezclarlas.
   *
   * La primera es del pool y se contesta sin medir nada: si tiene menos
   * conexiones que consultas lanza una pantalla, sobran tandas y se paga de
   * mas. Es configuracion nuestra.
   *
   * La segunda es de la base: dadas las conexiones que hay, ¿las atendio a la
   * vez? Si tardo bastante mas que las tandas que le tocaban, algo las esta
   * serializando del otro lado. Eso no se arregla con `max`.
   *
   * Lo que se espera sale de la medicion de arriba, no de una constante: cada
   * tanda cuesta lo que duerme MAS un viaje hasta la base, y cuanto cuesta un
   * viaje lo dice la consulta sola que ya se midio. Sin eso el calculo ignora la
   * red: contra la base local daba parecido, y con 20 ms de latencia simulada
   * predecia 250 ms donde medir daba 492, y la pantalla acusaba de serializar a
   * una base que estaba haciendo exactamente lo que le tocaba.
   */
  const unViaje = mediciones[0].ok ? mediciones[0].ms : 0;
  const esperado = TANDAS * (unViaje + MS_DORMIDO);

  const poolCorto = MAX_CONEXIONES < EN_PARALELO;
  const peorQueLasTandas = paralelo.ok && paralelo.ms > esperado * 1.8 + 50;

  let problema: string | null = null;
  if (mediciones.some((m) => !m.ok)) {
    problema =
      "Algo falló. Si lo que falló son las consultas en paralelo, el pooler de " +
      "Neon no tolera el pipelining de postgres-js y hay que pasar a " +
      "drizzle-orm/neon-serverless por WebSocket. Está anotado en lib/db/index.ts.";
  } else if (peorQueLasTandas) {
    problema =
      `Las ${EN_PARALELO} consultas tardaron ${paralelo.ms} ms, bastante más que ` +
      `los ~${esperado} ms que les tocaban: ${TANDAS === 1 ? "una tanda" : `${TANDAS} tandas`} ` +
      `de ${MS_DORMIDO} ms más ${unViaje} ms de viaje cada una. ` +
      "Algo las está serializando del otro lado, y subir `max` no lo va a " +
      "arreglar. Es el caso que rompió en Control-Secaderos: la salida es " +
      "drizzle-orm/neon-serverless por WebSocket, anotada en lib/db/index.ts.";
  } else if (poolCorto) {
    problema =
      `El pool tiene ${MAX_CONEXIONES} conexion${MAX_CONEXIONES === 1 ? "" : "es"} y ` +
      `una pantalla puede lanzar ${EN_PARALELO} consultas juntas, así que van en ` +
      `${TANDAS} tandas y se paga de más. La base responde bien; lo que conviene ` +
      "revisar es `max` en lib/db/index.ts.";
  }

  return { host: hostDeLaBase(), mediciones, problema };
}
