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
    postgres(connectionString, {
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
