import "server-only";
import { sql } from "drizzle-orm";
import type { Packaging } from "../db/schema";
import { validarDescripcion, type LineaContenido } from "../bultos";
import { porQueNoSeUsa } from "../uso";
import {
  aplicarMovimiento,
  bloquearPosicion,
  crearBulto,
  exigirAltura,
  exigirComposicion,
  exigirLibre,
  type Encaje,
  type PosicionVivo,
  type Tx,
} from "./motor";
import { ErrorDeNegocio, fallar } from "./comun";
import { estadoDeCarga } from "../carga";

/**
 * La CARGA INICIAL de un grupo: el inventario de lo que ya estaba en el rack
 * cuando se empezó a usar la app. Ver DISENO.md §4.3.
 *
 * Por qué no es un `meter` ni un `ajuste`:
 * - Como ingreso, las estadísticas dirían que el primer día entraron cientos de
 *   palets que ya estaban, y la antigüedad del stock arrancaría en cero.
 * - Como ajuste, parecería que el primer mes hubo cientos de errores, y la
 *   precisión de control y la confiabilidad arrancarían destruidas.
 *
 * Cómo funciona:
 * - El admin la ABRE por grupo. Mientras está abierta, el autoelevador no ve el
 *   grupo como destino: el inventario no se cuenta mientras cambia.
 * - Control la RECORRE posición por posición: "vacía", o qué hay. Cada bulto
 *   se escribe como un movimiento `inicial`, que suma al stock como un ingreso.
 * - El bulto nace VERIFICADO: quien lo carga lo está contando parado enfrente,
 *   y eso es un chequeo. Y nace con su FECHA DE INGRESO real (o aproximada),
 *   así la antigüedad del stock es verdad desde el primer día.
 * - Se registra LO QUE HAY. Por eso no se le exige al paso lo que se le exige a
 *   un ingreso: que el clark llegue al hueco, que el de adelante no tape, que
 *   la posición no esté excluida o que el palet entre en la altura. Si algo de
 *   eso no cierra, se carga igual y se avisa: el dato a revisar es el de las
 *   medidas, no el palet que está ahí.
 * - Un error se DESHACE: el movimiento queda anulado -nada se borra- y la
 *   posición vuelve a pendiente.
 * - Se CIERRA, y desde ahí el grupo se opera como cualquier otro.
 *
 * Una posición está RELEVADA si se la chequeó después de abrir la carga: las
 * dos cosas que hace la carga -cargar y confirmar vacía- la dejan chequeada.
 */

/** La posición, bloqueada, y la exigencia de que su grupo esté en carga. */
async function posicionEnCarga(tx: Tx, posicionId: number): Promise<PosicionVivo & { desde: Date }> {
  const pos = await bloquearPosicion(tx, posicionId);
  if (!pos.cargaInicial) fallar(`El grupo de ${pos.codigo} no tiene la carga inicial abierta.`);
  if (pos.cargaInicial.cerrada) {
    fallar(`La carga inicial del grupo de ${pos.codigo} ya está cerrada. Desde acá se opera como siempre.`);
  }
  return { ...pos, desde: pos.cargaInicial.desde };
}

/** Deja la posición chequeada AHORA: es lo que la marca como relevada. */
async function marcarRelevada(tx: Tx, posicionId: number, ahora: Date) {
  await tx.execute(sql`
    update posiciones
       set chequeado_en = ${ahora.toISOString()},
           chequeos_ok = chequeos_ok + 1,
           chequeos_total = chequeos_total + 1
     where id = ${posicionId}
  `);
}

export async function abrirCarga(tx: Tx, grupoId: number): Promise<void> {
  const [g] = (await tx.execute(sql`
    select codigo, activo, carga_inicial_desde, carga_inicial_cerrada_en
      from grupos where id = ${grupoId} for update
  `)) as unknown as Array<{
    codigo: string;
    activo: boolean;
    carga_inicial_desde: string | null;
    carga_inicial_cerrada_en: string | null;
  }>;
  if (!g) fallar("Ese grupo no existe.");
  if (!g.activo) fallar(`El grupo ${g.codigo} está inactivo. Activalo primero.`);
  const estado = estadoDeCarga({
    cargaInicialDesde: g.carga_inicial_desde,
    cargaInicialCerradaEn: g.carga_inicial_cerrada_en,
  });
  if (estado === "en_curso") fallar(`La carga inicial del grupo ${g.codigo} ya está abierta.`);
  if (estado === "cerrada") {
    fallar(`La carga inicial del grupo ${g.codigo} ya se hizo y se cerró. Lo que falte se ingresa como siempre.`);
  }
  await tx.execute(sql`update grupos set carga_inicial_desde = now() where id = ${grupoId}`);
}

export type Carga = {
  posicionId: number;
  packaging: Packaging;
  contenido: LineaContenido[];
  descripcion?: string | null;
  /** Cuándo entró al rack, aunque sea aproximado. No puede ser futura. */
  fechaIngreso: Date;
  nota?: string | null;
  usuario: { id: number; nombre: string };
};

/**
 * Carga lo que hay en una posición. Devuelve los avisos de lo que no cerró
 * con las medidas, para que control los vea y alguien revise los datos.
 */
export async function cargarPosicion(
  tx: Tx,
  c: Carga,
): Promise<{ codigo: string; avisos: string[] }> {
  const pos = await posicionEnCarga(tx, c.posicionId);
  exigirLibre(pos);

  const objeto = c.packaging === "objeto";
  if (!objeto && c.contenido.length === 0) fallar("Elegí al menos un modelo.");
  exigirComposicion(c.packaging, c.contenido);
  if (objeto) {
    const problema = validarDescripcion(c.descripcion);
    if (problema) fallar(problema);
  }
  if (c.fechaIngreso.getTime() > Date.now() + 60_000) {
    fallar("La fecha de ingreso no puede ser futura.");
  }

  const avisos: string[] = [];
  const fueraDeUso = porQueNoSeUsa(pos);
  if (fueraDeUso) avisos.push(`${pos.codigo} figura ${fueraDeUso.startsWith("fuera") ? "" : "con "}${fueraDeUso}.`);

  // La altura: si el palet está ahí, entra. Si las medidas dicen que no, se
  // carga sin marcar invasión y se avisa: lo que hay que revisar es la medida.
  let encaje: Encaje = { invadeArriba: false };
  try {
    encaje = await exigirAltura(tx, pos, { packaging: c.packaging, contenido: c.contenido });
  } catch (e) {
    if (!(e instanceof ErrorDeNegocio)) throw e;
    avisos.push(`Según las medidas cargadas no entraría (${e.message}) Revisá la altura del nivel o de la norma.`);
  }

  const ahora = new Date();
  const nuevo = await crearBulto(tx, { packaging: c.packaging, estado: "ubicado", usuarioId: c.usuario.id });
  await aplicarMovimiento(tx, {
    tipo: "inicial",
    bulto: {
      id: nuevo.id,
      codigo: nuevo.codigo,
      packaging: c.packaging,
      cantidad: 0,
      estado: "ubicado",
      posicionId: null,
      posicionCodigo: null,
      contenido: [],
      lineaCodigo: "",
    },
    contenidoDespues: c.contenido,
    packagingDespues: c.packaging,
    estadoDespues: "ubicado",
    posicionDestino: { id: pos.id, codigo: pos.codigo },
    invadeArriba: encaje.invadeArriba ? encaje.arriba : null,
    usuario: c.usuario,
    nota: c.nota ?? null,
    descripcionDespues: objeto ? c.descripcion!.trim() : null,
    // El chequeo lo pone la carga misma, abajo.
    conservarChequeo: true,
  });

  // Nace verificado y con su fecha real de ingreso.
  await tx.execute(sql`
    update bultos
       set creado_en = ${c.fechaIngreso.toISOString()},
           chequeado_en = ${ahora.toISOString()},
           chequeos_ok = 1,
           chequeos_total = 1
     where id = ${nuevo.id}
  `);
  await marcarRelevada(tx, pos.id, ahora);
  return { codigo: nuevo.codigo, avisos };
}

/** No hay nada en la posición: queda relevada y verificada como vacía. */
export async function confirmarVacia(tx: Tx, posicionId: number): Promise<void> {
  const pos = await posicionEnCarga(tx, posicionId);
  if (pos.ocupante) {
    fallar(`${pos.codigo} tiene cargado el bulto ${pos.ocupante.codigo}. Si no está, deshacé esa carga primero.`);
  }
  await marcarRelevada(tx, pos.id, new Date());
}

/**
 * Lo que el sistema ya tenía en la posición -cargado antes de abrir la carga-
 * está y coincide: la posición queda relevada y el bulto, verificado. Si no
 * coincide, se corrige desde control como siempre.
 */
export async function confirmarExistente(tx: Tx, posicionId: number): Promise<void> {
  const pos = await posicionEnCarga(tx, posicionId);
  if (!pos.ocupante) fallar(`${pos.codigo} no tiene nada cargado: marcala vacía o cargá lo que hay.`);
  const ahora = new Date();
  await tx.execute(sql`
    update bultos
       set chequeado_en = ${ahora.toISOString()},
           chequeos_ok = chequeos_ok + 1,
           chequeos_total = chequeos_total + 1
     where id = ${pos.ocupante.id}
  `);
  await marcarRelevada(tx, pos.id, ahora);
}

/**
 * Deshace lo que se cargó en una posición durante la carga, para volver a
 * cargarla. El movimiento queda ANULADO -el error también es un dato- y el
 * bulto deja de ser stock. Así el historial sigue dando el stock vivo.
 */
export async function deshacerPosicion(
  tx: Tx,
  posicionId: number,
  usuario: { id: number; nombre: string },
): Promise<void> {
  const pos = await posicionEnCarga(tx, posicionId);

  if (pos.ocupante) {
    const [mov] = (await tx.execute(sql`
      select id from movimientos
       where bulto_id = ${pos.ocupante.id} and tipo = 'inicial' and anulado_en is null
       order by id desc limit 1
    `)) as unknown as Array<{ id: number }>;
    const [otros] = (await tx.execute(sql`
      select count(*)::int as n from movimientos
       where bulto_id = ${pos.ocupante.id} and tipo <> 'inicial' and anulado_en is null
    `)) as unknown as Array<{ n: number }>;
    if (!mov || otros.n > 0) {
      fallar(
        `${pos.ocupante.codigo} no se cargó en la carga inicial o ya tuvo otros movimientos. ` +
          `Se corrige como siempre, desde control.`,
      );
    }
    await tx.execute(sql`
      update movimientos
         set anulado_en = now(), anulado_por = ${usuario.id},
             motivo_anulacion = 'Corrección de la carga inicial'
       where id = ${mov.id}
    `);
    await tx.execute(sql`
      update bultos set estado = 'salido', posicion_id = null where id = ${pos.ocupante.id}
    `);
    await tx.execute(sql`
      update posiciones set bloqueada_por_bulto_id = null where bloqueada_por_bulto_id = ${pos.ocupante.id}
    `);
  }

  // Vuelve a pendiente: se le saca el chequeo que le puso la carga.
  await tx.execute(sql`
    update posiciones
       set chequeado_en = null,
           chequeos_ok = greatest(chequeos_ok - 1, 0),
           chequeos_total = greatest(chequeos_total - 1, 0)
     where id = ${pos.id} and chequeado_en >= ${pos.desde.toISOString()}
  `);
}

/** Cierra la carga. Lo que quedó sin relevar queda como estaba: sin chequear. */
export async function cerrarCarga(
  tx: Tx,
  grupoId: number,
  usuarioId: number,
): Promise<{ relevadas: number; pendientes: number; bultos: number }> {
  const [g] = (await tx.execute(sql`
    select codigo, carga_inicial_desde, carga_inicial_cerrada_en
      from grupos where id = ${grupoId} for update
  `)) as unknown as Array<{
    codigo: string;
    carga_inicial_desde: string | null;
    carga_inicial_cerrada_en: string | null;
  }>;
  if (!g) fallar("Ese grupo no existe.");
  const estado = estadoDeCarga({
    cargaInicialDesde: g.carga_inicial_desde,
    cargaInicialCerradaEn: g.carga_inicial_cerrada_en,
  });
  if (estado !== "en_curso") fallar(`El grupo ${g.codigo} no tiene la carga inicial abierta.`);

  const [r] = (await tx.execute(sql`
    select
      count(*) filter (where p.chequeado_en >= ${g.carga_inicial_desde})::int as relevadas,
      count(*) filter (where p.chequeado_en is null or p.chequeado_en < ${g.carga_inicial_desde})::int as pendientes,
      (select count(*)::int from movimientos m
         join posiciones px on px.id = m.posicion_hasta_id
        where px.grupo_id = ${grupoId} and m.tipo = 'inicial' and m.anulado_en is null) as bultos
      from posiciones p
     where p.grupo_id = ${grupoId} and p.activa
  `)) as unknown as Array<{ relevadas: number; pendientes: number; bultos: number }>;

  await tx.execute(sql`
    update grupos set carga_inicial_cerrada_en = now(), carga_inicial_cerrada_por = ${usuarioId}
     where id = ${grupoId}
  `);
  return r;
}
