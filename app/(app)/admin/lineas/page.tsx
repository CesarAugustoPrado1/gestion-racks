import Link from "next/link";
import { sql } from "drizzle-orm";
import { requerirRol } from "@/lib/auth";
import { db } from "@/lib/db";
import { Titulo } from "@/components/ui";
import { Lineas } from "./lista";

export const metadata = { title: "Líneas · Racks" };
export const dynamic = "force-dynamic";

export default async function PantallaLineas() {
  await requerirRol("admin");
  const lineas = (await db.execute(sql`
    select l.id, l.nombre, l.unidad_singular, l.unidad_plural, l.activa,
           count(m.id)::int as modelos
      from lineas l left join modelos m on m.linea_id = l.id
     group by l.id order by l.orden
  `)) as unknown as Array<{
    id: number;
    nombre: string;
    unidad_singular: string;
    unidad_plural: string;
    activa: boolean;
    modelos: number;
  }>;

  return (
    <>
      <Link href="/admin" className="mb-2 inline-block text-sm font-medium text-slate-500">
        ← Administración
      </Link>
      <Titulo detalle="La unidad en que se cuenta cada línea: placas, paquetes, cajas.">
        Líneas
      </Titulo>
      <Lineas
        lineas={lineas.map((l) => ({
          id: l.id,
          nombre: l.nombre,
          unidadSingular: l.unidad_singular,
          unidadPlural: l.unidad_plural,
          activa: l.activa,
          modelos: l.modelos,
        }))}
      />
    </>
  );
}
