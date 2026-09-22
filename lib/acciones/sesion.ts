"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { usuarios } from "../db/schema";
import { verificarPin } from "../auth";
import { COOKIE_SESION, firmarSesion, opcionesCookie } from "../session";
import { rutaInicial } from "../permisos";
import { ejecutar, fallar, type Resultado } from "./comun";

const MAX_INTENTOS = 5;
const MINUTOS_DE_BLOQUEO = 5;

const esquemaLogin = z.object({
  usuario: z.string().trim().min(1, "Escribí tu usuario.").toLowerCase(),
  pin: z.string().regex(/^\d{4,8}$/, "El PIN son entre 4 y 8 números."),
});

export async function iniciarSesion(
  entrada: z.input<typeof esquemaLogin>,
): Promise<Resultado<{ destino: string }>> {
  return ejecutar(async () => {
    const datos = esquemaLogin.parse(entrada);

    const [usuario] = await db
      .select()
      .from(usuarios)
      .where(eq(usuarios.usuario, datos.usuario))
      .limit(1);

    // Mensaje unico para usuario inexistente y PIN incorrecto: no le contamos
    // a nadie que un usuario existe.
    const generico = "Usuario o PIN incorrecto.";
    if (!usuario || !usuario.activo) fallar(generico);

    if (usuario.bloqueadoHasta && usuario.bloqueadoHasta > new Date()) {
      const faltan = Math.ceil(
        (usuario.bloqueadoHasta.getTime() - Date.now()) / 60000,
      );
      fallar(
        `Demasiados intentos fallidos. Probá de nuevo en ${faltan} minuto${faltan === 1 ? "" : "s"}.`,
      );
    }

    if (!(await verificarPin(datos.pin, usuario.pinHash))) {
      /**
       * Si el bloqueo anterior ya vencio, el contador arranca de nuevo.
       *
       * En Control-Secaderos, sin esto, quedaba pegado en 5: cumplido el
       * bloqueo, el siguiente error de tipeo daba 6 y volvia a bloquear cinco
       * minutos, y asi para siempre. Un operario que se olvida el PIN quedaba
       * con un intento cada cinco minutos hasta que el admin lo destrabara.
       */
      const venciaEl = usuario.bloqueadoHasta;
      const arrancaDeCero = venciaEl != null && venciaEl <= new Date();
      const intentos = (arrancaDeCero ? 0 : usuario.intentosFallidos) + 1;
      await db
        .update(usuarios)
        .set({
          intentosFallidos: intentos,
          bloqueadoHasta:
            intentos >= MAX_INTENTOS
              ? new Date(Date.now() + MINUTOS_DE_BLOQUEO * 60000)
              : null,
        })
        .where(eq(usuarios.id, usuario.id));

      if (intentos >= MAX_INTENTOS) {
        fallar(
          `Demasiados intentos fallidos. Probá de nuevo en ${MINUTOS_DE_BLOQUEO} minutos.`,
        );
      }
      fallar(generico);
    }

    await db
      .update(usuarios)
      .set({ intentosFallidos: 0, bloqueadoHasta: null })
      .where(eq(usuarios.id, usuario.id));

    const token = await firmarSesion({
      uid: usuario.id,
      usuario: usuario.usuario,
      nombre: usuario.nombre,
      rol: usuario.rol,
    });

    const store = await cookies();
    store.set(COOKIE_SESION, token, opcionesCookie);

    return { destino: rutaInicial(usuario.rol) };
  });
}

export async function cerrarSesion() {
  const store = await cookies();
  store.delete(COOKIE_SESION);
  redirect("/login");
}
