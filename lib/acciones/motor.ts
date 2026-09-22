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
  const filas = (await tx.execute(sql`
    select p.id, p.unidad, p.nivel, p.profundidad, p.activa, p.altura_max_cm,
           g.codigo || '-' || p.codigo as codigo,
           g.id as grupo_id, g.accesibilidad, g.niveles,
           g.profundidad as profundidad_max,
           n.altura_max_cm as altura_nivel,
           o.id as ocupante_id, o.codigo as ocupante_codigo
      from posiciones p
      join grupos g on g.id = p.grupo_id
      left join niveles n on n.grupo_id = g.id and n.nivel = p.nivel
      left join bultos o on o.posicion_id = p.id and o.estado = 'ubicado'
     where p.id = ${id}
     for update of p
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
export async function exigirAltura(
  tx: Tx,
  pos: PosicionVivo,
  bulto: { packaging: Packaging; contenido: Array<{ modeloId: number }> },
) {
  if (bulto.packaging === "suelto") return;
  if (pos.alturaMaxCm == null) return;
  const modeloId = bulto.contenido[0]?.modeloId;
  if (modeloId == null) return;

  const filas = (await tx.execute(sql`
    select n.altura_cm, m.nombre
      from normas n join modelos m on m.id = n.modelo_id
     where n.modelo_id = ${modeloId} and n.packaging = ${bulto.packaging}
     limit 1
  `)) as unknown as Array<{ altura_cm: number | null; nombre: string }>;

  const altura = filas[0]?.altura_cm;
  if (altura == null) return;

  if (altura > pos.alturaMaxCm) {
    const m = (cm: number) => (cm / 100).toFixed(2).replace(".", ",");
    fallar(
      `No entra: un ${bulto.packaging} de ${filas[0].nombre} mide ${m(altura)} m ` +
        `y en ${pos.codigo} entran ${m(pos.alturaMaxCm)} m.`,
    );
  }
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
