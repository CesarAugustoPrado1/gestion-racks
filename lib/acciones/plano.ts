"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "../db";
import { autorizar } from "../auth";
import { guardarVersion } from "../plano-db";
import { ejecutar, type Resultado } from "./comun";

const esquema = z.object({
  plano: z.unknown(),
  /** La versión sobre la que se editó. `null` si el plano estaba vacío. */
  base: z.number().int().positive().nullable(),
});

/** Guarda el plano como una versión nueva. Solo admin. */
export async function guardarPlano(
  entrada: z.input<typeof esquema>,
): Promise<Resultado<{ version: number }>> {
  return ejecutar(async () => {
    const sesion = await autorizar("admin");
    const d = esquema.parse(entrada);
    const version = await db.transaction((tx) =>
      guardarVersion(tx, d.plano, d.base, sesion.uid),
    );
    revalidatePath("/planta");
    return { version };
  });
}
