"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { autorizar, hashPin } from "../auth";
import {
  lineas,
  modelos,
  motivos,
  normas,
  posiciones,
  racks,
  usuarios,
  type Packaging,
} from "../db/schema";
import { ROLES } from "../permisos";
import { ejecutar, fallar, type Resultado } from "./comun";

/**
 * ABM de los datos que definen cómo mide el sistema.
 *
 * NADA SE BORRA. Los modelos, racks y posiciones se SUSPENDEN, porque el
 * historial los sigue nombrando y un movimiento de hace dos meses tiene que
 * poder leerse igual. Lo mismo con los usuarios: dar de baja no es borrar.
 */

const nombre = z.string().trim().min(1, "El nombre no puede estar vacío.").max(80);

/* -------------------------------------------------------------------------- */
/* Líneas                                                                     */
/* -------------------------------------------------------------------------- */

const esquemaLinea = z.object({
  id: z.number().int().positive().optional(),
  nombre,
  unidadSingular: z.string().trim().min(1, "Falta la unidad en singular.").max(20),
  unidadPlural: z.string().trim().min(1, "Falta la unidad en plural.").max(20),
  activa: z.boolean(),
});

export async function guardarLinea(
  entrada: z.input<typeof esquemaLinea>,
): Promise<Resultado<void>> {
  return ejecutar(async () => {
    await autorizar("admin");
    const d = esquemaLinea.parse(entrada);

    if (d.id) {
      await db
        .update(lineas)
        .set({
          nombre: d.nombre,
          unidadSingular: d.unidadSingular,
          unidadPlural: d.unidadPlural,
          activa: d.activa,
        })
        .where(eq(lineas.id, d.id));
    } else {
      /**
       * El código se deriva del nombre y no se pide: es una clave técnica que
       * al usuario no le dice nada, y un campo más en un formulario es un campo
       * más donde equivocarse.
       */
      const codigo = d.nombre
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      const [existe] = await db
        .select({ id: lineas.id })
        .from(lineas)
        .where(eq(lineas.codigo, codigo))
        .limit(1);
      if (existe) fallar(`Ya hay una línea que se llama así.`);

      const [{ max }] = (await db.execute(
        sql`select coalesce(max(orden), -1) + 1 as max from lineas`,
      )) as unknown as Array<{ max: number }>;

      await db.insert(lineas).values({
        codigo,
        nombre: d.nombre,
        unidadSingular: d.unidadSingular,
        unidadPlural: d.unidadPlural,
        activa: d.activa,
        orden: max,
      });
    }
    revalidatePath("/", "layout");
  });
}

/* -------------------------------------------------------------------------- */
/* Modelos y normas                                                           */
/* -------------------------------------------------------------------------- */

const esquemaModelo = z.object({
  id: z.number().int().positive().optional(),
  lineaId: z.number().int().positive("Elegí una línea."),
  nombre,
  activo: z.boolean(),
  /**
   * Las normas van JUNTO con el modelo y no en otra pantalla: un modelo sin
   * norma es un modelo que no sirve para cargar un palet, y separarlas garantiza
   * que alguien cree el modelo y se olvide de la norma.
   *
   * Vacío = sin norma, que es distinto de cero. Es el `null` con significado
   * propio: el sistema no opina sobre esa cantidad.
   */
  normas: z.object({
    palet: z.number().int().positive().nullable(),
    optimizado: z.number().int().positive().nullable(),
  }),
});

export async function guardarModelo(
  entrada: z.input<typeof esquemaModelo>,
): Promise<Resultado<void>> {
  return ejecutar(async () => {
    await autorizar("admin");
    const d = esquemaModelo.parse(entrada);

    await db.transaction(async (tx) => {
      let modeloId = d.id;

      if (modeloId) {
        await tx
          .update(modelos)
          .set({ lineaId: d.lineaId, nombre: d.nombre, activo: d.activo })
          .where(eq(modelos.id, modeloId));
      } else {
        const [ya] = await tx
          .select({ id: modelos.id })
          .from(modelos)
          .where(and(eq(modelos.lineaId, d.lineaId), eq(modelos.nombre, d.nombre)))
          .limit(1);
        if (ya) fallar("Ya hay un modelo con ese nombre en esa línea.");

        const [{ max }] = (await tx.execute(
          sql`select coalesce(max(orden), -1) + 1 as max from modelos where linea_id = ${d.lineaId}`,
        )) as unknown as Array<{ max: number }>;

        const [creado] = await tx
          .insert(modelos)
          .values({
            lineaId: d.lineaId,
            nombre: d.nombre,
            activo: d.activo,
            orden: max,
          })
          .returning({ id: modelos.id });
        modeloId = creado.id;
      }

      for (const p of ["palet", "optimizado"] as const) {
        const cantidad = d.normas[p];
        if (cantidad == null) {
          await tx
            .delete(normas)
            .where(and(eq(normas.modeloId, modeloId), eq(normas.packaging, p)));
        } else {
          await tx
            .insert(normas)
            .values({ modeloId, packaging: p as Packaging, cantidad })
            .onConflictDoUpdate({
              target: [normas.modeloId, normas.packaging],
              set: { cantidad },
            });
        }
      }
    });
    revalidatePath("/", "layout");
  });
}

/* -------------------------------------------------------------------------- */
/* Racks y posiciones                                                         */
/* -------------------------------------------------------------------------- */

const esquemaRack = z.object({
  id: z.number().int().positive().optional(),
  codigo: z.string().trim().min(1, "Falta el código del rack.").max(10),
  nombre: z.string().trim().max(60).optional(),
  accesibilidad: z.enum(["selectivo", "penetrable"]),
  activo: z.boolean(),
});

export async function guardarRack(
  entrada: z.input<typeof esquemaRack>,
): Promise<Resultado<{ id: number }>> {
  return ejecutar(async () => {
    await autorizar("admin");
    const d = esquemaRack.parse(entrada);
    const codigo = d.codigo.toUpperCase();

    if (d.id) {
      await db
        .update(racks)
        .set({
          codigo,
          nombre: d.nombre || null,
          accesibilidad: d.accesibilidad,
          activo: d.activo,
        })
        .where(eq(racks.id, d.id));
      revalidatePath("/", "layout");
      return { id: d.id };
    }

    const [ya] = await db
      .select({ id: racks.id })
      .from(racks)
      .where(eq(racks.codigo, codigo))
      .limit(1);
    if (ya) fallar(`Ya hay un rack ${codigo}.`);

    const [{ max }] = (await db.execute(
      sql`select coalesce(max(orden), -1) + 1 as max from racks`,
    )) as unknown as Array<{ max: number }>;

    const [creado] = await db
      .insert(racks)
      .values({
        codigo,
        nombre: d.nombre || null,
        accesibilidad: d.accesibilidad,
        activo: d.activo,
        orden: max,
      })
      .returning({ id: racks.id });

    revalidatePath("/", "layout");
    return { id: creado.id };
  });
}

const esquemaPosiciones = z.object({
  rackId: z.number().int().positive(),
  desde: z.number().int().min(1, "El número de inicio tiene que ser 1 o más."),
  hasta: z.number().int().min(1),
  /** Cuántos bultos de fondo. Vacío en un rack selectivo. */
  profundidad: z.number().int().min(1).max(20).nullable(),
});

/**
 * Crea las posiciones de un rack de una sola vez.
 *
 * Un rack tiene veinte o treinta posiciones y cargarlas de a una es media hora
 * de tocar botones. Las que ya existen se saltean, así se puede volver a correr
 * para ampliar un rack sin tocar lo que ya está.
 */
export async function generarPosiciones(
  entrada: z.input<typeof esquemaPosiciones>,
): Promise<Resultado<{ creadas: number; salteadas: number }>> {
  return ejecutar(async () => {
    await autorizar("admin");
    const d = esquemaPosiciones.parse(entrada);
    if (d.hasta < d.desde) fallar("El número final tiene que ser mayor al inicial.");
    if (d.hasta - d.desde > 200) fallar("Son demasiadas posiciones de una vez.");

    const existentes = (await db.execute(
      sql`select codigo from posiciones where rack_id = ${d.rackId}`,
    )) as unknown as Array<{ codigo: string }>;
    const ya = new Set(existentes.map((e) => e.codigo));

    const nuevas: Array<typeof posiciones.$inferInsert> = [];
    for (let n = d.desde; n <= d.hasta; n++) {
      if (ya.has(String(n))) continue;
      nuevas.push({
        rackId: d.rackId,
        codigo: String(n),
        profundidad: d.profundidad,
        capacidadBultos: d.profundidad ?? 1,
        orden: n,
      });
    }

    if (nuevas.length > 0) await db.insert(posiciones).values(nuevas);
    revalidatePath("/", "layout");
    return {
      creadas: nuevas.length,
      salteadas: d.hasta - d.desde + 1 - nuevas.length,
    };
  });
}

export async function suspenderPosicion(
  id: number,
  activa: boolean,
): Promise<Resultado<void>> {
  return ejecutar(async () => {
    await autorizar("admin");

    if (!activa) {
      const [{ cuantos }] = (await db.execute(
        sql`select count(*)::int as cuantos from bultos
             where posicion_id = ${id} and estado = 'ubicado'`,
      )) as unknown as Array<{ cuantos: number }>;
      if (cuantos > 0) {
        fallar(
          `No se puede suspender: todavía tiene ${cuantos} bulto${cuantos === 1 ? "" : "s"} adentro. ` +
            `Sacalos o movelos primero.`,
        );
      }
    }

    await db.update(posiciones).set({ activa }).where(eq(posiciones.id, id));
    revalidatePath("/", "layout");
  });
}

/* -------------------------------------------------------------------------- */
/* Motivos                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Los motivos son CONFIGURACIÓN, no datos de prueba: por eso el borrado total no
 * los toca. Sin motivos no se puede sacar nada del rack, y quedarse sin ellos
 * justo al empezar a trabajar en serio sería el peor momento posible.
 */
const ESTANDAR: Array<{
  nombre: string;
  ambito: "salida" | "ajuste";
  esEgreso?: boolean;
}> = [
  { nombre: "Entrega a cliente", ambito: "salida" },
  { nombre: "Muestra", ambito: "salida" },
  { nombre: "Rotura o descarte", ambito: "salida" },
  { nombre: "Rearmado o reempaque", ambito: "salida", esEgreso: false },
  { nombre: "Otro", ambito: "salida" },
  { nombre: "Cantidad distinta a la registrada", ambito: "ajuste" },
  { nombre: "Bulto en otra posición", ambito: "ajuste" },
  { nombre: "Modelo equivocado", ambito: "ajuste" },
  { nombre: "Posición vacía en el sistema", ambito: "ajuste" },
];

export async function cargarMotivosEstandar(): Promise<
  Resultado<{ creados: number }>
> {
  return ejecutar(async () => {
    await autorizar("admin");
    const existentes = (await db.execute(
      sql`select nombre from motivos`,
    )) as unknown as Array<{ nombre: string }>;
    const ya = new Set(existentes.map((e) => e.nombre.toLowerCase()));

    const nuevos = ESTANDAR.filter((m) => !ya.has(m.nombre.toLowerCase()));
    if (nuevos.length > 0) {
      await db
        .insert(motivos)
        .values(nuevos.map((m, i) => ({ ...m, orden: ya.size + i })));
    }
    revalidatePath("/", "layout");
    return { creados: nuevos.length };
  });
}

const esquemaMotivo = z.object({
  id: z.number().int().positive().optional(),
  nombre,
  ambito: z.enum(["salida", "ajuste"]),
  esEgreso: z.boolean(),
  activo: z.boolean(),
});

export async function guardarMotivo(
  entrada: z.input<typeof esquemaMotivo>,
): Promise<Resultado<void>> {
  return ejecutar(async () => {
    await autorizar("admin");
    const d = esquemaMotivo.parse(entrada);

    if (d.id) {
      await db
        .update(motivos)
        .set({
          nombre: d.nombre,
          ambito: d.ambito,
          esEgreso: d.esEgreso,
          activo: d.activo,
        })
        .where(eq(motivos.id, d.id));
    } else {
      const [{ max }] = (await db.execute(
        sql`select coalesce(max(orden), -1) + 1 as max from motivos`,
      )) as unknown as Array<{ max: number }>;
      await db.insert(motivos).values({
        nombre: d.nombre,
        ambito: d.ambito,
        esEgreso: d.esEgreso,
        activo: d.activo,
        orden: max,
      });
    }
    revalidatePath("/", "layout");
  });
}

/* -------------------------------------------------------------------------- */
/* Usuarios                                                                   */
/* -------------------------------------------------------------------------- */

const esquemaUsuario = z.object({
  id: z.number().int().positive().optional(),
  usuario: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "El usuario necesita al menos 3 letras.")
    .max(20)
    .regex(/^[a-z0-9._-]+$/, "El usuario va sin espacios ni acentos."),
  nombre,
  rol: z.enum(ROLES as [string, ...string[]]),
  activo: z.boolean(),
  /** Solo al crear, o cuando se resetea. Vacío al editar deja el PIN como está. */
  pin: z
    .string()
    .trim()
    .regex(/^\d{4,8}$/, "El PIN son entre 4 y 8 números.")
    .optional()
    .or(z.literal("")),
});

export async function guardarUsuario(
  entrada: z.input<typeof esquemaUsuario>,
): Promise<Resultado<void>> {
  return ejecutar(async () => {
    const sesion = await autorizar("admin");
    const d = esquemaUsuario.parse(entrada);

    if (d.id) {
      /**
       * El admin no se puede desactivar a sí mismo. Es el candado más barato
       * del sistema y evita el peor error posible: quedarse afuera sin nadie
       * que pueda volver a entrar.
       */
      if (d.id === sesion.uid && (!d.activo || d.rol !== "admin")) {
        fallar("No podés sacarte a vos mismo el acceso de administrador.");
      }

      await db
        .update(usuarios)
        .set({
          usuario: d.usuario,
          nombre: d.nombre,
          rol: d.rol as (typeof ROLES)[number],
          activo: d.activo,
          ...(d.pin
            ? { pinHash: await hashPin(d.pin), intentosFallidos: 0, bloqueadoHasta: null }
            : {}),
        })
        .where(eq(usuarios.id, d.id));
    } else {
      if (!d.pin) fallar("Poné un PIN para el usuario nuevo.");
      const [ya] = await db
        .select({ id: usuarios.id })
        .from(usuarios)
        .where(eq(usuarios.usuario, d.usuario))
        .limit(1);
      if (ya) fallar(`Ya existe el usuario "${d.usuario}".`);

      await db.insert(usuarios).values({
        usuario: d.usuario,
        nombre: d.nombre,
        rol: d.rol as (typeof ROLES)[number],
        activo: d.activo,
        pinHash: await hashPin(d.pin),
      });
    }
    revalidatePath("/", "layout");
  });
}

/** Destraba a quien se equivocó cinco veces el PIN y quedó bloqueado. */
export async function destrabar(id: number): Promise<Resultado<void>> {
  return ejecutar(async () => {
    await autorizar("admin");
    await db
      .update(usuarios)
      .set({ intentosFallidos: 0, bloqueadoHasta: null })
      .where(eq(usuarios.id, id));
    revalidatePath("/", "layout");
  });
}

export async function suspenderModelo(
  id: number,
  activo: boolean,
): Promise<Resultado<void>> {
  return ejecutar(async () => {
    await autorizar("admin");

    if (!activo) {
      const [{ cuantos }] = (await db.execute(
        sql`select count(*)::int as cuantos
              from bulto_contenido c join bultos b on b.id = c.bulto_id
             where c.modelo_id = ${id} and b.estado in ('ubicado','sin_ubicar')`,
      )) as unknown as Array<{ cuantos: number }>;
      if (cuantos > 0) {
        fallar(
          `No se puede suspender: hay ${cuantos} bulto${cuantos === 1 ? "" : "s"} con este modelo en stock.`,
        );
      }
    }

    await db.update(modelos).set({ activo }).where(eq(modelos.id, id));
    revalidatePath("/", "layout");
  });
}

