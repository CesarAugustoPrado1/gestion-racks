import Link from "next/link";
import { sql } from "drizzle-orm";
import { requerirRol } from "@/lib/auth";
import { db } from "@/lib/db";
import { Titulo } from "@/components/ui";
import { Modelos } from "./lista";

export const metadata = { title: "Modelos · Racks" };
export const dynamic = "force-dynamic";

export default async function PantallaModelos() {
  await requerirRol("admin");

  const [modelos, lineas] = await Promise.all([
    db.execute(sql`
      select m.id, m.nombre, m.activo, m.linea_id, l.nombre as linea_nombre,
             l.unidad_plural,
             max(case when n.packaging = 'palet' then n.cantidad end)::int as palet,
             max(case when n.packaging = 'optimizado' then n.cantidad end)::int as optimizado,
             max(case when n.packaging = 'palet' then n.altura_cm end)::int as alto_palet,
             max(case when n.packaging = 'optimizado' then n.altura_cm end)::int as alto_optimizado
        from modelos m
        join lineas l on l.id = m.linea_id
        left join normas n on n.modelo_id = m.id
       group by m.id, l.id
       order by l.orden, m.orden
    `) as unknown as Promise<
      Array<{
        id: number;
        nombre: string;
        activo: boolean;
        linea_id: number;
        linea_nombre: string;
        unidad_plural: string;
        palet: number | null;
        optimizado: number | null;
        alto_palet: number | null;
        alto_optimizado: number | null;
      }>
    >,
    db.execute(sql`
      select id, nombre from lineas where activa order by orden
    `) as unknown as Promise<Array<{ id: number; nombre: string }>>,
  ]);

  return (
    <>
      <Link href="/admin" className="mb-2 inline-block text-sm font-medium text-slate-500">
        ← Administración
      </Link>
      <Titulo detalle="Con sus cantidades normalizadas por packaging.">
        Modelos
      </Titulo>
      {lineas.length === 0 ? (
        <div className="tarjeta p-6 text-sm text-slate-600">
          Primero hay que crear una línea.{" "}
          <Link href="/admin/lineas" className="font-semibold underline">
            Ir a líneas
          </Link>
          .
        </div>
      ) : (
        <Modelos
          modelos={modelos.map((m) => ({
            id: m.id,
            nombre: m.nombre,
            activo: m.activo,
            lineaId: m.linea_id,
            lineaNombre: m.linea_nombre,
            unidadPlural: m.unidad_plural,
            palet: m.palet,
            optimizado: m.optimizado,
            altoPalet: m.alto_palet,
            altoOptimizado: m.alto_optimizado,
          }))}
          lineas={lineas}
        />
      )}
    </>
  );
}
