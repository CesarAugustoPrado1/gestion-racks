import Link from "next/link";
import { sql } from "drizzle-orm";
import { requerirRol } from "@/lib/auth";
import { db } from "@/lib/db";
import { Titulo } from "@/components/ui";
import { joinExclusion } from "@/lib/uso-sql";
import type { MotivoExclusion } from "@/lib/uso";
import { Exclusiones, type ExclusionEnLista, type GrupoParaExcluir } from "./lista";

export const metadata = { title: "Lista de exclusión · Racks" };
export const dynamic = "force-dynamic";

const comoFecha = (v: Date | string | null) =>
  v == null ? null : v instanceof Date ? v : new Date(v);

export default async function PantallaExclusiones({
  searchParams,
}: {
  searchParams: Promise<{ grupo?: string; posicion?: string }>;
}) {
  await requerirRol("admin");
  const { grupo, posicion } = await searchParams;

  const [grupos, posiciones, filas] = await Promise.all([
    db.execute(sql`
      select id, codigo, nombre, accesibilidad, niveles, unidades
        from grupos where activo order by orden
    `) as unknown as Promise<
      Array<{
        id: number;
        codigo: string;
        nombre: string | null;
        accesibilidad: string;
        niveles: number;
        unidades: number;
      }>
    >,
    db.execute(sql`
      select p.id, p.grupo_id, g.codigo || '-' || p.codigo as codigo
        from posiciones p join grupos g on g.id = p.grupo_id
       where p.activa and g.activo
       order by g.orden, p.nivel desc, p.unidad, p.profundidad nulls last, p.columna
    `) as unknown as Promise<Array<{ id: number; grupo_id: number; codigo: string }>>,
    /**
     * Las vigentes y las últimas levantadas. Las levantadas se muestran porque
     * "¿la calle 7 no estaba en reparación?" se contesta mirando acá: quién la
     * habilitó y cuándo.
     */
    db.execute(sql`
      select e.id, e.grupo_id, e.unidad, e.nivel, e.posicion_id, e.motivo, e.nota,
             e.creada_en, e.levantada_en,
             g.codigo as grupo_codigo, g.accesibilidad, g.niveles,
             g.codigo || '-' || p.codigo as posicion_codigo,
             uc.nombre as creada_por, ul.nombre as levantada_por,
             (select count(*)::int
                from bultos b join posiciones px on px.id = b.posicion_id
               where b.estado = 'ubicado' and px.grupo_id = e.grupo_id
                 and (e.posicion_id is null or px.id = e.posicion_id)
                 and (e.unidad is null or px.unidad = e.unidad)
                 and (e.nivel is null or px.nivel = e.nivel)) as bultos_adentro
        from exclusiones e
        join grupos g on g.id = e.grupo_id
        left join posiciones p on p.id = e.posicion_id
        left join usuarios uc on uc.id = e.creada_por
        left join usuarios ul on ul.id = e.levantada_por
       where e.levantada_en is null
          or e.id in (select id from exclusiones where levantada_en is not null
                       order by levantada_en desc limit 10)
       order by e.levantada_en desc nulls first, g.orden, e.unidad nulls first, e.nivel nulls first
    `) as unknown as Promise<
      Array<{
        id: number;
        grupo_id: number;
        unidad: number | null;
        nivel: number | null;
        posicion_id: number | null;
        motivo: MotivoExclusion;
        nota: string | null;
        creada_en: Date | string;
        levantada_en: Date | string | null;
        grupo_codigo: string;
        accesibilidad: string;
        niveles: number;
        posicion_codigo: string | null;
        creada_por: string | null;
        levantada_por: string | null;
        bultos_adentro: number;
      }>
    >,
  ]);

  // Cuántas posiciones deja fuera de uso todo junto, contando una sola vez las
  // que cubren dos exclusiones a la vez.
  const [{ fuera }] = (await db.execute(sql`
    select count(*)::int as fuera
      from posiciones p join grupos g on g.id = p.grupo_id
      ${joinExclusion("p", "ex")}
     where p.activa and g.activo and ex.id is not null
  `)) as unknown as Array<{ fuera: number }>;

  const lista: ExclusionEnLista[] = filas.map((f) => ({
    id: f.id,
    grupoCodigo: f.grupo_codigo,
    penetrable: f.accesibilidad === "penetrable",
    niveles: f.niveles,
    unidad: f.unidad,
    nivel: f.nivel,
    posicionId: f.posicion_id,
    posicionCodigo: f.posicion_codigo,
    motivo: f.motivo,
    nota: f.nota,
    creadaEn: comoFecha(f.creada_en)!,
    creadaPor: f.creada_por,
    levantadaEn: comoFecha(f.levantada_en),
    levantadaPor: f.levantada_por,
    bultosAdentro: f.bultos_adentro,
  }));

  const paraElegir: GrupoParaExcluir[] = grupos.map((g) => ({
    id: g.id,
    codigo: g.codigo,
    nombre: g.nombre,
    penetrable: g.accesibilidad === "penetrable",
    niveles: g.niveles,
    unidades: g.unidades,
    posiciones: posiciones
      .filter((p) => p.grupo_id === g.id)
      .map((p) => ({ id: p.id, codigo: p.codigo })),
  }));

  return (
    <>
      <Link href="/admin" className="mb-2 inline-block text-sm font-medium text-slate-500">
        ← Administración
      </Link>
      <Titulo detalle="Lugares que existen pero no se usan: no se ofrecen al meter ni al mover.">
        Lista de exclusión
      </Titulo>
      <Exclusiones
        grupos={paraElegir}
        exclusiones={lista}
        posicionesFuera={fuera}
        inicial={{
          grupoId: grupo ? Number(grupo) : null,
          posicionId: posicion ? Number(posicion) : null,
        }}
      />
    </>
  );
}
