import "server-only";
import { sql } from "drizzle-orm";
import { db } from "./db";
import type { Tx } from "./acciones/motor";
import { fallar } from "./acciones/comun";
import { PLANO_VACIO, esquemaPlano, problemaDelPlano, type Plano } from "./plano";
import { tablero } from "./tablero";
import type { InfoDeGrupo } from "../components/plano-dibujo";

export type PlanoVigente = {
  /** `null` si nunca se guardó: el plano arranca vacío. */
  version: number | null;
  plano: Plano;
  guardadoEn: Date | null;
  guardadoPor: string | null;
};

/** El plano vigente: la última versión guardada. */
export async function planoVigente(): Promise<PlanoVigente> {
  const [f] = (await db.execute(sql`
    select p.id, p.doc, p.creado_en, u.nombre
      from planos p left join usuarios u on u.id = p.creado_por
     order by p.id desc limit 1
  `)) as unknown as Array<{ id: number; doc: Plano; creado_en: string | Date; nombre: string | null }>;
  if (!f) return { version: null, plano: PLANO_VACIO, guardadoEn: null, guardadoPor: null };
  return {
    version: f.id,
    plano: f.doc,
    guardadoEn: new Date(f.creado_en),
    guardadoPor: f.nombre,
  };
}

/**
 * Guarda una versión nueva.
 *
 * `base` es la versión sobre la que se editó. Si mientras tanto alguien guardó
 * otra, se rechaza en vez de pisarla: dos personas editando el plano a la vez
 * terminarían con un dibujo que no hizo ninguna de las dos. El bloqueo de la
 * tabla hace que dos guardados simultáneos no pasen los dos el control.
 */
export async function guardarVersion(
  tx: Pick<Tx, "execute">,
  entrada: unknown,
  base: number | null,
  usuarioId: number,
): Promise<number> {
  const resultado = esquemaPlano.safeParse(entrada);
  if (!resultado.success) {
    fallar(resultado.error.issues[0]?.message ?? "El plano tiene datos inválidos.");
  }
  const plano = resultado.data as Plano;
  const problema = problemaDelPlano(plano);
  if (problema) fallar(problema);

  await tx.execute(sql`lock table planos in exclusive mode`);
  const [ultima] = (await tx.execute(sql`
    select max(id) as id from planos
  `)) as unknown as Array<{ id: number | null }>;
  if ((ultima?.id ?? null) !== base) {
    fallar(
      "Alguien guardó otra versión del plano mientras editabas. Recargá la página " +
        "para ver la última; lo tuyo sin guardar se pierde.",
    );
  }

  const [nueva] = (await tx.execute(sql`
    insert into planos (doc, creado_por) values (${JSON.stringify(plano)}::jsonb, ${usuarioId})
    returning id
  `)) as unknown as Array<{ id: number }>;
  return nueva.id;
}

/**
 * Lo que el plano muestra de cada grupo: código y ocupación. Sale del tablero,
 * con la misma cuenta -sobre posiciones útiles- para que el plano y el tablero
 * no digan dos números distintos.
 */
export async function gruposParaPlano(): Promise<
  Array<{ id: number; codigo: string; nombre: string | null; info: InfoDeGrupo }>
> {
  const t = await tablero();
  return t.grupos.map((g) => {
    const utiles = g.ocupadas + g.tapadas + g.libres;
    const ocupacion = utiles > 0 ? Math.round(((g.ocupadas + g.tapadas) / utiles) * 100) : null;
    return {
      id: g.id,
      codigo: g.codigo,
      nombre: g.nombre,
      info: {
        codigo: g.codigo,
        ocupacion,
        detalle:
          `${g.empresa ? `${g.empresa} · ` : ""}` +
          (ocupacion != null ? `${ocupacion}% ocupado · ${g.libres} libres` : "sin posiciones útiles"),
      },
    };
  });
}
