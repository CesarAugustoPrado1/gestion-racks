"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "../db";
import { autorizar } from "../auth";
import { ejecutar, fallar, type Resultado } from "./comun";
import {
  abrirCarga,
  cargarPosicion,
  cerrarCarga,
  confirmarExistente,
  confirmarVacia,
  deshacerPosicion,
} from "./carga-motor";

/**
 * Las acciones de la CARGA INICIAL. La lógica vive en carga-motor.ts; acá solo
 * se valida la entrada, se autoriza y se abre la transacción.
 *
 * Abrirla es del admin: decide cuándo un grupo deja de recibir palets. Hacerla
 * y cerrarla es de control, que es quien está parado enfrente del rack.
 */

const esquemaNota = z
  .string()
  .trim()
  .max(300, "La nota es muy larga.")
  .optional()
  .transform((v) => (v ? v : null));

const esquemaCarga = z.object({
  posicionId: z.number().int().positive(),
  packaging: z.enum(["suelto", "palet", "optimizado", "objeto"]),
  contenido: z.array(
    z.object({
      modeloId: z.number().int().positive(),
      cantidad: z.number().int().min(1, "Las cantidades tienen que ser mayores a cero."),
    }),
  ),
  descripcion: z.string().trim().max(200).optional(),
  /** AAAA-MM-DD. Sin fecha, hoy. */
  fechaIngreso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha no es válida.").optional(),
  nota: esquemaNota,
});

/** Mediodía de Argentina de ese día: lejos de los bordes, no cambia de fecha por el huso. */
function fechaDelDia(texto: string | undefined): Date {
  if (!texto) return new Date();
  const d = new Date(`${texto}T12:00:00-03:00`);
  if (Number.isNaN(d.getTime())) fallar("La fecha no es válida.");
  if (d.getUTCFullYear() < 2000) fallar("La fecha de ingreso es demasiado vieja. Revisala.");
  // Hoy a mediodía puede ser "más tarde" que ahora: se recorta a ahora.
  return d.getTime() > Date.now() && texto === hoyEnArgentina() ? new Date() : d;
}

function hoyEnArgentina(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
}

export async function iniciarCargaInicial(grupoId: number): Promise<Resultado> {
  return ejecutar(async () => {
    await autorizar("admin");
    await db.transaction((tx) => abrirCarga(tx, grupoId));
    revalidatePath("/", "layout");
  });
}

export async function cargarEnPosicion(
  entrada: z.input<typeof esquemaCarga>,
): Promise<Resultado<{ codigo: string; avisos: string[] }>> {
  return ejecutar(async () => {
    const sesion = await autorizar("control", "admin");
    const d = esquemaCarga.parse(entrada);
    const r = await db.transaction((tx) =>
      cargarPosicion(tx, {
        posicionId: d.posicionId,
        packaging: d.packaging,
        contenido: d.packaging === "objeto" ? [] : d.contenido,
        descripcion: d.descripcion ?? null,
        fechaIngreso: fechaDelDia(d.fechaIngreso),
        nota: d.nota,
        usuario: { id: sesion.uid, nombre: sesion.nombre },
      }),
    );
    revalidatePath("/", "layout");
    return r;
  });
}

export async function marcarVaciaEnCarga(posicionId: number): Promise<Resultado> {
  return ejecutar(async () => {
    await autorizar("control", "admin");
    await db.transaction((tx) => confirmarVacia(tx, posicionId));
    revalidatePath("/", "layout");
  });
}

export async function confirmarExistenteEnCarga(posicionId: number): Promise<Resultado> {
  return ejecutar(async () => {
    await autorizar("control", "admin");
    await db.transaction((tx) => confirmarExistente(tx, posicionId));
    revalidatePath("/", "layout");
  });
}

export async function deshacerEnCarga(posicionId: number): Promise<Resultado> {
  return ejecutar(async () => {
    const sesion = await autorizar("control", "admin");
    await db.transaction((tx) => deshacerPosicion(tx, posicionId, { id: sesion.uid, nombre: sesion.nombre }));
    revalidatePath("/", "layout");
  });
}

export async function cerrarCargaInicial(
  grupoId: number,
): Promise<Resultado<{ relevadas: number; pendientes: number; bultos: number }>> {
  return ejecutar(async () => {
    const sesion = await autorizar("control", "admin");
    const r = await db.transaction((tx) => cerrarCarga(tx, grupoId, sesion.uid));
    revalidatePath("/", "layout");
    return r;
  });
}
