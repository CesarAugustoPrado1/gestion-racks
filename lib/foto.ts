import "server-only";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { alcanzable, joinExclusion } from "./uso-sql";
import { nombreDeNivel } from "./posiciones";
import { TRAMOS_ANTIGUEDAD, tramoDeAntiguedad } from "./estadisticas-calculo";
import type { Calidad, Packaging } from "./db/schema";

/**
 * La FOTO del stock en un instante: qué había, dónde, de qué categoría y desde
 * cuándo. Es lo que muestra el Resumen, para ahora o para cualquier momento
 * pasado.
 *
 * CÓMO SE RECONSTRUYE EL PASADO. Cada movimiento guarda cómo quedó el bulto
 * DESPUÉS: cantidad, packaging, categoría, posición y el contenido modelo por
 * modelo. Entonces el estado de un bulto en el instante T es su último
 * movimiento vigente antes de T, y la foto es eso para todos los bultos. Los
 * anulados no cuentan: la foto muestra lo que hoy sabemos que pasó.
 *
 * Para AHORA da lo mismo que el estado vivo: lo comprueba un test.
 *
 * LO QUE NO TIENE HISTORIA, y por eso se toma como está hoy: los racks y sus
 * posiciones, el alcance del clark, la lista de exclusión y las empresas. Una
 * foto vieja usa la configuración de hoy para decir cuánto lugar había. Lo
 * mismo la confiabilidad: la carga inicial verifica sin dejar fila de chequeo,
 * así que en el pasado no se puede rehacer con exactitud y solo se muestra la
 * de ahora.
 *
 * REGLA DE UNIDADES, igual que en todo el sistema: las líneas se cuentan en
 * unidades distintas y no se suman entre sí. Entre líneas se suman bultos.
 */

export type StockDeLinea = {
  id: number;
  nombre: string;
  unidadPlural: string;
  unidades: number;
  bultos: number;
  modelosConStock: number;
  /** `m2` falta en las fotos guardadas antes de que se agregara. */
  porPackaging: Partial<Record<Packaging, { bultos: number; unidades: number; m2?: number }>>;
  segunda: { bultos: number; unidades: number; m2?: number };
  /** m² de lo que tiene medida, y cuántas unidades quedaron sin medir. */
  m2: number;
  unidadesSinM2: number;
};

export type StockDeModelo = {
  id: number;
  nombre: string;
  lineaId: number;
  linea: string;
  empresa: string | null;
  unidadPlural: string;
  bultos: number;
  unidades: number;
  segunda: number;
  /** Null si el modelo no tiene m² por unidad. */
  m2: number | null;
};

export type GrupoEnFoto = {
  id: number;
  codigo: string;
  nombre: string | null;
  empresa: string | null;
  ocupadas: number;
  /** Tomadas por un bulto alto de abajo. Solo se sabe para ahora. */
  tapadas: number;
  libres: number;
  fueraDeUso: number;
  objetos: number;
  ajenos: number;
};

export type Foto = {
  instante: Date;
  esAhora: boolean;
  /** Si hay movimientos antes de este instante: antes del primero, la foto está vacía. */
  hayHistoria: boolean;
  /**
   * El stock en m², sumando todas las líneas: lo único que se puede sumar entre
   * líneas además de los bultos. Lo de modelos sin medir queda afuera y se
   * cuenta aparte, para que nadie lea un total incompleto como completo.
   */
  m2: { total: number; modelosSinMedir: string[]; /** Falta en fotos viejas. */ segunda?: number };
  lineas: StockDeLinea[];
  modelos: StockDeModelo[];
  grupos: GrupoEnFoto[];
  niveles: Array<{ nombre: string; orden: number; ocupadas: number; libres: number }>;
  empresas: Array<{ nombre: string; posiciones: number; ocupadas: number; bultosPropios: number; afuera: number }>;
  bultos: {
    /** Bultos de producto en stock (sin objetos). */
    enStock: number;
    ubicados: number;
    sinUbicar: number;
    objetos: number;
    mezclados: number;
    segunda: number;
    ajenos: number;
    sinUbicarMasViejoDias: number | null;
  };
  antiguedad: {
    tramos: Array<{ tramo: string; bultos: number }>;
    masViejos: Array<{ id: number; codigo: string; contenido: string; ubicacion: string | null; dias: number }>;
    /** Mediana de días en el rack de lo que hay. */
    mediana: number | null;
  };
};

type FilaBulto = {
  id: number;
  codigo: string;
  nacio: Date | string;
  packaging: Packaging;
  calidad: Calidad;
  posicion_id: number | null;
};

/** La conexión se puede pasar para probarla contra la base de los tests. */
export async function fotoEn(
  instante: Date,
  esAhora: boolean,
  conexion: Pick<typeof db, "execute"> = db,
): Promise<Foto> {
  const t = instante.toISOString();

  const [bultos, contenido, posiciones, modelos, lineas, empresas, historia] = await Promise.all([
    /**
     * El último movimiento vigente de cada bulto antes de T. Si ese movimiento
     * fue un egreso total, el bulto ya no estaba. `posicion_hasta` es dónde
     * quedó: `null` es sin ubicar.
     */
    conexion.execute(sql`
      with ultimo as (
        select distinct on (m.bulto_id) m.id, m.bulto_id, m.tipo, m.cantidad, m.packaging,
               m.calidad, m.posicion_hasta_id
          from movimientos m
         where m.anulado_en is null and m.creado_en < ${t}
         order by m.bulto_id, m.creado_en desc, m.id desc
      )
      select b.id, b.codigo, b.creado_en as nacio, u.packaging, u.calidad,
             u.posicion_hasta_id as posicion_id, u.id as movimiento_id
        from ultimo u join bultos b on b.id = u.bulto_id
       where not (u.tipo = 'sacar' and u.cantidad = 0)
    `) as unknown as Promise<Array<FilaBulto & { movimiento_id: number }>>,

    conexion.execute(sql`
      with ultimo as (
        select distinct on (m.bulto_id) m.id, m.bulto_id, m.tipo, m.cantidad
          from movimientos m
         where m.anulado_en is null and m.creado_en < ${t}
         order by m.bulto_id, m.creado_en desc, m.id desc
      )
      select u.bulto_id, ml.modelo_id, ml.cantidad
        from ultimo u join movimiento_lineas ml on ml.movimiento_id = u.id
       where not (u.tipo = 'sacar' and u.cantidad = 0) and ml.cantidad > 0
    `) as unknown as Promise<Array<{ bulto_id: number; modelo_id: number; cantidad: number }>>,

    conexion.execute(sql`
      select p.id, p.nivel, g.id as grupo_id, g.codigo as grupo_codigo, g.nombre as grupo_nombre,
             g.niveles, g.orden as grupo_orden, g.empresa_id, e.nombre as empresa,
             (${alcanzable("p")} and ex.id is null) as usable,
             p.bloqueada_por_bulto_id is not null as tapada,
             p.codigo
        from posiciones p
        join grupos g on g.id = p.grupo_id
        left join empresas e on e.id = g.empresa_id
        ${joinExclusion("p", "ex")}
       where p.activa and g.activo
    `) as unknown as Promise<
      Array<{
        id: number;
        nivel: number;
        grupo_id: number;
        grupo_codigo: string;
        grupo_nombre: string | null;
        niveles: number;
        grupo_orden: number;
        empresa_id: number | null;
        empresa: string | null;
        usable: boolean;
        tapada: boolean;
        codigo: string;
      }>
    >,

    conexion.execute(sql`
      select m.id, m.nombre, m.linea_id, m.empresa_id, e.nombre as empresa, m.orden,
             m.m2_por_unidad::float8 as m2
        from modelos m left join empresas e on e.id = m.empresa_id
    `) as unknown as Promise<
      Array<{
        id: number;
        nombre: string;
        linea_id: number;
        empresa_id: number | null;
        empresa: string | null;
        orden: number;
        m2: number | null;
      }>
    >,

    conexion.execute(sql`
      select id, nombre, unidad_plural, orden from lineas where activa order by orden
    `) as unknown as Promise<Array<{ id: number; nombre: string; unidad_plural: string; orden: number }>>,

    conexion.execute(sql`
      select id, nombre from empresas where activa order by orden, nombre
    `) as unknown as Promise<Array<{ id: number; nombre: string }>>,

    conexion.execute(sql`
      select exists (select 1 from movimientos where anulado_en is null and creado_en < ${t}) as hay
    `) as unknown as Promise<Array<{ hay: boolean }>>,
  ]);

  const modeloPorId = new Map(modelos.map((m) => [m.id, m]));
  const lineaPorId = new Map(lineas.map((l) => [l.id, l]));
  const posPorId = new Map(posiciones.map((p) => [p.id, p]));
  const contenidoDe = new Map<number, Array<{ modeloId: number; cantidad: number }>>();
  for (const c of contenido) {
    const lista = contenidoDe.get(c.bulto_id) ?? [];
    lista.push({ modeloId: c.modelo_id, cantidad: c.cantidad });
    contenidoDe.set(c.bulto_id, lista);
  }

  // Por línea y por modelo.
  const porLinea = new Map<number, StockDeLinea>();
  for (const l of lineas) {
    porLinea.set(l.id, {
      id: l.id,
      nombre: l.nombre,
      unidadPlural: l.unidad_plural,
      unidades: 0,
      bultos: 0,
      modelosConStock: 0,
      porPackaging: {},
      segunda: { bultos: 0, unidades: 0, m2: 0 },
      m2: 0,
      unidadesSinM2: 0,
    });
  }
  const porModelo = new Map<number, StockDeModelo>();
  const modelosPorLinea = new Map<number, Set<number>>();

  const cuenta = {
    ubicados: 0,
    sinUbicar: 0,
    objetos: 0,
    mezclados: 0,
    segunda: 0,
    ajenos: 0,
  };
  const ocupadasPorPos = new Map<number, { objeto: boolean; ajeno: boolean }>();
  const edades: Array<{ id: number; codigo: string; contenido: string; ubicacion: string | null; dias: number }> = [];
  let sinUbicarMasViejo: number | null = null;
  const propiosPorEmpresa = new Map<number, number>();
  const afueraPorEmpresa = new Map<number, number>();

  for (const b of bultos) {
    const objeto = b.packaging === "objeto";
    const pos = b.posicion_id != null ? posPorId.get(b.posicion_id) : undefined;
    const ubicado = b.posicion_id != null;
    const lineasDelBulto = contenidoDe.get(b.id) ?? [];
    const dias = Math.max(0, (instante.getTime() - new Date(b.nacio).getTime()) / 86_400_000);

    const empresasDelBulto = new Set(
      lineasDelBulto.map((c) => modeloPorId.get(c.modeloId)?.empresa_id).filter((x): x is number => x != null),
    );
    const ajeno =
      ubicado && pos?.empresa_id != null && [...empresasDelBulto].some((e) => e !== pos.empresa_id);

    if (ubicado && b.posicion_id != null) ocupadasPorPos.set(b.posicion_id, { objeto, ajeno });

    if (objeto) {
      cuenta.objetos++;
      continue;
    }

    if (ubicado) cuenta.ubicados++;
    else {
      cuenta.sinUbicar++;
      sinUbicarMasViejo = Math.max(sinUbicarMasViejo ?? 0, dias);
    }
    if (lineasDelBulto.length > 1) cuenta.mezclados++;
    if (b.calidad === "segunda") cuenta.segunda++;
    if (ajeno) cuenta.ajenos++;
    for (const e of empresasDelBulto) {
      propiosPorEmpresa.set(e, (propiosPorEmpresa.get(e) ?? 0) + 1);
      if (ubicado && pos?.empresa_id != null && pos.empresa_id !== e) {
        afueraPorEmpresa.set(e, (afueraPorEmpresa.get(e) ?? 0) + 1);
      }
    }

    edades.push({
      id: b.id,
      codigo: b.codigo,
      contenido: lineasDelBulto
        .map((c) => `${modeloPorId.get(c.modeloId)?.nombre ?? "?"} ${c.cantidad}`)
        .join(" + "),
      ubicacion: pos ? `${pos.grupo_codigo}-${pos.codigo}` : null,
      dias,
    });

    const lineasTocadas = new Set<number>();
    for (const c of lineasDelBulto) {
      const m = modeloPorId.get(c.modeloId);
      if (!m) continue;
      const l = porLinea.get(m.linea_id);
      if (!l) continue;
      l.unidades += c.cantidad;
      const pk = (l.porPackaging[b.packaging] ??= { bultos: 0, unidades: 0, m2: 0 });
      pk.unidades += c.cantidad;
      if (b.calidad === "segunda") l.segunda.unidades += c.cantidad;
      if (m.m2 != null) {
        const metros = c.cantidad * m.m2;
        l.m2 += metros;
        pk.m2 = (pk.m2 ?? 0) + metros;
        if (b.calidad === "segunda") l.segunda.m2 = (l.segunda.m2 ?? 0) + metros;
      } else l.unidadesSinM2 += c.cantidad;
      if (!lineasTocadas.has(l.id)) {
        lineasTocadas.add(l.id);
        l.bultos++;
        pk.bultos++;
        if (b.calidad === "segunda") l.segunda.bultos++;
      }
      (modelosPorLinea.get(l.id) ?? modelosPorLinea.set(l.id, new Set()).get(l.id)!).add(m.id);

      const linea = lineaPorId.get(m.linea_id)!;
      const pm = porModelo.get(m.id) ?? {
        id: m.id,
        nombre: m.nombre,
        lineaId: m.linea_id,
        linea: linea.nombre,
        empresa: m.empresa,
        unidadPlural: linea.unidad_plural,
        bultos: 0,
        unidades: 0,
        segunda: 0,
        m2: m.m2 == null ? null : 0,
      };
      pm.bultos++;
      pm.unidades += c.cantidad;
      if (pm.m2 != null && m.m2 != null) pm.m2 += c.cantidad * m.m2;
      if (b.calidad === "segunda") pm.segunda += c.cantidad;
      porModelo.set(m.id, pm);
    }
  }
  for (const [lid, set] of modelosPorLinea) {
    const l = porLinea.get(lid);
    if (l) l.modelosConStock = set.size;
  }

  // Lugar: por grupo, por nivel y por empresa.
  const grupos = new Map<number, GrupoEnFoto & { orden: number }>();
  const niveles = new Map<string, { nombre: string; orden: number; ocupadas: number; libres: number }>();
  const lugarPorEmpresa = new Map<number, { posiciones: number; ocupadas: number }>();
  for (const p of posiciones) {
    const g =
      grupos.get(p.grupo_id) ??
      grupos
        .set(p.grupo_id, {
          id: p.grupo_id,
          codigo: p.grupo_codigo,
          nombre: p.grupo_nombre,
          empresa: p.empresa,
          orden: p.grupo_orden,
          ocupadas: 0,
          tapadas: 0,
          libres: 0,
          fueraDeUso: 0,
          objetos: 0,
          ajenos: 0,
        })
        .get(p.grupo_id)!;
    const ocupante = ocupadasPorPos.get(p.id);
    const nombre = nombreDeNivel(p.nivel, p.niveles);
    const nivel =
      niveles.get(nombre) ??
      niveles
        .set(nombre, { nombre, orden: p.nivel, ocupadas: 0, libres: 0 })
        .get(nombre)!;
    if (p.empresa_id != null) {
      const e = lugarPorEmpresa.get(p.empresa_id) ?? { posiciones: 0, ocupadas: 0 };
      e.posiciones++;
      if (ocupante) e.ocupadas++;
      lugarPorEmpresa.set(p.empresa_id, e);
    }
    if (ocupante) {
      g.ocupadas++;
      nivel.ocupadas++;
      if (ocupante.objeto) g.objetos++;
      if (ocupante.ajeno) g.ajenos++;
    } else if (esAhora && p.tapada) {
      g.tapadas++;
    } else if (p.usable) {
      g.libres++;
      nivel.libres++;
    } else {
      g.fueraDeUso++;
    }
  }

  // Antigüedad.
  const conteoTramos = new Map<string, number>();
  for (const e of edades) {
    const tramo = tramoDeAntiguedad(e.dias);
    conteoTramos.set(tramo, (conteoTramos.get(tramo) ?? 0) + 1);
  }
  const ordenadas = edades.map((e) => e.dias).sort((a, c) => a - c);
  const mitad = Math.floor(ordenadas.length / 2);

  return {
    instante,
    esAhora,
    hayHistoria: historia[0]?.hay ?? false,
    lineas: [...porLinea.values()],
    modelos: [...porModelo.values()].sort(
      (a, c) =>
        (lineaPorId.get(a.lineaId)?.orden ?? 0) - (lineaPorId.get(c.lineaId)?.orden ?? 0) ||
        c.bultos - a.bultos ||
        a.nombre.localeCompare(c.nombre),
    ),
    grupos: [...grupos.values()].sort((a, c) => a.orden - c.orden),
    niveles: [...niveles.values()].sort((a, c) => a.orden - c.orden),
    empresas: empresas.map((e) => ({
      nombre: e.nombre,
      posiciones: lugarPorEmpresa.get(e.id)?.posiciones ?? 0,
      ocupadas: lugarPorEmpresa.get(e.id)?.ocupadas ?? 0,
      bultosPropios: propiosPorEmpresa.get(e.id) ?? 0,
      afuera: afueraPorEmpresa.get(e.id) ?? 0,
    })),
    m2: {
      total: [...porLinea.values()].reduce((s2, l) => s2 + l.m2, 0),
      modelosSinMedir: [...porModelo.values()].filter((m) => m.m2 == null).map((m) => m.nombre),
      segunda: [...porLinea.values()].reduce((s2, l) => s2 + (l.segunda.m2 ?? 0), 0),
    },
    bultos: {
      enStock: cuenta.ubicados + cuenta.sinUbicar,
      ...cuenta,
      sinUbicarMasViejoDias: sinUbicarMasViejo,
    },
    antiguedad: {
      tramos: TRAMOS_ANTIGUEDAD.map((tr) => ({ tramo: tr.etiqueta, bultos: conteoTramos.get(tr.etiqueta) ?? 0 })),
      masViejos: [...edades].sort((a, c) => c.dias - a.dias).slice(0, 10),
      mediana:
        ordenadas.length === 0
          ? null
          : ordenadas.length % 2
            ? ordenadas[mitad]
            : (ordenadas[mitad - 1] + ordenadas[mitad]) / 2,
    },
  };
}
