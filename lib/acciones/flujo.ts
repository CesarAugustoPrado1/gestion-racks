"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "../db";
import { autorizar } from "../auth";
import { total } from "../bultos";
import type { Packaging } from "../db/schema";
import {
  aplicarMovimiento,
  bloquearBulto,
  bloquearPosicion,
  crearBulto,
  exigirAccesible,
  exigirComposicion,
  exigirEnStock,
  exigirMotivo,
  ubicarEn,
} from "./motor";
import { ejecutar, fallar, type Resultado } from "./comun";

/**
 * Las tres operaciones del autoelevador: meter, sacar y mover.
 *
 * Todas corren dentro de una transacción y empiezan bloqueando. Todas terminan
 * en `aplicarMovimiento`, que es el único lugar del sistema que escribe un
 * movimiento: si hubiera dos, uno de los dos se olvidaría de algo.
 */

const esquemaLinea = z.object({
  modeloId: z.number().int().positive(),
  cantidad: z.number().int().min(1, "Las cantidades tienen que ser mayores a cero."),
});

const esquemaNota = z
  .string()
  .trim()
  .max(300, "La nota es muy larga.")
  .optional()
  .transform((v) => (v ? v : null));

/* -------------------------------------------------------------------------- */
/* Meter                                                                      */
/* -------------------------------------------------------------------------- */

const esquemaMeter = z.object({
  contenido: z.array(esquemaLinea).min(1, "Elegí al menos un modelo."),
  packaging: z.enum(["suelto", "palet", "optimizado"]),
  /**
   * `null` es el limbo, y es una opción legítima: si las posiciones previstas
   * están llenas o reservadas, el palet no puede dejar de existir solo porque
   * no hay dónde ponerlo.
   */
  posicionId: z.number().int().positive().nullable(),
  nota: esquemaNota,
});

export async function meter(
  entrada: z.input<typeof esquemaMeter>,
): Promise<Resultado<{ codigo: string; ubicacion: string | null }>> {
  return ejecutar(async () => {
    const sesion = await autorizar("autoelevador", "admin");
    const datos = esquemaMeter.parse(entrada);

    exigirComposicion(datos.packaging as Packaging, datos.contenido);

    return db.transaction(async (tx) => {
      const destino = datos.posicionId
        ? await bloquearPosicion(tx, datos.posicionId)
        : null;
      const profundidad = destino ? ubicarEn(destino) : null;

      const nuevo = await crearBulto(tx, {
        packaging: datos.packaging as Packaging,
        estado: destino ? "ubicado" : "sin_ubicar",
        usuarioId: sesion.uid,
      });

      await aplicarMovimiento(tx, {
        tipo: "meter",
        // El bulto acaba de nacer: antes de este movimiento no había nada, y
        // así es como tiene que quedar escrito en el historial.
        bulto: {
          id: nuevo.id,
          codigo: nuevo.codigo,
          packaging: datos.packaging as Packaging,
          cantidad: 0,
          estado: destino ? "ubicado" : "sin_ubicar",
          posicionId: null,
          posicionCodigo: null,
          profundidad: null,
          contenido: [],
          lineaCodigo: "",
        },
        contenidoDespues: datos.contenido,
        packagingDespues: datos.packaging as Packaging,
        estadoDespues: destino ? "ubicado" : "sin_ubicar",
        posicionDestino: destino
          ? { id: destino.id, codigo: destino.codigo, profundidad }
          : null,
        usuario: { id: sesion.uid, nombre: sesion.nombre },
        nota: datos.nota,
      });

      revalidatePath("/", "layout");
      return { codigo: nuevo.codigo, ubicacion: destino?.codigo ?? null };
    });
  });
}

/* -------------------------------------------------------------------------- */
/* Sacar                                                                      */
/* -------------------------------------------------------------------------- */

const esquemaSacar = z.object({
  bultoId: z.number().int().positive(),
  motivoId: z.number().int().positive("Elegí un motivo."),
  /** Sin esto, sale todo. Con esto, solo lo que se indica de cada modelo. */
  parcial: z.array(esquemaLinea).optional(),
  nota: esquemaNota,
});

export async function sacar(
  entrada: z.input<typeof esquemaSacar>,
): Promise<
  Resultado<{ codigo: string; salieron: number; quedaron: number; convertido: boolean }>
> {
  return ejecutar(async () => {
    const sesion = await autorizar("autoelevador", "admin");
    const datos = esquemaSacar.parse(entrada);

    return db.transaction(async (tx) => {
      const bulto = await bloquearBulto(tx, datos.bultoId);
      exigirEnStock(bulto);

      if (bulto.posicionId) {
        const pos = await bloquearPosicion(tx, bulto.posicionId);
        exigirAccesible(pos, bulto);
      }

      const motivo = await exigirMotivo(tx, datos.motivoId, "salida");

      const actual = new Map(bulto.contenido.map((c) => [c.modeloId, c.cantidad]));
      const sale = new Map<number, number>();

      if (datos.parcial && datos.parcial.length > 0) {
        for (const l of datos.parcial) {
          const hay = actual.get(l.modeloId);
          if (hay == null) {
            fallar(`El bulto ${bulto.codigo} no tiene ese modelo adentro.`);
          }
          if (l.cantidad > hay) {
            fallar(
              `Querés sacar ${l.cantidad} y en ${bulto.codigo} hay ${hay}. ` +
                `Si la diferencia es real, avisale a control: lo corrige y queda registrado.`,
            );
          }
          sale.set(l.modeloId, l.cantidad);
        }
      } else {
        for (const [id, cant] of actual) sale.set(id, cant);
      }

      const contenidoDespues = [...actual.entries()]
        .map(([modeloId, cant]) => ({
          modeloId,
          cantidad: cant - (sale.get(modeloId) ?? 0),
        }))
        .filter((l) => l.cantidad > 0);

      const quedaron = total(contenidoDespues);
      const salieron = bulto.cantidad - quedaron;
      if (salieron <= 0) fallar("No indicaste nada para sacar.");

      /**
       * LA REGLA: si sale una parte de un palet o de un optimizado, lo que
       * queda ya no es normalizado y pasa a suelto.
       *
       * La norma es de un modelo y un packaging -"un palet de Laja lleva 48"- y
       * un palet al que le faltan 5 no es un palet de Laja: es producto suelto
       * arriba de un palet de madera. El operario no tiene que saber esto; dice
       * cuánto sale y el sistema convierte.
       */
      const convertido = quedaron > 0 && bulto.packaging !== "suelto";
      const packagingDespues: Packaging = convertido ? "suelto" : bulto.packaging;

      await aplicarMovimiento(tx, {
        tipo: "sacar",
        bulto,
        contenidoDespues,
        packagingDespues,
        estadoDespues: quedaron > 0 ? bulto.estado : "salido",
        // Lo que queda no se mueve: sigue donde estaba. Lo que sale entero deja
        // la posición libre.
        posicionDestino:
          quedaron > 0 && bulto.posicionId
            ? {
                id: bulto.posicionId,
                codigo: bulto.posicionCodigo!,
                profundidad: bulto.profundidad,
              }
            : null,
        usuario: { id: sesion.uid, nombre: sesion.nombre },
        motivo,
        nota: datos.nota,
      });

      revalidatePath("/", "layout");
      return { codigo: bulto.codigo, salieron, quedaron, convertido };
    });
  });
}

/* -------------------------------------------------------------------------- */
/* Mover                                                                      */
/* -------------------------------------------------------------------------- */

const esquemaMover = z.object({
  bultoId: z.number().int().positive(),
  /** `null` lo manda al limbo: sigue siendo stock, pero sin lugar asignado. */
  posicionId: z.number().int().positive().nullable(),
  nota: esquemaNota,
});

export async function mover(
  entrada: z.input<typeof esquemaMover>,
): Promise<Resultado<{ codigo: string; desde: string | null; hasta: string | null }>> {
  return ejecutar(async () => {
    const sesion = await autorizar("autoelevador", "admin");
    const datos = esquemaMover.parse(entrada);

    return db.transaction(async (tx) => {
      const bulto = await bloquearBulto(tx, datos.bultoId);
      exigirEnStock(bulto);

      if (datos.posicionId === bulto.posicionId) {
        fallar(
          bulto.posicionId
            ? `${bulto.codigo} ya está en ${bulto.posicionCodigo}.`
            : `${bulto.codigo} ya está sin ubicar.`,
        );
      }

      // Sacarlo de donde está: en un carril penetrable puede estar tapado.
      if (bulto.posicionId) {
        const origen = await bloquearPosicion(tx, bulto.posicionId);
        exigirAccesible(origen, bulto);
      }

      const destino = datos.posicionId
        ? await bloquearPosicion(tx, datos.posicionId)
        : null;
      const profundidad = destino ? ubicarEn(destino) : null;

      await aplicarMovimiento(tx, {
        tipo: "mover",
        bulto,
        // Mover no toca el contenido: por eso antes y después son iguales y el
        // efecto sobre el stock es exactamente cero.
        contenidoDespues: bulto.contenido.map((c) => ({
          modeloId: c.modeloId,
          cantidad: c.cantidad,
        })),
        packagingDespues: bulto.packaging,
        estadoDespues: destino ? "ubicado" : "sin_ubicar",
        posicionDestino: destino
          ? { id: destino.id, codigo: destino.codigo, profundidad }
          : null,
        usuario: { id: sesion.uid, nombre: sesion.nombre },
        nota: datos.nota,
      });

      revalidatePath("/", "layout");
      return {
        codigo: bulto.codigo,
        desde: bulto.posicionCodigo,
        hasta: destino?.codigo ?? null,
      };
    });
  });
}
