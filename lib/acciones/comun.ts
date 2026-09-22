import "server-only";
import { z } from "zod";

/** Resultado uniforme de toda server action, para poder mostrarlo en la UI. */
export type Resultado<T = void> =
  | { ok: true; datos: T }
  | { ok: false; error: string };

function error(mensaje: string): { ok: false; error: string } {
  return { ok: false, error: mensaje };
}

/**
 * Error de negocio esperable: la posicion ya esta ocupada, el bulto lo movio
 * otro, la cantidad no cierra. Se lanza dentro de la transaccion para abortarla
 * y se traduce a un mensaje legible; cualquier otra excepcion es un bug y se
 * reporta como tal.
 */
export class ErrorDeNegocio extends Error {}

export async function ejecutar<T>(fn: () => Promise<T>): Promise<Resultado<T>> {
  try {
    return { ok: true, datos: await fn() };
  } catch (e) {
    if (e instanceof ErrorDeNegocio) return error(e.message);
    if (e instanceof z.ZodError) {
      return error(e.issues[0]?.message ?? "Datos inválidos.");
    }
    console.error("[accion]", e);
    return error("No se pudo guardar. Revisá la conexión y volvé a intentar.");
  }
}

export function fallar(mensaje: string): never {
  throw new ErrorDeNegocio(mensaje);
}
