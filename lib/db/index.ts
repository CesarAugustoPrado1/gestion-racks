import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;

/**
 * En desarrollo el hot reload vuelve a evaluar el modulo, asi que ademas del
 * cache de modulo guardamos el cliente en globalThis para no ir dejando
 * conexiones colgadas en cada recarga.
 */
const global_ = globalThis as unknown as {
  pgClient?: ReturnType<typeof postgres>;
  drizzleDb?: Db;
};

/**
 * Cache de modulo: es lo que evita abrir una conexion nueva por cada query.
 * Sin esto cada acceso a `db` levantaria un TCP+TLS contra Neon y lo dejaria
 * abierto hasta agotar el pooler.
 */
let cache: Db | undefined;

/**
 * Parametros que Neon pone en la connection string y postgres-js no puede
 * honrar. Hay que sacarlos, no ignorarlos.
 *
 * El caso concreto es `channel_binding=require`, que el dashboard de Neon
 * incluye en la URL que te da para copiar. postgres-js mete todo parametro que
 * no reconoce en el paquete de arranque de la conexion, y Postgres rechaza la
 * conexion entera con:
 *
 *   unrecognized configuration parameter "channel_binding"
 *
 * Verificado contra PostgreSQL 16: con el parametro la conexion falla, sin el
 * anda. No es un warning ni una consulta lenta: es la app entera caida, con un
 * mensaje que no menciona ni a Neon ni a la URL.
 *
 * Por que sacarlo y no pedirle a la persona que lo borre: esta URL se copia y
 * pega a mano en el panel de Vercel, donde nadie va a leer un README. El unico
 * lugar que se ejecuta siempre es este.
 *
 * Sobre la seguridad: el channel binding de SCRAM protege contra un
 * man-in-the-middle que tenga un certificado valido. postgres-js no lo
 * implementa, asi que el parametro no agrega proteccion ni sacandolo ni
 * dejandolo; lo unico que hace es romper. La conexion sigue yendo por TLS por
 * `sslmode=require`.
 */
const NO_SOPORTADOS = ["channel_binding"];

export function normalizarUrl(url: string): string {
  try {
    const u = new URL(url);
    const sacados = NO_SOPORTADOS.filter((p) => u.searchParams.has(p));
    if (sacados.length === 0) return url;
    sacados.forEach((p) => u.searchParams.delete(p));
    console.warn(
      `[db] Se ignoran parámetros que el driver no soporta: ${sacados.join(", ")}. ` +
        "Con ellos el servidor rechaza la conexión. Ver lib/db/index.ts.",
    );
    return u.toString();
  } catch {
    // Si no parsea como URL, que falle postgres-js con su propio mensaje.
    return url;
  }
}

function conectar(): Db {
  if (cache) return cache;
  if (global_.drizzleDb) return (cache = global_.drizzleDb);

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "Falta la variable DATABASE_URL. En local: copiá .env.example a .env.local " +
        "y completala. En Vercel: cargala en Settings > Environment Variables " +
        "(marcando Production) y volvé a desplegar, porque las variables nuevas " +
        "no se aplican al deploy que ya estaba hecho.",
    );
  }

  const client =
    global_.pgClient ??
    postgres(normalizarUrl(connectionString), {
      /**
       * OBLIGATORIO, y es la linea que mas cuidado pide de todo el archivo.
       *
       * El endpoint pooled de Neon (el host con "-pooler") es PgBouncer en modo
       * TRANSACCION. En Control-Secaderos ese mismo modo, sobre Supavisor,
       * colgaba las consultas: postgres-js hace pipelining -manda varias por la
       * misma conexion sin esperar la respuesta anterior- y el pooler de
       * transaccion no lo tolera. Se reprodujo con solo dos concurrentes, y como
       * las pantallas usan Promise.all en todos lados no era evitable desde el
       * codigo.
       *
       * Con `prepare: false` no se usan prepared statements con nombre, que es
       * lo que PgBouncer no puede sostener entre transacciones, y el pipelining
       * deja de ser un problema. Esto esta MEDIDO contra esta base, no asumido:
       * `npm run probar-base` corre consultas en paralelo y falla si no pasan.
       * Si alguna vez vuelve a colgarse, la salida es drizzle-orm/neon-serverless
       * por WebSocket, que soporta transacciones reales (las necesitamos: todo
       * movimiento arranca con un SELECT ... FOR UPDATE).
       */
      prepare: false,
      /**
       * Con pipelining andando una conexion alcanza y sobra para este volumen,
       * y ademas cada instancia de Vercel abre la suya: subir esto multiplica
       * conexiones por instancia, no por usuario.
       */
      max: 1,
      // Devuelve el cupo rapido entre picos.
      idle_timeout: 20,
      /**
       * Que un pooler caido falle rapido en vez de colgar la pantalla.
       *
       * Ojo con bajarlo de aca: Neon suspende la base por inactividad, y el
       * primer movimiento de la mañana paga el arranque del compute. Con 15s
       * hay margen de sobra para ese despertar.
       */
      connect_timeout: 15,
    });

  cache = drizzle(client, { schema });

  if (process.env.NODE_ENV !== "production") {
    global_.pgClient = client;
    global_.drizzleDb = cache;
  }
  return cache;
}

/**
 * La conexion se abre en el primer uso, no al importar el modulo: asi
 * `next build` puede recorrer las rutas sin necesitar la base configurada.
 */
export const db = new Proxy({} as Db, {
  get: (_, prop: keyof Db) => conectar()[prop],
});

export { schema };
