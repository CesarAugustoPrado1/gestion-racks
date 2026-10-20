import "server-only";
import { sql, type SQL } from "drizzle-orm";

/**
 * La misma regla que `cubre()` en lib/uso.ts, escrita en SQL para que las
 * consultas filtren en la base y no trayendo todo.
 *
 * Son fragmentos para pegar en un FROM, con el alias de la tabla `posiciones`
 * como parámetro. El alias va crudo porque es un identificador, no un valor:
 * nunca viene del usuario, siempre es una constante del código que llama.
 */

/**
 * `left join lateral` con la exclusión vigente que cubre a la posición `p`, si
 * hay. Deja disponibles `<alias>.id`, `<alias>.motivo` y `<alias>.nota`.
 *
 * Si la cubren varias -el grupo entero Y una calle- trae la más vieja: es la
 * que explica desde cuándo está fuera de uso.
 */
export function joinExclusion(p: string, alias = "ex"): SQL {
  return sql.raw(`
    left join lateral (
      select e.id, e.motivo, e.nota
        from exclusiones e
       where e.levantada_en is null
         and e.grupo_id = ${p}.grupo_id
         and (e.posicion_id is null or e.posicion_id = ${p}.id)
         and (e.unidad is null or e.unidad = ${p}.unidad)
         and (e.nivel is null or e.nivel = ${p}.nivel)
       order by e.id
       limit 1
    ) ${alias} on true`);
}

/**
 * Si el clark llega al nivel de la posición `p`. Sin fila de nivel = sí: es el
 * default y lo que pasaba antes de que existiera la columna.
 */
export function alcanzable(p: string): SQL {
  return sql.raw(`coalesce((select n.alcanzable from niveles n
                             where n.grupo_id = ${p}.grupo_id and n.nivel = ${p}.nivel), true)`);
}

/**
 * Las empresas de lo que lleva el bulto `b`, como ids y como texto.
 * `null` si ningún modelo tiene empresa cargada.
 */
export function empresasDelBulto(b: string): { ids: SQL; nombres: SQL } {
  return {
    ids: sql.raw(`(select array_agg(distinct mx.empresa_id)
                     from bulto_contenido cx join modelos mx on mx.id = cx.modelo_id
                    where cx.bulto_id = ${b}.id and mx.empresa_id is not null)`),
    nombres: sql.raw(`(select string_agg(distinct ex2.nombre, ' y ')
                         from bulto_contenido cx join modelos mx on mx.id = cx.modelo_id
                         join empresas ex2 on ex2.id = mx.empresa_id
                        where cx.bulto_id = ${b}.id)`),
  };
}
