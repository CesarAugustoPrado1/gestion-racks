/**
 * Dónde se puede poner un bulto y de quién es. Módulo PURO: lo usan la
 * pantalla, el motor y los tests, sin base.
 *
 * Una posición puede existir y estar libre, y aun así no servir:
 *
 *   FUERA DE ALCANCE   el clark no llega a ese nivel en ese grupo.
 *   EXCLUIDA           está en la lista de exclusión: reparación, reservada,
 *                      lo que sea.
 *
 * Las dos tienen el mismo efecto: no se ofrecen ni se aceptan como destino, lo
 * que ya está adentro se puede sacar, y no cuentan como lugar disponible.
 *
 * La regla de la exclusión está escrita DOS veces: acá (`cubre`) y en SQL
 * (lib/uso-sql.ts). Las dos dicen lo mismo y el test de `cubre` es el que
 * documenta qué significa cada combinación de comodines.
 */

import { nombreDeNivel } from "./posiciones";

export type MotivoExclusion = "decision" | "reparacion" | "otro";

export const ETIQUETA_MOTIVO_EXCLUSION: Record<MotivoExclusion, string> = {
  decision: "Decisión propia",
  reparacion: "Reparación",
  otro: "Otro",
};

export const MOTIVOS_EXCLUSION: MotivoExclusion[] = ["decision", "reparacion", "otro"];

/* -------------------------------------------------------------------------- */
/* Exclusiones                                                                */
/* -------------------------------------------------------------------------- */

export type AlcanceExclusion =
  | "grupo"
  | "unidad"
  | "nivel"
  | "unidad_nivel"
  | "posicion";

/** Una exclusión: las columnas nulas son comodines. */
export type ReglaExclusion = {
  grupoId: number;
  unidad: number | null;
  nivel: number | null;
  posicionId: number | null;
};

export function alcanceDe(e: Omit<ReglaExclusion, "grupoId">): AlcanceExclusion {
  if (e.posicionId != null) return "posicion";
  if (e.unidad != null && e.nivel != null) return "unidad_nivel";
  if (e.unidad != null) return "unidad";
  if (e.nivel != null) return "nivel";
  return "grupo";
}

/**
 * Si la exclusión alcanza a la posición.
 *
 * Cada columna puesta es una condición; cada columna nula, un "cualquiera".
 * Por eso "grupo + nivel 3" excluye el nivel 3 de TODAS las calles, y "grupo +
 * calle 7" excluye TODOS los niveles de la calle 7.
 */
export function cubre(
  e: ReglaExclusion,
  p: { id: number; grupoId: number; unidad: number; nivel: number },
): boolean {
  if (e.grupoId !== p.grupoId) return false;
  if (e.posicionId != null) return e.posicionId === p.id;
  if (e.unidad != null && e.unidad !== p.unidad) return false;
  if (e.nivel != null && e.nivel !== p.nivel) return false;
  return true;
}

/**
 * "Calle 7, nivel medio" o "Todo el grupo". Sin el grupo: quien lo muestra
 * decide si hace falta nombrarlo.
 */
export function describirAlcance(
  e: Omit<ReglaExclusion, "grupoId">,
  g: { penetrable: boolean; niveles: number },
  posicionCodigo?: string | null,
): string {
  const unidad = g.penetrable ? "Calle" : "Módulo";
  const nivel = (n: number) => `nivel ${nombreDeNivel(n, g.niveles)}`;
  switch (alcanceDe(e)) {
    case "posicion":
      return `Posición ${posicionCodigo ?? "?"}`;
    case "unidad_nivel":
      return `${unidad} ${e.unidad}, ${nivel(e.nivel!)}`;
    case "unidad":
      return `${unidad} ${e.unidad} ${g.penetrable ? "entera" : "entero"}`;
    case "nivel":
      return `${nivel(e.nivel!).replace(/^n/, "N")} en todo el grupo`;
    case "grupo":
      return "Todo el grupo";
  }
}

/* -------------------------------------------------------------------------- */
/* Por qué una posición no se puede usar                                      */
/* -------------------------------------------------------------------------- */

export type UsoDePosicion = {
  /** `false` si el clark no llega a ese nivel en ese grupo. */
  alcanzable: boolean;
  exclusion: { motivo: MotivoExclusion; nota: string | null } | null;
};

/**
 * La frase corta que explica por qué no se usa. `null` = se puede usar.
 *
 * Si las dos cosas pasan a la vez, gana la exclusión: es la que alguien cargó a
 * propósito y tiene una nota, mientras que el alcance es un dato del rack.
 */
export function porQueNoSeUsa(u: UsoDePosicion): string | null {
  if (u.exclusion) {
    const m = ETIQUETA_MOTIVO_EXCLUSION[u.exclusion.motivo].toLowerCase();
    return u.exclusion.nota ? `fuera de uso: ${m}, ${u.exclusion.nota}` : `fuera de uso: ${m}`;
  }
  if (!u.alcanzable) return "el clark no llega a este nivel";
  return null;
}

/* -------------------------------------------------------------------------- */
/* Empresas                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Si un bulto está en un rack de otra empresa.
 *
 * Solo opina cuando sabe: un grupo sin empresa asignada, o un bulto cuyos
 * modelos no la tienen, no son "ajenos" -son datos que faltan cargar-, y
 * marcarlos haría que la advertencia aparezca en todos lados el primer día y
 * nadie la lea nunca más.
 *
 * Un bulto mezclado con modelos de las dos empresas es ajeno en cualquier rack
 * que tenga dueño: algo de lo que lleva no es de ahí.
 */
export function esAjeno(
  empresaDelGrupo: number | null,
  empresasDelBulto: Array<number | null>,
): boolean {
  if (empresaDelGrupo == null) return false;
  return empresasDelBulto.some((e) => e != null && e !== empresaDelGrupo);
}

/** "Este palet es de Rustikas y el grupo B es de Pirka." */
export function avisoAjeno(
  bulto: { empresas: string | null },
  grupo: { codigo: string; empresa: string | null },
  sujeto = "Este bulto",
): string {
  return (
    `${sujeto} es de ${bulto.empresas ?? "otra empresa"} y el grupo ` +
    `${grupo.codigo} es de ${grupo.empresa ?? "otra empresa"}.`
  );
}
