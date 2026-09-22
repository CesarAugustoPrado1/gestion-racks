import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { usuarios, type Rol } from "./db/schema";
import { COOKIE_SESION, verificarSesion, type Sesion } from "./session";
import { ErrorDeNegocio } from "./acciones/comun";

export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, 10);
}

export async function verificarPin(
  pin: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}

/** Sesion del request actual, o null si no hay. No redirige. */
export async function sesionActual(): Promise<Sesion | null> {
  const store = await cookies();
  return verificarSesion(store.get(COOKIE_SESION)?.value);
}

/**
 * Sesion garantizada. Ademas de validar la cookie revalida contra la base que
 * el usuario siga existiendo y activo: si el admin lo da de baja, la sesion
 * vigente deja de servir en el proximo request en vez de durar 30 dias.
 */
export async function requerirSesion(): Promise<Sesion> {
  const sesion = await sesionActual();
  if (!sesion) redirect("/login");

  const [usuario] = await db
    .select({ activo: usuarios.activo, rol: usuarios.rol })
    .from(usuarios)
    .where(eq(usuarios.id, sesion.uid))
    .limit(1);

  if (!usuario || !usuario.activo) redirect("/login?motivo=inactivo");

  // El rol de la base manda por sobre el de la cookie, por si cambio.
  return { ...sesion, rol: usuario.rol };
}

/** Exige sesion y ademas uno de los roles indicados. Para paginas. */
export async function requerirRol(...roles: Rol[]): Promise<Sesion> {
  const sesion = await requerirSesion();
  if (!roles.includes(sesion.rol)) redirect("/sin-permiso");
  return sesion;
}

/**
 * Version para server actions: falla con un mensaje en vez de redirigir.
 *
 * Dos diferencias que no son de estilo. En una action `redirect()` lanza una
 * excepcion de control de flujo que se confundiria con un fallo de negocio, asi
 * que aca nunca redirigimos. Y cada action llama a esto por su cuenta: el
 * middleware controla la navegacion, pero una server action se puede invocar
 * directamente, asi que no es una frontera de seguridad suficiente.
 *
 * El auditor no pasa por aca en ningun caso: no se lo incluye en `roles`.
 */
export async function autorizar(...roles: Rol[]): Promise<Sesion> {
  const sesion = await sesionActual();
  if (!sesion) throw new ErrorDeNegocio("Tu sesión venció. Volvé a entrar.");

  const [usuario] = await db
    .select({ activo: usuarios.activo, rol: usuarios.rol })
    .from(usuarios)
    .where(eq(usuarios.id, sesion.uid))
    .limit(1);

  if (!usuario || !usuario.activo) {
    throw new ErrorDeNegocio("Tu usuario está dado de baja.");
  }
  if (!roles.includes(usuario.rol)) {
    throw new ErrorDeNegocio("No tenés permiso para hacer esta operación.");
  }
  return { ...sesion, rol: usuario.rol };
}
