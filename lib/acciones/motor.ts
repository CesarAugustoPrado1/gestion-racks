import "server-only";
import { eq, inArray, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  bultoContenido,
  bultos,
  movimientoLineas,
  movimientos,
  posiciones,
  type EstadoBulto,
  type Packaging,
  type TipoMovimiento,
} from "../db/schema";
import { total, validarComposicion, type LineaContenido } from "../bultos";
import { loQueTapa, nombreDeNivel, nombreDeProfundidad } from "../posiciones";
import { fallar } from "./comun";

/**
 * El motor concentra lo que no puede estar disperso: el bloqueo, las
 * validaciones y la escritura del movimiento.
 *
 * Toda operación corre DENTRO de una transacción y EMPIEZA BLOQUEANDO. Es lo
 * que evita que dos autoelevadores con la pantalla abierta manden el mismo
 * bulto a dos lados, o dos bultos a la misma posición: el segundo espera y
 * después falla la validación, con un mensaje que dice qué pasó.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Tx = PgTransaction<any, any, any>;

/* -------------------------------------------------------------------------- */
/* Bloqueos                                                                   */
/* -------------------------------------------------------------------------- */

export type BultoVivo = {
  id: number;
  codigo: string;
  packaging: Packaging;
  cantidad: number;
  estado: EstadoBulto;
  posicionId: number | null;
  posicionCodigo: string | null;
  contenido: Array<{ modeloId: number; modeloNombre: string; cantidad: number }>;
  lineaCodigo: string;
};

/** `SELECT ... FOR UPDATE` sobre el bulto, con todo lo que hace falta para decidir. */
export async function bloquearBulto(tx: Tx, id: number): Promise<BultoVivo> {
  const filas = (await tx.execute(sql`
    select b.id, b.codigo, b.packaging, b.cantidad, b.estado, b.posicion_id,
           case when p.id is null then null
                else g.codigo || '-' || p.codigo end as posicion_codigo
      from bultos b
      left join posiciones p on p.id = b.posicion_id
      left join grupos g on g.id = p.grupo_id
     where b.id = ${id}
     for update of b
  `)) as unknown as Array<{
    id: number;
    codigo: string;
    packaging: Packaging;
    cantidad: number;
    estado: EstadoBulto;
    posicion_id: number | null;
    posicion_codigo: string | null;
  }>;

  if (filas.length === 0) fallar("Ese bulto no existe.");
  const b = filas[0];

  const contenido = (await tx.execute(sql`
    select c.modelo_id, m.nombre as modelo_nombre, c.cantidad, l.codigo as linea_codigo
      from bulto_contenido c
      join modelos m on m.id = c.modelo_id
      join lineas l on l.id = m.linea_id
     where c.bulto_id = ${id}
     order by m.orden, m.nombre
  `)) as unknown as Array<{
    modelo_id: number;
    modelo_nombre: string;
    cantidad: number;
    linea_codigo: string;
  }>;

  return {
    id: b.id,
    codigo: b.codigo,
    packaging: b.packaging,
    cantidad: b.cantidad,
    estado: b.estado,
    posicionId: b.posicion_id,
    posicionCodigo: b.posicion_codigo,
    lineaCodigo: contenido[0]?.linea_codigo ?? "",
    contenido: contenido.map((c) => ({
      modeloId: c.modelo_id,
      modeloNombre: c.modelo_nombre,
      cantidad: c.cantidad,
    })),
  };
}

export type PosicionVivo = {
  id: number;
  /** El código completo y hablado: B-07-2-1. */
  codigo: string;
  grupoId: number;
  unidad: number;
  nivel: number;
  niveles: number;
  profundidad: number | null;
  profundidadMax: number | null;
  penetrable: boolean;
  alturaMaxCm: number | null;
  /** El bulto que ya está ahí, si hay. Una posición aloja UNO. */
  ocupante: { id: number; codigo: string } | null;
  /**
   * El código del bulto de ABAJO que se comió este hueco por sobresalir. Si
   * está, la posición está ocupada aunque no tenga `ocupante`.
   */
  invasor: string | null;
  /** La de arriba en la misma calle y profundidad, si el rack tiene nivel. */
  arriba: {
    id: number;
    codigo: string;
    alturaMaxCm: number | null;
    libre: boolean;
    /** Quién la tiene, para poder nombrarlo en el error. */
    ocupante: string | null;
  } | null;
};

/**
 * Bloquea la posición y trae todo lo que hace falta para decidir si se puede
 * usar.
 *
 * Bloquear la POSICIÓN y no solo el bulto es lo que evita que dos operarios
 * manden dos bultos distintos al mismo lugar en el mismo segundo: los dos leen
 * "está libre", los dos escriben, y la posición queda con dos.
 */
export async function bloquearPosicion(
  tx: Tx,
  id: number,
): Promise<PosicionVivo> {
  /**
   * Se bloquea la posicion Y SUS VECINAS DE ARRIBA Y DE ABAJO.
   *
   * Desde que un bulto alto puede comerse el hueco de arriba, dos posiciones
   * vecinas en vertical dejaron de ser independientes: un operario metiendo un
   * optimizado en el nivel 2 y otro metiendo cualquier cosa en el nivel 3 estan
   * peleando por el mismo espacio fisico aunque las filas sean distintas. Con un
   * `for update` sobre una sola fila los dos leerian "libre" y los dos
   * escribirian, que es justo el choque que este lock existe para evitar.
   *
   * Se toman en orden de `id` -el `order by` antes del `for update`- porque dos
   * transacciones que tomen las mismas filas en ORDEN DISTINTO se abrazan en un
   * deadlock. El orden lo fija la base, no el codigo que llama.
   */
  await tx.execute(sql`
    select v.id from posiciones v
     where v.id in (
       select p2.id from posiciones p2
        join posiciones p on p.id = ${id}
       where p2.grupo_id = p.grupo_id
         and p2.unidad = p.unidad
         -- Las DOS, y por eso ninguna sobra: en un selectivo la columna es lo
         -- que separa una pila de la de al lado y la profundidad es null; en un
         -- penetrable es al reves. Con una sola, un selectivo hace match contra
         -- todas las columnas del modulo y se bloquea la posicion equivocada.
         and p2.columna is not distinct from p.columna
         and p2.profundidad is not distinct from p.profundidad
         and p2.nivel between p.nivel - 1 and p.nivel + 1
     )
     order by v.id
     for update
  `);

  const filas = (await tx.execute(sql`
    select p.id, p.unidad, p.nivel, p.profundidad, p.activa, p.altura_max_cm,
           g.codigo || '-' || p.codigo as codigo,
           g.id as grupo_id, g.accesibilidad, g.niveles,
           g.profundidad as profundidad_max,
           n.altura_max_cm as altura_nivel,
           o.id as ocupante_id, o.codigo as ocupante_codigo,
           inv.codigo as invasor_codigo,
           arr.id as arriba_id,
           g.codigo || '-' || arr.codigo as arriba_codigo,
           coalesce(narr.altura_max_cm, arr.altura_max_cm) as arriba_altura,
           arrocu.codigo as arriba_ocupante,
           arrinv.codigo as arriba_invasor,
           arr.activa as arriba_activa
      from posiciones p
      join grupos g on g.id = p.grupo_id
      left join niveles n on n.grupo_id = g.id and n.nivel = p.nivel
      left join bultos o on o.posicion_id = p.id and o.estado = 'ubicado'
      left join bultos inv on inv.id = p.bloqueada_por_bulto_id
      left join posiciones arr
             on arr.grupo_id = p.grupo_id and arr.unidad = p.unidad
            and arr.columna is not distinct from p.columna
            and arr.profundidad is not distinct from p.profundidad
            and arr.nivel = p.nivel + 1
      left join niveles narr on narr.grupo_id = g.id and narr.nivel = arr.nivel
      left join bultos arrocu on arrocu.posicion_id = arr.id and arrocu.estado = 'ubicado'
      left join bultos arrinv on arrinv.id = arr.bloqueada_por_bulto_id
     where p.id = ${id}
  `)) as unknown as Array<{
    id: number;
    unidad: number;
    nivel: number;
    profundidad: number | null;
    activa: boolean;
    altura_max_cm: number | null;
    altura_nivel: number | null;
    codigo: string;
    grupo_id: number;
    accesibilidad: string;
    niveles: number;
    profundidad_max: number | null;
    ocupante_id: number | null;
    ocupante_codigo: string | null;
    invasor_codigo: string | null;
    arriba_id: number | null;
    arriba_codigo: string | null;
    arriba_altura: number | null;
    arriba_ocupante: string | null;
    arriba_invasor: string | null;
    arriba_activa: boolean | null;
  }>;

  if (filas.length === 0) fallar("Esa posición no existe.");
  const p = filas[0];
  if (!p.activa) fallar(`La posición ${p.codigo} está dada de baja.`);

  return {
    id: p.id,
    codigo: p.codigo,
    grupoId: p.grupo_id,
    unidad: p.unidad,
    nivel: p.nivel,
    niveles: p.niveles,
    profundidad: p.profundidad,
    profundidadMax: p.profundidad_max,
    penetrable: p.accesibilidad === "penetrable",
    // La de la posición pisa a la del nivel: es el escape para la viga cruzada.
    alturaMaxCm: p.altura_max_cm ?? p.altura_nivel,
    ocupante:
      p.ocupante_id != null
        ? { id: p.ocupante_id, codigo: p.ocupante_codigo! }
        : null,
    /** El bulto de abajo que se comió este hueco por alto. */
    invasor: p.invasor_codigo,
    /**
     * La de arriba, si existe. `libre` incluye estar activa: una posición dada
     * de baja no presta su espacio, porque justamente puede estar de baja por
     * una viga o un caño que ocupa ese aire.
     */
    arriba:
      p.arriba_id != null
        ? {
            id: p.arriba_id,
            codigo: p.arriba_codigo!,
            alturaMaxCm: p.arriba_altura,
            libre:
              p.arriba_activa === true &&
              p.arriba_ocupante == null &&
              p.arriba_invasor == null,
            ocupante: p.arriba_ocupante ?? p.arriba_invasor,
          }
        : null,
  };
}

export function exigirEnStock(b: BultoVivo) {
  if (b.estado === "salido") {
    fallar(
      `El bulto ${b.codigo} ya salió del rack. Si volvió, hay que meterlo de nuevo.`,
    );
  }
}

/**
 * Qué está tapando a una posición de un penetrable, mirando toda la calle.
 *
 * Son dos bloqueos y los dos vienen de cómo se mueve el autoelevador: el del
 * mismo nivel más cerca del pasillo, y el del PISO hasta esa profundidad,
 * porque el clark entra manejando por adentro de la calle y un palet en el piso
 * le corta el camino. La regla vive en lib/posiciones.ts.
 *
 * El mensaje nombra qué está estorbando, porque el operario lo está mirando y
 * necesita saber si el sistema le está diciendo la verdad.
 */
export async function exigirAccesible(tx: Tx, pos: PosicionVivo) {
  if (!pos.penetrable || pos.profundidad == null) return;

  const ocupadas = (await tx.execute(sql`
    select p.nivel, p.profundidad, b.codigo,
           g.codigo || '-' || p.codigo as posicion
      from bultos b
      join posiciones p on p.id = b.posicion_id
      join grupos g on g.id = p.grupo_id
     where b.estado = 'ubicado'
       and p.grupo_id = ${pos.grupoId}
       and p.unidad = ${pos.unidad}
       and p.id <> ${pos.id}
  `)) as unknown as Array<{
    nivel: number;
    profundidad: number | null;
    codigo: string;
    posicion: string;
  }>;

  const tapan = loQueTapa(
    { nivel: pos.nivel, profundidad: pos.profundidad },
    ocupadas.map((o) => ({
      nivel: o.nivel,
      profundidad: o.profundidad,
      etiqueta: `${o.codigo} (${o.posicion})`,
    })),
  );

  if (tapan.length > 0) {
    const donde = `${nombreDeNivel(pos.nivel, pos.niveles)}, ${nombreDeProfundidad(
      pos.profundidad,
      pos.profundidadMax ?? 1,
    )}`;
    fallar(
      `${pos.codigo} está en ${donde} y el paso está tapado. ` +
        `Primero hay que bajar ${tapan.map((t) => t.etiqueta).join(", ")}.`,
    );
  }
}

/** Una posición aloja un bulto. Si ya tiene uno, no entra otro. */
export function exigirLibre(pos: PosicionVivo) {
  if (pos.ocupante) {
    fallar(
      `${pos.codigo} ya tiene el bulto ${pos.ocupante.codigo}. ` +
        `Elegí otra posición, o dejalo sin ubicar.`,
    );
  }
  /**
   * Y el hueco puede estar ocupado sin que haya nada parado acá: un bulto alto
   * de abajo que sobresale. El mensaje lo nombra y dice dónde está, porque el
   * operario que mira el rack ve un espacio libre y necesita entender por qué
   * la app le dice que no.
   */
  if (pos.invasor) {
    fallar(
      `${pos.codigo} está tapada: el bulto ${pos.invasor}, que está justo ` +
        `abajo, sobresale y ocupa este hueco. Primero hay que bajarlo.`,
    );
  }
}

/**
 * Que el bulto entre en el hueco.
 *
 * Solo se valida lo normalizado: un palet o un optimizado tienen una altura
 * conocida, un SUELTO no -no hay dos sueltos iguales- y por eso nunca se le
 * revisa. Si falta el dato de cualquiera de los dos lados -la norma sin medir o
 * el nivel sin medir- tampoco se valida: `null` es "el sistema no opina", y así
 * se puede usar la app antes de tener toda la planta medida.
 */
export type Encaje = {
  /** Si el bulto sobresale y se come tambien la posicion de arriba. */
  invadeArriba: boolean;
  arriba?: { id: number; codigo: string };
};

export async function exigirAltura(
  tx: Tx,
  pos: PosicionVivo,
  bulto: { packaging: Packaging; contenido: Array<{ modeloId: number }> },
): Promise<Encaje> {
  if (bulto.packaging === "suelto") return { invadeArriba: false };
  if (pos.alturaMaxCm == null) return { invadeArriba: false };
  const modeloId = bulto.contenido[0]?.modeloId;
  if (modeloId == null) return { invadeArriba: false };

  const filas = (await tx.execute(sql`
    select n.altura_cm, m.nombre
      from normas n join modelos m on m.id = n.modelo_id
     where n.modelo_id = ${modeloId} and n.packaging = ${bulto.packaging}
     limit 1
  `)) as unknown as Array<{ altura_cm: number | null; nombre: string }>;

  const altura = filas[0]?.altura_cm;
  if (altura == null) return { invadeArriba: false };

  if (altura <= pos.alturaMaxCm) return { invadeArriba: false };

  /**
   * No entra en su nivel. Pero en el galpon entra igual, sobresaliendo hacia el
   * hueco de arriba, y prohibirlo no evita que lo hagan: solo hace que el palet
   * termine en el rack sin que el sistema lo sepa, que es peor que las dos
   * cosas. Asi que se permite, a cambio de ocupar las dos posiciones.
   *
   * Tres razones distintas para decir que no, y cada una tiene su mensaje porque
   * cada una se resuelve distinto:
   */
  const m = (cm: number) => (cm / 100).toFixed(2).replace(".", ",");
  const quien = `un ${bulto.packaging} de ${filas[0].nombre} mide ${m(altura)} m`;

  // 1. No hay nivel arriba: es el ultimo, y arriba esta el techo.
  if (!pos.arriba) {
    fallar(
      `No entra: ${quien} y en ${pos.codigo} entran ${m(pos.alturaMaxCm)} m. ` +
        `Es el nivel más alto, así que no hay hueco arriba para que sobresalga.`,
    );
  }

  // 2. El hueco de arriba esta tomado: van a chocar. Es el caso que mas
  //    importa, porque es el unico donde permitirlo rompe algo fisico.
  if (!pos.arriba.libre) {
    fallar(
      `No se puede: ${quien} y en ${pos.codigo} entran ${m(pos.alturaMaxCm)} m, ` +
        `así que sobresale hacia ${pos.arriba.codigo}` +
        (pos.arriba.ocupante
          ? `, que tiene el bulto ${pos.arriba.ocupante}. Van a chocar: primero hay que bajar ese.`
          : `, que está dada de baja. Elegí otra posición.`),
    );
  }

  // 3. Ni con el hueco de arriba alcanza.
  const juntas = pos.alturaMaxCm + (pos.arriba.alturaMaxCm ?? 0);
  if (pos.arriba.alturaMaxCm != null && altura > juntas) {
    fallar(
      `No entra ni ocupando dos: ${quien} y entre ${pos.codigo} y ` +
        `${pos.arriba.codigo} hay ${m(juntas)} m.`,
    );
  }

  return { invadeArriba: true, arriba: pos.arriba };
}

export async function exigirMotivo(
  tx: Tx,
  motivoId: number,
  ambito: "salida" | "ajuste",
): Promise<{ id: number; nombre: string }> {
  const filas = (await tx.execute(sql`
    select id, nombre, activo, ambito from motivos where id = ${motivoId} limit 1
  `)) as unknown as Array<{
    id: number;
    nombre: string;
    activo: boolean;
    ambito: string;
  }>;
  const m = filas[0];
  if (!m || !m.activo || m.ambito !== ambito) {
    fallar("Elegí un motivo de la lista.");
  }
  return { id: m.id, nombre: m.nombre };
}

/* -------------------------------------------------------------------------- */
/* Escritura                                                                  */
/* -------------------------------------------------------------------------- */

export type Aplicacion = {
  tipo: TipoMovimiento;
  bulto: BultoVivo;
  /** Contenido DESPUÉS del movimiento. Vacío = el bulto sale del rack. */
  contenidoDespues: LineaContenido[];
  packagingDespues: Packaging;
  estadoDespues: EstadoBulto;
  posicionDestino: { id: number; codigo: string } | null;
  /**
   * Si el bulto sobresale y se come tambien la posicion de arriba, cual es.
   * Sale de `exigirAltura`, que es quien lo puede saber.
   */
  invadeArriba?: { id: number; codigo: string } | null;
  usuario: { id: number; nombre: string };
  motivo?: { id: number; nombre: string };
  nota?: string | null;
  /**
   * Si este movimiento cuenta como verificación de la posición. Nunca para los
   * del autoelevador: el que mueve es también quien puede haberse equivocado, y
   * usar su registro para subir la confiabilidad sería dejar que el dato se
   * valide a sí mismo.
   */
  conservarChequeo?: boolean;
};

/**
 * Escribe el movimiento, sus líneas, y deja el bulto como queda.
 *
 * Todo pasa por acá. Si alguna vez hay dos caminos para escribir un movimiento,
 * uno de los dos va a olvidarse de algo -el snapshot del nombre, el reloj, el
 * chequeo que hay que borrar- y el sistema va a mentir sin avisar.
 */
export async function aplicarMovimiento(tx: Tx, a: Aplicacion): Promise<number> {
  const antes = new Map(a.bulto.contenido.map((c) => [c.modeloId, c.cantidad]));
  const despues = new Map(a.contenidoDespues.map((c) => [c.modeloId, c.cantidad]));
  const modelosTocados = [...new Set([...antes.keys(), ...despues.keys()])];

  const nombres = new Map(a.bulto.contenido.map((c) => [c.modeloId, c.modeloNombre]));
  const faltantes = modelosTocados.filter((id) => !nombres.has(id));
  if (faltantes.length > 0) {
    const filas = (await tx.execute(sql`
      select id, nombre from modelos where id in ${sql.raw(`(${faltantes.join(",")})`)}
    `)) as unknown as Array<{ id: number; nombre: string }>;
    for (const f of filas) nombres.set(f.id, f.nombre);
  }

  const cantidadDespues = total(a.contenidoDespues);

  const [mov] = await tx
    .insert(movimientos)
    .values({
      bultoId: a.bulto.id,
      bultoCodigo: a.bulto.codigo,
      lineaCodigo: a.bulto.lineaCodigo,
      tipo: a.tipo,
      cantidadAntes: a.bulto.cantidad,
      cantidad: cantidadDespues,
      packagingAntes: a.bulto.packaging,
      packaging: a.packagingDespues,
      posicionDesdeId: a.bulto.posicionId,
      posicionDesdeCodigo: a.bulto.posicionCodigo,
      posicionHastaId: a.posicionDestino?.id ?? null,
      posicionHastaCodigo: a.posicionDestino?.codigo ?? null,
      usuarioId: a.usuario.id,
      usuarioNombre: a.usuario.nombre,
      motivoId: a.motivo?.id ?? null,
      motivoNombre: a.motivo?.nombre ?? null,
      nota: a.nota ?? null,
    })
    .returning({ id: movimientos.id });

  await tx.insert(movimientoLineas).values(
    modelosTocados.map((modeloId) => ({
      movimientoId: mov.id,
      modeloId,
      modeloNombre: nombres.get(modeloId) ?? "?",
      cantidadAntes: antes.get(modeloId) ?? 0,
      cantidad: despues.get(modeloId) ?? 0,
    })),
  );

  /**
   * El contenido vivo se REEMPLAZA entero: es una foto del ahora, no un
   * historial. El historial son las líneas del movimiento.
   */
  await tx.delete(bultoContenido).where(eq(bultoContenido.bultoId, a.bulto.id));
  if (a.contenidoDespues.length > 0) {
    await tx.insert(bultoContenido).values(
      a.contenidoDespues.map((l) => ({
        bultoId: a.bulto.id,
        modeloId: l.modeloId,
        cantidad: l.cantidad,
      })),
    );
  }

  /**
   * CUALQUIER movimiento borra el chequeo del bulto. No solo los cambios de
   * lugar: sacar una parte también cambia lo que hay en esa posición, y lo que
   * control verificó ya no es lo que está.
   *
   * La excepción es el ajuste del operario de control, que trae su propio
   * chequeo y por eso pasa `conservarChequeo`. Lo mismo vale para la posición,
   * abajo.
   *
   * Es deliberadamente severo: un bulto recién tocado tiene que verse sin
   * verificar, porque acaba de pasar por las manos donde se cometen los errores
   * que el control busca.
   */
  await tx
    .update(bultos)
    .set({
      packaging: a.packagingDespues,
      cantidad: cantidadDespues,
      estado: a.estadoDespues,
      posicionId: a.posicionDestino?.id ?? null,
      vistoEn: new Date(),
      ...(a.conservarChequeo
        ? {}
        : { chequeadoEn: null, chequeosOk: 0, chequeosTotal: 0 }),
    })
    .where(eq(bultos.id, a.bulto.id));

  /**
   * La invasion de altura viaja con el bulto, y por eso se rehace entera en cada
   * movimiento en vez de parchearse.
   *
   * Primero se suelta TODO lo que este bulto tuviera tomado, sin preguntar
   * dónde: si bajó, si salió, si se movió a otra calle, el hueco de arriba se
   * libera solo y nadie tiene que acordarse. Después, si en el destino vuelve a
   * sobresalir, se toma el nuevo. Soltar-y-tomar es lo que hace que no existan
   * huecos tomados por un bulto que ya no está: el estado sale del bulto, no de
   * una secuencia de parches que hay que acertar en orden.
   */
  await tx
    .update(posiciones)
    .set({ bloqueadaPorBultoId: null })
    .where(eq(posiciones.bloqueadaPorBultoId, a.bulto.id));

  if (a.invadeArriba) {
    await tx
      .update(posiciones)
      .set({ bloqueadaPorBultoId: a.bulto.id })
      .where(eq(posiciones.id, a.invadeArriba.id));
  }

  /**
   * Y le borra el chequeo a las POSICIONES que el movimiento tocó, por la misma
   * razón: un chequeo dice "en B-04-2-1 hay este bulto", y si entró otro -o si
   * se fue el que estaba- eso dejó de ser cierto.
   *
   * Sin esto, una posición que acaba de recibir un palet seguía diciendo
   * "chequeada hace 2 días" con adentro algo que nadie verificó ahí, y la
   * recorrida de control la despriorizaba: justo la que más convenía ir a mirar.
   *
   * Los contadores `ok`/`total` de la posición NO se tocan: son su historial, y
   * una posición donde control viene encontrando diferencias lo sigue siendo
   * aunque cambie el palet que tiene adentro. Lo que caduca es el "cuándo", no
   * el "cómo le fue".
   */
  if (!a.conservarChequeo) {
    const tocadas = [
      ...new Set(
        [a.bulto.posicionId, a.posicionDestino?.id ?? null].filter(
          (x): x is number => x != null,
        ),
      ),
    ];
    if (tocadas.length > 0) {
      await tx
        .update(posiciones)
        .set({ chequeadoEn: null })
        .where(inArray(posiciones.id, tocadas));
    }
  }

  return mov.id;
}

/**
 * Crea el bulto vacío para poder meterlo.
 *
 * El código sale del id y por eso son dos pasos dentro de la misma transacción:
 * así `P-00042` y el id 42 son siempre el mismo bulto, y después de un borrado
 * total -que reinicia la secuencia- se vuelve a empezar en P-00001. Un
 * inventario nuevo que arranca en el bulto 743 hace dudar de si de verdad se
 * borró.
 */
export async function crearBulto(
  tx: Tx,
  datos: { packaging: Packaging; estado: EstadoBulto; usuarioId: number },
): Promise<{ id: number; codigo: string }> {
  const [creado] = await tx
    .insert(bultos)
    .values({
      codigo: `tmp-${crypto.randomUUID()}`,
      packaging: datos.packaging,
      cantidad: 0,
      estado: datos.estado,
      creadoPor: datos.usuarioId,
    })
    .returning({ id: bultos.id });

  const codigo = `P-${String(creado.id).padStart(5, "0")}`;
  await tx.update(bultos).set({ codigo }).where(eq(bultos.id, creado.id));
  return { id: creado.id, codigo };
}

/** Valida la composición con la misma regla que la pantalla, y falla legible. */
export function exigirComposicion(
  packaging: Packaging,
  contenido: LineaContenido[],
) {
  const problema = validarComposicion(packaging, contenido);
  if (problema) fallar(problema);
}
