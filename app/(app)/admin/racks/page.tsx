import Link from "next/link";
import { sql } from "drizzle-orm";
import { requerirRol } from "@/lib/auth";
import { db } from "@/lib/db";
import { empresas as leerEmpresas } from "@/lib/consultas";
import { Titulo } from "@/components/ui";
import { Grupos } from "./lista";

export const metadata = { title: "Racks · Racks" };
export const dynamic = "force-dynamic";

export default async function PantallaGrupos() {
  await requerirRol("admin");

  const [grupos, niveles, empresas] = await Promise.all([
    db.execute(sql`
      select g.id, g.codigo, g.nombre, g.accesibilidad, g.ancho, g.niveles,
             g.profundidad, g.unidades, g.activo,
             g.empresa_id, e.nombre as empresa_nombre,
             count(p.id)::int as posiciones,
             count(b.id)::int as ocupadas
        from grupos g
        left join empresas e on e.id = g.empresa_id
        left join posiciones p on p.grupo_id = g.id and p.activa
        left join bultos b on b.posicion_id = p.id and b.estado = 'ubicado'
       group by g.id, e.id order by g.orden
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
        empresa_id: number | null;
        empresa_nombre: string | null;
        posiciones: number;
        ocupadas: number;
      }>
    >,
    db.execute(sql`
      select n.grupo_id, n.nivel, n.altura_max_cm, n.alcanzable,
             (select count(*)::int from bultos b join posiciones p on p.id = b.posicion_id
               where b.estado = 'ubicado' and p.grupo_id = n.grupo_id and p.nivel = n.nivel
             ) as ocupadas
        from niveles n order by n.grupo_id, n.nivel
    `) as unknown as Promise<
      Array<{
        grupo_id: number;
        nivel: number;
        altura_max_cm: number | null;
        alcanzable: boolean;
        ocupadas: number;
      }>
    >,
    leerEmpresas(),
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
        grupos={grupos.map((g) => ({
          ...g,
          empresaId: g.empresa_id,
          empresaNombre: g.empresa_nombre,
        }))}
        empresas={empresas}
        niveles={niveles.map((n) => ({
          grupoId: n.grupo_id,
          nivel: n.nivel,
          alturaMaxCm: n.altura_max_cm,
          alcanzable: n.alcanzable,
          ocupadas: n.ocupadas,
        }))}
      />
      <p className="mt-4 text-sm text-slate-500">
        Para dejar fuera de uso una calle, un nivel o una posición puntual:{" "}
        <Link href="/admin/exclusiones" className="font-semibold underline">
          lista de exclusión
        </Link>
        .
      </p>
    </>
  );
}
