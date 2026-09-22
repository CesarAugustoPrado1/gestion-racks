import { SignJWT, jwtVerify } from "jose";
import type { Rol } from "./db/schema";

export const COOKIE_SESION = "racks_sesion";
const DIAS_DE_SESION = 30;

export type Sesion = {
  uid: number;
  usuario: string;
  nombre: string;
  rol: Rol;
};

function clave() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "Falta la variable SESSION_SECRET. Generá una con: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }
  return new TextEncoder().encode(secret);
}

export async function firmarSesion(sesion: Sesion): Promise<string> {
  return new SignJWT({ ...sesion })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${DIAS_DE_SESION}d`)
    .sign(clave());
}

/** Devuelve null si el token falta, esta vencido o fue manipulado. */
export async function verificarSesion(
  token: string | undefined,
): Promise<Sesion | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, clave());
    if (
      typeof payload.uid !== "number" ||
      typeof payload.usuario !== "string" ||
      typeof payload.nombre !== "string" ||
      typeof payload.rol !== "string"
    ) {
      return null;
    }
    return {
      uid: payload.uid,
      usuario: payload.usuario,
      nombre: payload.nombre,
      rol: payload.rol as Rol,
    };
  } catch {
    return null;
  }
}

export const opcionesCookie = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: DIAS_DE_SESION * 24 * 60 * 60,
};
