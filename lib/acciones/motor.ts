import "server-only";
import { eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  bultoContenido,
  bultos,
  movimientoLineas,
  movimientos,
  type EstadoBulto,
  type Packaging,
  type TipoMovimiento,
} from "../db/schema";
import { total, validarComposicion, type LineaContenido } from "../bultos";
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
  profundidad: number | null;
  contenido: Array<{ modeloId: number; modeloNombre: string; cantidad: number }>;
  lineaCodigo: string;
};

/** `SELECT ... FOR UPDATE` sobre el bulto, con todo lo que hace falta para decidir. */
export async function bloquearBulto(tx: Tx, id: number): Promise<BultoVivo> {
  const filas = (await tx.execute(sql`
    select b.id, b.codigo, b.packaging, b.cantidad, b.estado, b.posicion_id,
           b.profundidad,
           case when p.id is null then null
                else r.codigo || '-' || p.codigo end as posicion_codigo
      from bultos b
      left join posiciones p on p.id = b.posicion_id
      left join racks r on r.id = p.rack_id
     where b.id = ${id}
     for update of b
  `)) as unknown as Array<{
    id: number;
    codigo: string;
    packaging: Packaging;
    cantidad: number;
    estado: EstadoBulto;
    posicion_id: number | null;
    profundidad: number | null;
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
    profundidad: b.profundidad,
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
  codigo: string;
  capacidad: number;
  profundidadMax: number | null;
  penetrable: boolean;
  ocupados: Array<{ id: number; codigo: string; profundidad: number | null }>;
};

/**
 * Bloquea la posición y trae lo que ya tiene adentro.
 *
 * Bloquear la POSICIÓN y no solo el bulto es lo que evita que dos operarios
 * manden dos bultos distintos al mismo lugar en el mismo segundo: los dos leen
 * "hay lugar", los dos escriben, y la posición queda con el doble de lo que
 * entra. El segundo espera acá.
 */
export async function bloquearPosicion(
  tx: Tx,
  id: number,
): Promise<PosicionVivo> {
  const filas = (await tx.execute(sql`
    select p.id, p.capacidad_bultos, p.profundidad, p.activa,
           r.codigo || '-' || p.codigo as codigo,
           r.accesibilidad
      from posiciones p join racks r on r.id = p.rack_id
     where p.id = ${id}
     for update of p
  `)) as unknown as Array<{
    id: number;
    capacidad_bultos: number;
    profundidad: number | null;
    activa: boolean;
    codigo: string;
    accesibilidad: string;
  }>;

  if (filas.length === 0) fallar("Esa posición no existe.");
  const p = filas[0];
  if (!p.activa) fallar(`La posición ${p.codigo} está dada de baja.`);

  const ocupados = (await tx.execute(sql`
    select id, codigo, profundidad from bultos
     where posicion_id = ${id} and estado = 'ubicado'
     order by profundidad nulls first
  `)) as unknown as Array<{
    id: number;
    codigo: string;
    profundidad: number | null;
  }>;

  return {
    id: p.id,
    codigo: p.codigo,
    capacidad: p.capacidad_bultos,
    profundidadMax: p.profundidad,
    penetrable: p.accesibilidad === "penetrable",
    ocupados,
  };
}

/* -------------------------------------------------------------------------- */
/* Validaciones                                                               */
/* -------------------------------------------------------------------------- */

export function exigirEnStock(b: BultoVivo) {
  if (b.estado === "salido") {
    fallar(
      `El bulto ${b.codigo} ya salió del rack. Si volvió, hay que meterlo de nuevo.`,
    );
  }
}

/**
 * En un rack penetrable solo se puede tocar el de adelante.
 *
 * No es una restricción del sistema: es cómo funciona un drive-in. Para sacar
 * el del fondo hay que bajar el que está adelante, y si la app deja registrar
 * lo contrario, lo registrado deja de coincidir con la realidad, que es
 * exactamente lo que esta app existe para evitar.
 *
 * El mensaje dice QUÉ bulto está estorbando, porque el operario lo está
 * mirando y necesita saber si el sistema le está diciendo la verdad.
 */
export function exigirAccesible(pos: PosicionVivo, b: BultoVivo) {
  if (!pos.penetrable || b.profundidad == null) return;
  const adelante = pos.ocupados.filter(
    (o) => o.id !== b.id && o.profundidad != null && o.profundidad < b.profundidad!,
  );
  if (adelante.length > 0) {
    const nombres = adelante.map((o) => o.codigo).join(", ");
    fallar(
      `${b.codigo} está al fondo de ${pos.codigo}. Primero hay que bajar ${nombres}, ` +
        `que está${adelante.length === 1 ? "" : "n"} adelante.`,
    );
  }
}

/**
 * Dónde entra un bulto en la posición, y si entra.
 *
 * En un carril penetrable se carga desde el fondo: el primero que entra va al
 * lugar más profundo y el último queda al frente. Por eso la profundidad que se
 * asigna es `capacidad - ocupados`, y no el siguiente número libre.
 */
export function ubicarEn(pos: PosicionVivo): number | null {
  if (pos.ocupados.length >= pos.capacidad) {
    fallar(
      `${pos.codigo} está llena: ya tiene ${pos.ocupados.length} bulto${pos.ocupados.length === 1 ? "" : "s"}. ` +
        `Elegí otra posición, o dejalo sin ubicar.`,
    );
  }
  if (!pos.penetrable || pos.profundidadMax == null) return null;
  return pos.profundidadMax - pos.ocupados.length;
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
  posicionDestino: { id: number; codigo: string; profundidad: number | null } | null;
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
   * chequeo y por eso pasa `conservarChequeo`.
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
      profundidad: a.posicionDestino?.profundidad ?? null,
      vistoEn: new Date(),
      ...(a.conservarChequeo
        ? {}
        : { chequeadoEn: null, chequeosOk: 0, chequeosTotal: 0 }),
    })
    .where(eq(bultos.id, a.bulto.id));

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
