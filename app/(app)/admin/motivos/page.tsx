import Link from "next/link";
import { sql } from "drizzle-orm";
import { requerirRol } from "@/lib/auth";
import { db } from "@/lib/db";
import { Titulo } from "@/components/ui";
import { Motivos } from "./lista";

export const metadata = { title: "Motivos · Racks" };
export const dynamic = "force-dynamic";

export default async function PantallaMotivos() {
  await requerirRol("admin");
  const filas = (await db.execute(sql`
    select id, nombre, ambito, es_egreso, activo from motivos order by ambito, orden, nombre
  `)) as unknown as Array<{
    id: number;
    nombre: string;
    ambito: string;
    es_egreso: boolean;
    activo: boolean;
  }>;

  return (
    <>
      <Link href="/admin" className="mb-2 inline-block text-sm font-medium text-slate-500">
        ← Administración
      </Link>
      <Titulo detalle="Por qué sale algo del rack, y por qué hubo que ajustar.">
        Motivos
      </Titulo>
      <Motivos
        motivos={filas.map((m) => ({
          id: m.id,
          nombre: m.nombre,
          ambito: m.ambito as "salida" | "ajuste",
          esEgreso: m.es_egreso,
          activo: m.activo,
        }))}
      />
    </>
  );
}
