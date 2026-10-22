import "server-only";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { alcanzable, joinExclusion } from "./uso-sql";
import { nombreDeNivel } from "./posiciones";
import type { Packaging } from "./db/schema";

/**
 * El tablero: la foto de AHORA, en números.
 *
 * Todo lo que está acá sale del estado vivo -posiciones, bultos, contenido-, no
 * del historial: es "cómo estamos", no "qué pasó". Lo que pasó está en
 * lib/estadisticas.ts.
 *
 * REGLA DE UNIDADES: las líneas se cuentan en unidades distintas -placas,
 * paquetes, cajas- y NO se suman entre sí. Lo que sí se suma entre líneas son
 * los BULTOS, que es lo que ocupa una posición. Por eso los totales de planta
 * van en bultos y las unidades van siempre abiertas por línea.
 */

export type GrupoEnTablero = {
  id: number;
  codigo: string;
  nombre: string | null;
  empresa: string | null;
  /** Posiciones activas. */
  total: number;
  /** Con un bulto adentro, producto u objeto. */
  ocupadas: number;
  /** Sin bulto, pero tomadas por uno alto de abajo. */
  tapadas: number;
  /** Vacías y que se pueden usar: lo que el autoelevador tiene disponible. */
  libres: number;
  /** Vacías que no se usan: el clark no llega o están excluidas. */
  fueraDeUso: number;
  objetos: number;
  /** Bultos de otra empresa guardados en este grupo. */
  ajenos: number;
};

export type NivelEnTablero = {
  nombre: string;
  orden: number;
  total: number;
  ocupadas: number;
  libres: number;
};

export type LineaEnTablero = {
  id: number;
  nombre: string;
  unidadPlural: string;
  bultos: number;
  unidades: number;
  modelosConStock: number;
  porPackaging: Partial<Record<Packaging, { bultos: number; unidades: number }>>;
};

export type ModeloEnTablero = {
  id: number;
  nombre: string;
  linea: string;
  empresa: string | null;
  unidadPlural: string;
  bultos: number;
  unidades: number;
};

export type Tablero = {
  grupos: GrupoEnTablero[];
  niveles: NivelEnTablero[];
  lineas: LineaEnTablero[];
  modelos: ModeloEnTablero[];
  empresas: Array<{ nombre: string; posiciones: number; ocupadas: number; bultosPropios: number; afuera: number }>;
  bultos: {
    ubicados: number;
    sinUbicar: number;
    objetos: number;
    mezclados: number;
    fueraDeNorma: number;
    sinUbicarMasViejoDias: number | null;
  };
  actividad: {
    hoy: Record<string, number>;
    semana: Record<string, number>;
  };
  maestros: {
    lineas: number;
    modelos: number;
    grupos: number;
    usuarios: number;
    exclusiones: number;
    nivelesSinAlcance: number;
    sinEmpresa: number;
  };
};

export async function tablero(): Promise<Tablero> {
  const [grupos, niveles, lineas, porPackaging, modelos, empresas, bultos, actividad, maestros] =
    await Promise.all([
      db.execute(sql`
        select g.id, g.codigo, g.nombre, e.nombre as empresa,
               count(*) filter (where p.activa)::int as total,
               count(*) filter (where p.activa and b.id is not null)::int as ocupadas,
               count(*) filter (where p.activa and b.id is null
                                  and p.bloqueada_por_bulto_id is not null)::int as tapadas,
               count(*) filter (where p.activa and b.id is null and p.bloqueada_por_bulto_id is null
                                  and ${alcanzable("p")} and ex.id is null)::int as libres,
               count(*) filter (where p.activa and b.id is null and p.bloqueada_por_bulto_id is null
                                  and (not ${alcanzable("p")} or ex.id is not null))::int as fuera,
               count(*) filter (where b.packaging = 'objeto')::int as objetos,
               -- La misma regla que esAjeno(): solo cuenta cuando las dos
               -- empresas están cargadas y son distintas.
               count(*) filter (where g.empresa_id is not null and exists (
                   select 1 from bulto_contenido c join modelos m on m.id = c.modelo_id
                    where c.bulto_id = b.id and m.empresa_id is not null
                      and m.empresa_id <> g.empresa_id))::int as ajenos
          from posiciones p
          join grupos g on g.id = p.grupo_id
          left join empresas e on e.id = g.empresa_id
          left join bultos b on b.posicion_id = p.id and b.estado = 'ubicado'
          ${joinExclusion("p", "ex")}
         where g.activo
         group by g.id, e.nombre
         order by g.orden
      `) as unknown as Promise<
        Array<{
          id: number;
          codigo: string;
          nombre: string | null;
          empresa: string | null;
          total: number;
          ocupadas: number;
          tapadas: number;
          libres: number;
          fuera: number;
          objetos: number;
          ajenos: number;
        }>
      >,

      /**
       * Por nivel: ¿se usan los de arriba? Si el piso está lleno y arriba hay
       * lugar, el problema no es de espacio sino de alcance o de costumbre.
       */
      db.execute(sql`
        select g.niveles, p.nivel,
               count(*)::int as total,
               count(b.id)::int as ocupadas,
               count(*) filter (where b.id is null and p.bloqueada_por_bulto_id is null
                                  and ${alcanzable("p")} and ex.id is null)::int as libres
          from posiciones p
          join grupos g on g.id = p.grupo_id
          left join bultos b on b.posicion_id = p.id and b.estado = 'ubicado'
          ${joinExclusion("p", "ex")}
         where g.activo and p.activa
         group by g.niveles, p.nivel
      `) as unknown as Promise<
        Array<{ niveles: number; nivel: number; total: number; ocupadas: number; libres: number }>
      >,

      db.execute(sql`
        select l.id, l.nombre, l.unidad_plural, l.orden,
               count(distinct b.id)::int as bultos,
               coalesce(sum(c.cantidad) filter (where b.id is not null), 0)::int as unidades,
               count(distinct c.modelo_id) filter (where b.id is not null)::int as modelos_con_stock
          from lineas l
          left join modelos m on m.linea_id = l.id
          left join bulto_contenido c on c.modelo_id = m.id
          -- El estado va en el join y no en el where: una línea sin nada en
          -- stock tiene que aparecer igual, en cero.
          left join bultos b on b.id = c.bulto_id and b.estado in ('ubicado', 'sin_ubicar')
         where l.activa
         group by l.id
         order by l.orden
      `) as unknown as Promise<
        Array<{
          id: number;
          nombre: string;
          unidad_plural: string;
          bultos: number;
          unidades: number;
          modelos_con_stock: number;
        }>
      >,

      db.execute(sql`
        select m.linea_id, b.packaging,
               count(distinct b.id)::int as bultos,
               sum(c.cantidad)::int as unidades
          from bultos b
          join bulto_contenido c on c.bulto_id = b.id
          join modelos m on m.id = c.modelo_id
         where b.estado in ('ubicado', 'sin_ubicar')
         group by m.linea_id, b.packaging
      `) as unknown as Promise<
        Array<{ linea_id: number; packaging: Packaging; bultos: number; unidades: number }>
      >,

      db.execute(sql`
        select m.id, m.nombre, l.nombre as linea, e.nombre as empresa, l.unidad_plural,
               count(distinct b.id)::int as bultos,
               sum(c.cantidad)::int as unidades
          from bulto_contenido c
          join bultos b on b.id = c.bulto_id
          join modelos m on m.id = c.modelo_id
          join lineas l on l.id = m.linea_id
          left join empresas e on e.id = m.empresa_id
         where b.estado in ('ubicado', 'sin_ubicar')
         group by m.id, l.id, e.nombre
         order by count(distinct b.id) desc, m.nombre
      `) as unknown as Promise<
        Array<{
          id: number;
          nombre: string;
          linea: string;
          empresa: string | null;
          unidad_plural: string;
          bultos: number;
          unidades: number;
        }>
      >,

      /**
       * Por empresa: cuánto lugar tiene, cuánto usa, y cuántos de sus bultos
       * están guardados en racks de la otra. "Afuera" es el número que dice si
       * a una empresa le falta lugar.
       */
      db.execute(sql`
        select e.nombre,
               (select count(*)::int from posiciones p join grupos g on g.id = p.grupo_id
                 where g.empresa_id = e.id and g.activo and p.activa) as posiciones,
               (select count(*)::int from bultos b join posiciones p on p.id = b.posicion_id
                  join grupos g on g.id = p.grupo_id
                 where g.empresa_id = e.id and b.estado = 'ubicado') as ocupadas,
               (select count(distinct b.id)::int from bultos b
                  join bulto_contenido c on c.bulto_id = b.id
                  join modelos m on m.id = c.modelo_id
                 where m.empresa_id = e.id and b.estado in ('ubicado', 'sin_ubicar')) as bultos_propios,
               (select count(distinct b.id)::int from bultos b
                  join bulto_contenido c on c.bulto_id = b.id
                  join modelos m on m.id = c.modelo_id
                  join posiciones p on p.id = b.posicion_id
                  join grupos g on g.id = p.grupo_id
                 where m.empresa_id = e.id and b.estado = 'ubicado'
                   and g.empresa_id is not null and g.empresa_id <> e.id) as afuera
          from empresas e
         where e.activa
         order by e.orden, e.nombre
      `) as unknown as Promise<
        Array<{ nombre: string; posiciones: number; ocupadas: number; bultos_propios: number; afuera: number }>
      >,

      db.execute(sql`
        select
          count(*) filter (where b.estado = 'ubicado' and b.packaging <> 'objeto')::int as ubicados,
          count(*) filter (where b.estado = 'sin_ubicar' and b.packaging <> 'objeto')::int as sin_ubicar,
          count(*) filter (where b.packaging = 'objeto')::int as objetos,
          count(*) filter (where (select count(*) from bulto_contenido c where c.bulto_id = b.id) > 1)::int as mezclados,
          count(*) filter (where b.packaging in ('palet', 'optimizado') and exists (
              select 1 from bulto_contenido c join normas n
                  on n.modelo_id = c.modelo_id and n.packaging = b.packaging
               where c.bulto_id = b.id and n.cantidad <> b.cantidad
                 and (select count(*) from bulto_contenido c2 where c2.bulto_id = b.id) = 1
          ))::int as fuera_de_norma,
          extract(epoch from now() - min(b.creado_en) filter (where b.estado = 'sin_ubicar'))
            / 86400 as sin_ubicar_dias
          from bultos b
         where b.estado in ('ubicado', 'sin_ubicar')
      `) as unknown as Promise<
        Array<{
          ubicados: number;
          sin_ubicar: number;
          objetos: number;
          mezclados: number;
          fuera_de_norma: number;
          sin_ubicar_dias: number | string | null;
        }>
      >,

      db.execute(sql`
        select tipo,
               count(*) filter (where creado_en >= date_trunc('day', now() at time zone 'America/Argentina/Buenos_Aires') at time zone 'America/Argentina/Buenos_Aires')::int as hoy,
               count(*)::int as semana
          from movimientos
         where anulado_en is null and creado_en >= now() - interval '7 days'
         group by tipo
      `) as unknown as Promise<Array<{ tipo: string; hoy: number; semana: number }>>,

      db.execute(sql`
        select
          (select count(*) from lineas where activa)::int as lineas,
          (select count(*) from modelos where activo)::int as modelos,
          (select count(*) from grupos where activo)::int as grupos,
          (select count(*) from usuarios where activo)::int as usuarios,
          (select count(*) from exclusiones where levantada_en is null)::int as exclusiones,
          (select count(*) from niveles n join grupos g on g.id = n.grupo_id
            where g.activo and not n.alcanzable)::int as niveles_sin_alcance,
          ((select count(*) from grupos where activo and empresa_id is null)
            + (select count(*) from modelos where activo and empresa_id is null))::int as sin_empresa
      `) as unknown as Promise<Array<Record<string, number>>>,
    ]);

  // Los niveles se agrupan por NOMBRE: el piso de un grupo de 3 y el de uno de
  // 4 son el mismo piso para quien maneja el clark.
  const porNombre = new Map<string, NivelEnTablero>();
  for (const n of niveles) {
    const nombre = nombreDeNivel(n.nivel, n.niveles);
    const orden = nombre === "piso" ? 0 : nombre === "arriba" ? 99 : n.nivel;
    const actual = porNombre.get(nombre) ?? { nombre, orden, total: 0, ocupadas: 0, libres: 0 };
    actual.total += n.total;
    actual.ocupadas += n.ocupadas;
    actual.libres += n.libres;
    porNombre.set(nombre, actual);
  }

  const b = bultos[0];
  const m = maestros[0];

  return {
    grupos: grupos.map((g) => ({
      id: g.id,
      codigo: g.codigo,
      nombre: g.nombre,
      empresa: g.empresa,
      total: g.total,
      ocupadas: g.ocupadas,
      tapadas: g.tapadas,
      libres: g.libres,
      fueraDeUso: g.fuera,
      objetos: g.objetos,
      ajenos: g.ajenos,
    })),
    niveles: [...porNombre.values()].sort((a, c) => a.orden - c.orden),
    lineas: lineas.map((l) => ({
      id: l.id,
      nombre: l.nombre,
      unidadPlural: l.unidad_plural,
      bultos: l.bultos,
      unidades: l.unidades,
      modelosConStock: l.modelos_con_stock,
      porPackaging: Object.fromEntries(
        porPackaging
          .filter((p) => p.linea_id === l.id)
          .map((p) => [p.packaging, { bultos: p.bultos, unidades: p.unidades }]),
      ),
    })),
    modelos: modelos.map((x) => ({
      id: x.id,
      nombre: x.nombre,
      linea: x.linea,
      empresa: x.empresa,
      unidadPlural: x.unidad_plural,
      bultos: x.bultos,
      unidades: x.unidades,
    })),
    empresas: empresas.map((e) => ({
      nombre: e.nombre,
      posiciones: e.posiciones,
      ocupadas: e.ocupadas,
      bultosPropios: e.bultos_propios,
      afuera: e.afuera,
    })),
    bultos: {
      ubicados: b.ubicados,
      sinUbicar: b.sin_ubicar,
      objetos: b.objetos,
      mezclados: b.mezclados,
      fueraDeNorma: b.fuera_de_norma,
      sinUbicarMasViejoDias: b.sin_ubicar_dias == null ? null : Number(b.sin_ubicar_dias),
    },
    actividad: {
      hoy: Object.fromEntries(actividad.map((a) => [a.tipo, a.hoy])),
      semana: Object.fromEntries(actividad.map((a) => [a.tipo, a.semana])),
    },
    maestros: {
      lineas: m.lineas,
      modelos: m.modelos,
      grupos: m.grupos,
      usuarios: m.usuarios,
      exclusiones: m.exclusiones,
      nivelesSinAlcance: m.niveles_sin_alcance,
      sinEmpresa: m.sin_empresa,
    },
  };
}
