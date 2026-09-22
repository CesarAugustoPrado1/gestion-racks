import Link from "next/link";
import { sql } from "drizzle-orm";
import { requerirRol } from "@/lib/auth";
import { db } from "@/lib/db";
import { Titulo } from "@/components/ui";
import { Grupos } from "./lista";

export const metadata = { title: "Racks · Racks" };
export const dynamic = "force-dynamic";

export default async function PantallaGrupos() {
  await requerirRol("admin");

  const [grupos, niveles] = await Promise.all([
    db.execute(sql`
      select g.id, g.codigo, g.nombre, g.accesibilidad, g.ancho, g.niveles,
             g.profundidad, g.unidades, g.activo,
             count(p.id)::int as posiciones,
             count(b.id)::int as ocupadas
        from grupos g
        left join posiciones p on p.grupo_id = g.id and p.activa
        left join bultos b on b.posicion_id = p.id and b.estado = 'ubicado'
       group by g.id order by g.orden
    `) as unknown as Promise<
      Array<{
        id: number;
        codigo: string;
        nombre: string | null;
        accesibilidad: "selectivo" | "penetrable";
        ancho: number | null;
        niveles: number;
        profundidad: number | null;
        unidades: number;
        activo: boolean;
        posiciones: number;
        ocupadas: number;
      }>
    >,
    db.execute(sql`
      select grupo_id, nivel, altura_max_cm from niveles order by grupo_id, nivel
    `) as unknown as Promise<
      Array<{ grupo_id: number; nivel: number; altura_max_cm: number | null }>
    >,
  ]);

  return (
    <>
      <Link href="/admin" className="mb-2 inline-block text-sm font-medium text-slate-500">
        ← Administración
      </Link>
      <Titulo detalle="Cada grupo tiene su geometría, y las posiciones se generan de ella.">
        Grupos de racks
      </Titulo>
      <Grupos
        grupos={grupos}
        niveles={niveles.map((n) => ({
          grupoId: n.grupo_id,
          nivel: n.nivel,
          alturaMaxCm: n.altura_max_cm,
        }))}
      />
    </>
  );
}
