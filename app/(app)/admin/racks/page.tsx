import Link from "next/link";
import { sql } from "drizzle-orm";
import { requerirRol } from "@/lib/auth";
import { db } from "@/lib/db";
import { Titulo } from "@/components/ui";
import { Racks } from "./lista";

export const metadata = { title: "Racks · Racks" };
export const dynamic = "force-dynamic";

export default async function PantallaRacks() {
  await requerirRol("admin");

  const [racks, posiciones] = await Promise.all([
    db.execute(sql`
      select r.id, r.codigo, r.nombre, r.accesibilidad, r.activo,
             count(p.id)::int as posiciones
        from racks r left join posiciones p on p.rack_id = r.id
       group by r.id order by r.orden
    `) as unknown as Promise<
      Array<{
        id: number;
        codigo: string;
        nombre: string | null;
        accesibilidad: string;
        activo: boolean;
        posiciones: number;
      }>
    >,
    db.execute(sql`
      select p.id, p.rack_id, p.codigo, p.profundidad, p.capacidad_bultos, p.activa,
             count(b.id)::int as ocupados
        from posiciones p
        left join bultos b on b.posicion_id = p.id and b.estado = 'ubicado'
       group by p.id order by p.orden
    `) as unknown as Promise<
      Array<{
        id: number;
        rack_id: number;
        codigo: string;
        profundidad: number | null;
        capacidad_bultos: number;
        activa: boolean;
        ocupados: number;
      }>
    >,
  ]);

  return (
    <>
      <Link href="/admin" className="mb-2 inline-block text-sm font-medium text-slate-500">
        ← Administración
      </Link>
      <Titulo detalle="Y sus posiciones. Selectivo o penetrable cambia cómo se saca lo de adentro.">
        Racks
      </Titulo>
      <Racks
        racks={racks.map((r) => ({
          id: r.id,
          codigo: r.codigo,
          nombre: r.nombre,
          accesibilidad: r.accesibilidad as "selectivo" | "penetrable",
          activo: r.activo,
          posiciones: r.posiciones,
        }))}
        posiciones={posiciones.map((p) => ({
          id: p.id,
          rackId: p.rack_id,
          codigo: p.codigo,
          profundidad: p.profundidad,
          capacidad: p.capacidad_bultos,
          activa: p.activa,
          ocupados: p.ocupados,
        }))}
      />
    </>
  );
}
