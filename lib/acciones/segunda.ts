"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requerirSesion } from "../auth";
import { COOKIE_SEGUNDA, leerVista } from "../segunda";

/**
 * Guarda cómo quiere ver la segunda quien está mirando. No toca ningún dato:
 * es una preferencia del navegador, y por eso la puede cambiar cualquier rol.
 */
export async function elegirVistaSegunda(vista: string): Promise<void> {
  await requerirSesion();
  (await cookies()).set(COOKIE_SEGUNDA, leerVista(vista), {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: true,
  });
  revalidatePath("/", "layout");
}
