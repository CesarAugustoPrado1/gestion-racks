import { config as cargarEnv } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Next lee .env.local automaticamente, pero drizzle-kit corre fuera de Next:
// hay que cargarlo a mano, con .env como respaldo.
cargarEnv({ path: [".env.local", ".env"], quiet: true });

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    /**
     * Las migraciones van por la conexion DIRECTA de Neon (el host sin
     * "-pooler"): un DDL no gana nada pasando por PgBouncer y algunos comandos
     * se comportan distinto en modo transaccion.
     */
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL!,
  },
});
