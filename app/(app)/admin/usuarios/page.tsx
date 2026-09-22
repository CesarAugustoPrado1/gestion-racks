import Link from "next/link";
import { sql } from "drizzle-orm";
import { requerirRol } from "@/lib/auth";
import { db } from "@/lib/db";
import { Titulo } from "@/components/ui";
import { Usuarios } from "./lista";

export const metadata = { title: "Usuarios · Racks" };
export const dynamic = "force-dynamic";

export default async function PantallaUsuarios() {
  const sesion = await requerirRol("admin");
  const filas = (await db.execute(sql`
    select id, usuario, nombre, rol, activo, bloqueado_hasta
      from usuarios order by activo desc, nombre
  `)) as unknown as Array<{
    id: number;
    usuario: string;
    nombre: string;
    rol: string;
    activo: boolean;
    bloqueado_hasta: string | Date | null;
  }>;

  const ahora = Date.now();

  return (
    <>
      <Link href="/admin" className="mb-2 inline-block text-sm font-medium text-slate-500">
        ← Administración
      </Link>
      <Titulo detalle="Quién entra y a qué pantalla.">Usuarios</Titulo>
      <Usuarios
        usuarios={filas.map((u) => ({
          id: u.id,
          usuario: u.usuario,
          nombre: u.nombre,
          rol: u.rol,
          activo: u.activo,
          bloqueado:
            u.bloqueado_hasta != null &&
            new Date(u.bloqueado_hasta).getTime() > ahora,
        }))}
        yo={sesion.uid}
      />
    </>
  );
}
