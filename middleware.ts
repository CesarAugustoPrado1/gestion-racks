import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESION, verificarSesion } from "./lib/session";
import { puedeVer, rutaInicial } from "./lib/permisos";

const PUBLICAS = ["/login", "/sin-permiso"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const sesion = await verificarSesion(req.cookies.get(COOKIE_SESION)?.value);

  if (PUBLICAS.includes(pathname)) {
    // Si ya esta logueado, el login no tiene sentido.
    if (pathname === "/login" && sesion) {
      return NextResponse.redirect(new URL(rutaInicial(sesion.rol), req.url));
    }
    return NextResponse.next();
  }

  if (!sesion) {
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("volver", pathname);
    return NextResponse.redirect(url);
  }

  // La raiz lleva a cada rol a su pantalla de trabajo.
  if (pathname === "/") {
    return NextResponse.redirect(new URL(rutaInicial(sesion.rol), req.url));
  }

  if (!puedeVer(sesion.rol, pathname)) {
    return NextResponse.redirect(new URL("/sin-permiso", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /**
     * `/api/version` queda afuera a proposito: sirve para saber que commit esta
     * desplegado, y tiene que contestar sin sesion.
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|api/version).*)",
  ],
};
