import Link from "next/link";
import { sql } from "drizzle-orm";
import { requerirRol } from "@/lib/auth";
import { db } from "@/lib/db";
import { Titulo } from "@/components/ui";
import { Empresas } from "./lista";

export const metadata = { title: "Empresas · Racks" };
export const dynamic = "force-dynamic";

export default async function PantallaEmpresas() {
  await requerirRol("admin");
  const empresas = (await db.execute(sql`
    select e.id, e.nombre, e.activa,
           (select count(*)::int from grupos g where g.empresa_id = e.id and g.activo) as grupos,
           (select count(*)::int from modelos m where m.empresa_id = e.id and m.activo) as modelos
      from empresas e order by e.orden, e.nombre
  `)) as unknown as Array<{
    id: number;
    nombre: string;
    activa: boolean;
    grupos: number;
    modelos: number;
  }>;

  return (
    <>
      <Link href="/admin" className="mb-2 inline-block text-sm font-medium text-slate-500">
        ← Administración
      </Link>
      <Titulo detalle="Las empresas que comparten el galpón. Cada grupo de racks y cada modelo es de una.">
        Empresas
      </Titulo>
      <Empresas empresas={empresas} />
    </>
  );
}
