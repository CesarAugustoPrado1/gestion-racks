import "server-only";
import { cookies } from "next/headers";
import { COOKIE_SEGUNDA, leerVista, type VistaSegunda } from "./segunda";

/** La vista de segunda que eligió quien está mirando. Ver lib/segunda.ts. */
export async function vistaSegunda(): Promise<VistaSegunda> {
  return leerVista((await cookies()).get(COOKIE_SEGUNDA)?.value);
}
