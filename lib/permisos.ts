import type { Rol } from "./db/schema";

/**
 * Prefijo de ruta -> roles habilitados. Se evalua por prefijo mas largo
 * primero, asi `/admin` puede ser mas restrictivo que `/`.
 *
 * Ojo: esto controla la NAVEGACION. Cada server action revalida permisos por su
 * cuenta con `autorizar()`, porque el middleware no es una frontera de
 * seguridad suficiente: una action se puede invocar directamente.
 *
 * Igual que en Control-Secaderos, separar pantallas por puesto es para que
 * nadie se equivoque de pantalla, no para impedir que alguien mueva un bulto:
 * en el piso el movimiento lo hace quien esta a mano. La excepcion real es
 * `/control`, porque el `ajuste` es la medida del error del sistema y quien lo
 * comete no lo puede borrar.
 */
const REGLAS: Array<{ prefijo: string; roles: Rol[] }> = [
  { prefijo: "/admin", roles: ["admin"] },
  { prefijo: "/mover", roles: ["autoelevador", "admin"] },
  { prefijo: "/control", roles: ["control", "admin"] },
  // Corregir lo ultimo propio. Entran todos los que operan; si ESTE movimiento
  // se puede tocar lo decide la regla del servidor, no la ruta.
  { prefijo: "/corregir", roles: ["autoelevador", "control", "admin"] },
  { prefijo: "/stock", roles: ["comercial", "admin", "auditor", "control"] },
  // El historial es la trazabilidad: quién movió qué y cuándo. Lo mira quien
  // audita y quien vende, no quien opera -el operario ve lo suyo en /mover-.
  { prefijo: "/movimientos", roles: ["admin", "auditor", "comercial", "control"] },
  { prefijo: "/racks", roles: ["admin", "auditor", "autoelevador", "control", "comercial"] },
];

export function puedeVer(rol: Rol, ruta: string): boolean {
  const regla = REGLAS.filter((r) => ruta.startsWith(r.prefijo)).sort(
    (a, b) => b.prefijo.length - a.prefijo.length,
  )[0];
  if (!regla) return true;
  return regla.roles.includes(rol);
}

/** Adonde mandamos a cada rol despues de loguearse: a su puesto de trabajo. */
export function rutaInicial(rol: Rol): string {
  switch (rol) {
    case "autoelevador":
      return "/mover";
    case "control":
      return "/control";
    case "comercial":
      return "/stock";
    default:
      return "/racks";
  }
}

/** El auditor ve todo pero no escribe nada, en ninguna pantalla. */
export function esSoloLectura(rol: Rol): boolean {
  return rol === "auditor";
}

export const ETIQUETA_ROL: Record<Rol, string> = {
  admin: "Administrador",
  autoelevador: "Autoelevador",
  control: "Control",
  comercial: "Comercial",
  auditor: "Auditor",
};

export const ROLES: Rol[] = [
  "admin",
  "autoelevador",
  "control",
  "comercial",
  "auditor",
];

export type ItemNav = { href: string; etiqueta: string; icono: string };

/**
 * Solo rutas que existen. Un item de navegacion que lleva a un 404 es peor que
 * no tenerlo: el operario aprende a desconfiar de la barra.
 */
const NAV: ItemNav[] = [
  { href: "/mover", etiqueta: "Mover", icono: "autoelevador" },
  { href: "/control", etiqueta: "Control", icono: "control" },
  { href: "/racks", etiqueta: "Racks", icono: "grid" },
  { href: "/stock", etiqueta: "Stock", icono: "pallet" },
  { href: "/movimientos", etiqueta: "Movimientos", icono: "lista" },
  { href: "/admin", etiqueta: "Administración", icono: "config" },
];

export function navParaRol(rol: Rol): ItemNav[] {
  return NAV.filter((item) => puedeVer(rol, item.href));
}
