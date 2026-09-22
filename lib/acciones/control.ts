"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { autorizar } from "../auth";
import { bultos, chequeos, posiciones, type Packaging } from "../db/schema";
import {
  aplicarMovimiento,
  bloquearBulto,
  bloquearPosicion,
  crearBulto,
  exigirComposicion,
  exigirMotivo,
  ubicarEn,
  type Tx,
} from "./motor";
import { ejecutar, fallar, type Resultado } from "./comun";

/**
 * El trabajo del operario de control: recorrer, confirmar y corregir.
 *
 * Un chequeo NO es un movimiento: no cambia el mundo, lo observa. Por eso vive
 * en su propia tabla y no como un tipo más de movimiento.
 *
 * Pero cuando encuentra una diferencia y la corrige, se escriben DOS COSAS EN
 * LA MISMA TRANSACCIÓN: la fila de chequeo, para el índice, y un movimiento de
 * ajuste, para el inventario y la auditoría. Nunca una sola: si quedara solo el
 * ajuste, el índice no sabría que alguien pasó; si quedara solo el chequeo, el
 * stock seguiría mal.
 */

const esquemaNota = z
  .string()
  .trim()
  .max(300, "La nota es muy larga.")
  .optional()
  .transform((v) => (v ? v : null));

/**
 * Deja asentado el chequeo sobre la posición y sobre los bultos que tiene.
 *
 * Los contadores se guardan al escribir y no se recalculan al leer, por el
 * mismo motivo que `duracion_min` en Control-Secaderos: que la pantalla no
 * tenga que reconstruir la historia posición por posición cada vez que alguien
 * la abre.
 */
async function asentarChequeo(
  tx: Tx,
  posicionId: number,
  bien: boolean,
  ahora: Date,
) {
  await tx
    .update(posiciones)
    .set({
      chequeadoEn: ahora,
      chequeosOk: sql`${posiciones.chequeosOk} + ${bien ? 1 : 0}`,
      chequeosTotal: sql`${posiciones.chequeosTotal} + 1`,
    })
    .where(eq(posiciones.id, posicionId));

  /**
   * Los bultos que están en la posición quedan verificados AHÍ. Si mañana se
   * mueven, el movimiento les borra la fecha: el chequeo decía "está en B-4" y
   * eso deja de ser cierto.
   */
  await tx
    .update(bultos)
    .set({
      chequeadoEn: ahora,
      chequeosOk: sql`${bultos.chequeosOk} + ${bien ? 1 : 0}`,
      chequeosTotal: sql`${bultos.chequeosTotal} + 1`,
    })
    .where(sql`${bultos.posicionId} = ${posicionId} and ${bultos.estado} = 'ubicado'`);
}

/* -------------------------------------------------------------------------- */
/* Está todo bien                                                             */
/* -------------------------------------------------------------------------- */

/**
 * El caso típico, en un toque.
 *
 * Confirmar una posición VACÍA vale tanto como confirmar una llena: es
 * información, no ausencia de información. Por eso `vacio_ok` es un resultado
 * propio y no un caso que no se registra.
 */
export async function confirmar(
  posicionId: number,
): Promise<Resultado<{ codigo: string; vacia: boolean }>> {
  return ejecutar(async () => {
    const sesion = await autorizar("control", "admin");

    return db.transaction(async (tx) => {
      const pos = await bloquearPosicion(tx, posicionId);
      const ahora = new Date();

      await tx.insert(chequeos).values({
        posicionId: pos.id,
        posicionCodigo: pos.codigo,
        resultado: pos.ocupados.length === 0 ? "vacio_ok" : "ok",
        usuarioId: sesion.uid,
        usuarioNombre: sesion.nombre,
        creadoEn: ahora,
      });

      await asentarChequeo(tx, pos.id, true, ahora);
      revalidatePath("/", "layout");
      return { codigo: pos.codigo, vacia: pos.ocupados.length === 0 };
    });
  });
}

/* -------------------------------------------------------------------------- */
/* Correcciones                                                               */
/* -------------------------------------------------------------------------- */

const esquemaCantidades = z.object({
  posicionId: z.number().int().positive(),
  bultoId: z.number().int().positive(),
  cantidades: z
    .array(
      z.object({
        modeloId: z.number().int().positive(),
        cantidad: z.number().int().min(0, "Las cantidades no pueden ser negativas."),
      }),
    )
    .min(1),
  motivoId: z.number().int().positive("Elegí un motivo."),
  nota: esquemaNota,
});

/**
 * Lo que hay no es lo que decía el sistema. Control lo corrige y queda asentado.
 *
 * El packaging NO se toca. Si un palet tiene 43 en vez de 48, sigue siendo el
 * palet que alguien armó: queda marcado como fuera de norma, que es lo que es.
 * Convertirlo a suelto sería afirmar que alguien lo desarmó, y control no sabe
 * eso: sabe lo que contó.
 */
export async function corregirCantidades(
  entrada: z.input<typeof esquemaCantidades>,
): Promise<Resultado<{ codigo: string; diferencia: number }>> {
  return ejecutar(async () => {
    const sesion = await autorizar("control", "admin");
    const datos = esquemaCantidades.parse(entrada);

    return db.transaction(async (tx) => {
      const pos = await bloquearPosicion(tx, datos.posicionId);
      const bulto = await bloquearBulto(tx, datos.bultoId);
      if (bulto.posicionId !== pos.id) {
        fallar(`${bulto.codigo} ya no está en ${pos.codigo}. Actualizá la pantalla.`);
      }

      const motivo = await exigirMotivo(tx, datos.motivoId, "ajuste");
      const contenidoDespues = datos.cantidades.filter((c) => c.cantidad > 0);
      if (contenidoDespues.length === 0) {
        fallar(
          "Si no quedó nada en el bulto, usá «el bulto no está acá» en vez de poner todo en cero.",
        );
      }

      const nuevoTotal = contenidoDespues.reduce((s, c) => s + c.cantidad, 0);
      const diferencia = nuevoTotal - bulto.cantidad;
      if (diferencia === 0) {
        fallar("Las cantidades son las mismas. Si está todo bien, usá «Está bien».");
      }

      const ahora = new Date();

      await aplicarMovimiento(tx, {
        tipo: "ajuste",
        bulto,
        contenidoDespues,
        packagingDespues: bulto.packaging,
        estadoDespues: bulto.estado,
        posicionDestino: {
          id: pos.id,
          codigo: pos.codigo,
          profundidad: bulto.profundidad,
        },
        usuario: { id: sesion.uid, nombre: sesion.nombre },
        motivo,
        nota: datos.nota,
        // El ajuste trae su propio chequeo: es control el que acaba de mirar.
        conservarChequeo: true,
      });

      await tx.insert(chequeos).values({
        posicionId: pos.id,
        posicionCodigo: pos.codigo,
        bultoId: bulto.id,
        resultado: "corregido",
        usuarioId: sesion.uid,
        usuarioNombre: sesion.nombre,
        nota: datos.nota,
        creadoEn: ahora,
      });

      await asentarChequeo(tx, pos.id, false, ahora);
      revalidatePath("/", "layout");
      return { codigo: bulto.codigo, diferencia };
    });
  });
}

const esquemaAusente = z.object({
  posicionId: z.number().int().positive(),
  bultoId: z.number().int().positive(),
  motivoId: z.number().int().positive("Elegí un motivo."),
  nota: esquemaNota,
});

/**
 * El bulto no está donde el sistema dice.
 *
 * Va a `sin_ubicar` y no a `salido`: el producto existe, lo que se perdió es
 * saber dónde está. Darlo de baja sería inventar una salida que nadie
 * registró, y descontaría del stock algo que probablemente esté dos posiciones
 * más allá.
 *
 * Así aparece en la cola de "sin ubicar" del autoelevador, que es justamente
 * la lista de lo que hay que ir a encontrar.
 */
export async function marcarAusente(
  entrada: z.input<typeof esquemaAusente>,
): Promise<Resultado<{ codigo: string }>> {
  return ejecutar(async () => {
    const sesion = await autorizar("control", "admin");
    const datos = esquemaAusente.parse(entrada);

    return db.transaction(async (tx) => {
      const pos = await bloquearPosicion(tx, datos.posicionId);
      const bulto = await bloquearBulto(tx, datos.bultoId);
      if (bulto.posicionId !== pos.id) {
        fallar(`${bulto.codigo} ya no está en ${pos.codigo}. Actualizá la pantalla.`);
      }
      const motivo = await exigirMotivo(tx, datos.motivoId, "ajuste");
      const ahora = new Date();

      await aplicarMovimiento(tx, {
        tipo: "ajuste",
        bulto,
        // El contenido no cambia: el producto existe, no sabemos dónde está.
        contenidoDespues: bulto.contenido.map((c) => ({
          modeloId: c.modeloId,
          cantidad: c.cantidad,
        })),
        packagingDespues: bulto.packaging,
        estadoDespues: "sin_ubicar",
        posicionDestino: null,
        usuario: { id: sesion.uid, nombre: sesion.nombre },
        motivo,
        nota: datos.nota,
      });

      await tx.insert(chequeos).values({
        posicionId: pos.id,
        posicionCodigo: pos.codigo,
        bultoId: bulto.id,
        resultado: "corregido",
        usuarioId: sesion.uid,
        usuarioNombre: sesion.nombre,
        nota: datos.nota,
        creadoEn: ahora,
      });

      await asentarChequeo(tx, pos.id, false, ahora);
      revalidatePath("/", "layout");
      return { codigo: bulto.codigo };
    });
  });
}

const esquemaEncontrado = z.object({
  posicionId: z.number().int().positive(),
  contenido: z
    .array(
      z.object({
        modeloId: z.number().int().positive(),
        cantidad: z.number().int().min(1, "Las cantidades tienen que ser mayores a cero."),
      }),
    )
    .min(1, "Elegí al menos un modelo."),
  packaging: z.enum(["suelto", "palet", "optimizado"]),
  motivoId: z.number().int().positive("Elegí un motivo."),
  nota: esquemaNota,
});

/** Hay producto que el sistema no tenía registrado. Se da de alta como ajuste. */
export async function registrarEncontrado(
  entrada: z.input<typeof esquemaEncontrado>,
): Promise<Resultado<{ codigo: string }>> {
  return ejecutar(async () => {
    const sesion = await autorizar("control", "admin");
    const datos = esquemaEncontrado.parse(entrada);
    exigirComposicion(datos.packaging as Packaging, datos.contenido);

    return db.transaction(async (tx) => {
      const pos = await bloquearPosicion(tx, datos.posicionId);
      const motivo = await exigirMotivo(tx, datos.motivoId, "ajuste");
      const profundidad = ubicarEn(pos);
      const ahora = new Date();

      const nuevo = await crearBulto(tx, {
        packaging: datos.packaging as Packaging,
        estado: "ubicado",
        usuarioId: sesion.uid,
      });

      await aplicarMovimiento(tx, {
        tipo: "ajuste",
        bulto: {
          id: nuevo.id,
          codigo: nuevo.codigo,
          packaging: datos.packaging as Packaging,
          cantidad: 0,
          estado: "ubicado",
          posicionId: null,
          posicionCodigo: null,
          profundidad: null,
          contenido: [],
          lineaCodigo: "",
        },
        contenidoDespues: datos.contenido,
        packagingDespues: datos.packaging as Packaging,
        estadoDespues: "ubicado",
        posicionDestino: { id: pos.id, codigo: pos.codigo, profundidad },
        usuario: { id: sesion.uid, nombre: sesion.nombre },
        motivo,
        nota: datos.nota,
        conservarChequeo: true,
      });

      await tx.insert(chequeos).values({
        posicionId: pos.id,
        posicionCodigo: pos.codigo,
        bultoId: nuevo.id,
        resultado: "corregido",
        usuarioId: sesion.uid,
        usuarioNombre: sesion.nombre,
        nota: datos.nota,
        creadoEn: ahora,
      });

      await asentarChequeo(tx, pos.id, false, ahora);
      revalidatePath("/", "layout");
      return { codigo: nuevo.codigo };
    });
  });
}
