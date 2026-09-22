import "server-only";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { config } from "./db/schema";

export const CLAVE_MODO_PRUEBA = "modo_prueba";
export const CLAVE_SEMIVIDA = "confiabilidad_semivida_dias";

export async function leerConfig(clave: string): Promise<string | null> {
  const [fila] = await db
    .select({ valor: config.valor })
    .from(config)
    .where(eq(config.clave, clave))
    .limit(1);
  return fila?.valor ?? null;
}

export async function escribirConfig(clave: string, valor: string) {
  await db
    .insert(config)
    .values({ clave, valor })
    .onConflictDoUpdate({ target: config.clave, set: { valor } });
}

/**
 * Si la instalacion esta en etapa de prueba.
 *
 * Vale `"si"` o `"no"`, y el default cuando la fila no existe es **"no"**. Ese
 * default es deliberado y es lo mas importante de este archivo: si se
 * interpretara al reves, una base recien creada -o una a la que alguien le borro
 * la fila- vendria con el boton de borrar todo encendido. Lo peligroso tiene que
 * exigir un acto explicito para existir.
 */
export async function enModoPrueba(): Promise<boolean> {
  return (await leerConfig(CLAVE_MODO_PRUEBA)) === "si";
}

/** A los cuantos dias un chequeo vale la mitad. Ver DISENO.md §5.3. */
export async function semividaDias(): Promise<number> {
  const valor = Number(await leerConfig(CLAVE_SEMIVIDA));
  return Number.isFinite(valor) && valor > 0 ? valor : 30;
}
