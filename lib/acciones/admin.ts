"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { autorizar, hashPin } from "../auth";
import {
  grupos,
  lineas,
  modelos,
  motivos,
  nivelesDeGrupo,
  normas,
  posiciones,
  usuarios,
  type Packaging,
} from "../db/schema";
import { CLAVE_OLVIDO, CLAVE_SEMIVIDA, escribirConfig } from "../configuracion";
import { ROLES } from "../permisos";
import { codigoDePosicion, posicionesDe, type Geometria } from "../posiciones";
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
    palet: z.object({
      cantidad: z.number().int().positive().nullable(),
      alturaCm: z.number().int().positive().nullable(),
    }),
    optimizado: z.object({
      cantidad: z.number().int().positive().nullable(),
      alturaCm: z.number().int().positive().nullable(),
    }),
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
        const { cantidad, alturaCm } = d.normas[p];
        // Sin cantidad no hay norma: la altura sola no describe nada.
        if (cantidad == null) {
          await tx
            .delete(normas)
            .where(and(eq(normas.modeloId, modeloId), eq(normas.packaging, p)));
        } else {
          await tx
            .insert(normas)
            .values({ modeloId, packaging: p as Packaging, cantidad, alturaCm })
            .onConflictDoUpdate({
              target: [normas.modeloId, normas.packaging],
              set: { cantidad, alturaCm },
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

const esquemaGrupo = z.object({
  id: z.number().int().positive().optional(),
  codigo: z.string().trim().min(1, "Falta el código del grupo.").max(10),
  nombre: z.string().trim().max(60).optional(),
  accesibilidad: z.enum(["selectivo", "penetrable"]),
  ancho: z.number().int().min(1).max(10).nullable(),
  niveles: z.number().int().min(1, "Un grupo tiene al menos un nivel.").max(10),
  profundidad: z.number().int().min(1).max(10).nullable(),
  unidades: z.number().int().min(0).max(200),
  activo: z.boolean(),
});

/**
 * Crea las posiciones que le faltan al grupo según su geometría.
 *
 * Nunca borra: una posición que ya tuvo bultos aparece en el historial y tiene
 * que seguir existiendo. Si el grupo se achica, las que sobran se suspenden a
 * mano desde la pantalla, y solo si están vacías.
 *
 * Es idempotente, así que se puede correr cada vez que se guarda el grupo: si
 * se agregan calles, aparecen las nuevas y nada más.
 */
async function sincronizarPosiciones(
  grupoId: number,
  g: Geometria,
): Promise<number> {
  const existentes = (await db.execute(
    sql`select codigo from posiciones where grupo_id = ${grupoId}`,
  )) as unknown as Array<{ codigo: string }>;
  const ya = new Set(existentes.map((e) => e.codigo));

  const nuevas = posicionesDe(g)
    .map((c) => ({ c, codigo: codigoDePosicion(c) }))
    .filter(({ codigo }) => !ya.has(codigo));

  if (nuevas.length > 0) {
    await db.insert(posiciones).values(
      nuevas.map(({ c, codigo }, i) => ({
        grupoId,
        codigo,
        unidad: c.unidad,
        columna: c.columna,
        nivel: c.nivel,
        profundidad: c.profundidad,
        orden: ya.size + i,
      })),
    );
  }

  // Un nivel por cada altura configurable, para poder medirlos después.
  for (let n = 1; n <= g.niveles; n++) {
    await db
      .insert(nivelesDeGrupo)
      .values({ grupoId, nivel: n })
      .onConflictDoNothing();
  }

  return nuevas.length;
}

export async function guardarGrupo(
  entrada: z.input<typeof esquemaGrupo>,
): Promise<Resultado<{ id: number; posicionesNuevas: number }>> {
  return ejecutar(async () => {
    await autorizar("admin");
    const d = esquemaGrupo.parse(entrada);
    const codigo = d.codigo.toUpperCase();

    const selectivo = d.accesibilidad === "selectivo";
    const ancho = selectivo ? (d.ancho ?? 2) : null;
    const profundidad = selectivo ? null : (d.profundidad ?? 2);
    if (selectivo && ancho == null) fallar("Falta el ancho del módulo.");
    if (!selectivo && profundidad == null) fallar("Falta la profundidad de la calle.");

    const geometria: Geometria = {
      tipo: d.accesibilidad,
      ancho,
      niveles: d.niveles,
      profundidad,
      unidades: d.unidades,
    };

    const valores = {
      codigo,
      nombre: d.nombre || null,
      accesibilidad: d.accesibilidad,
      ancho,
      niveles: d.niveles,
      profundidad,
      unidades: d.unidades,
      activo: d.activo,
    };

    let id = d.id;
    if (id) {
      await db.update(grupos).set(valores).where(eq(grupos.id, id));
    } else {
      const [ya] = await db
        .select({ id: grupos.id })
        .from(grupos)
        .where(eq(grupos.codigo, codigo))
        .limit(1);
      if (ya) fallar(`Ya hay un grupo ${codigo}.`);

      const [{ max }] = (await db.execute(
        sql`select coalesce(max(orden), -1) + 1 as max from grupos`,
      )) as unknown as Array<{ max: number }>;

      const [creado] = await db
        .insert(grupos)
        .values({ ...valores, orden: max })
        .returning({ id: grupos.id });
      id = creado.id;
    }

    const posicionesNuevas = await sincronizarPosiciones(id, geometria);
    revalidatePath("/", "layout");
    return { id, posicionesNuevas };
  });
}

/**
 * La altura libre de un nivel, en centímetros.
 *
 * Vacío la borra y vuelve a "sin medir", que NO es cero: sin medir el sistema
 * no valida nada, y cero significaría que no entra nada. Poder volver atrás
 * importa, porque el primer número que se carga suele ser el de la cinta mal
 * leída.
 */
export async function guardarAlturaNivel(
  grupoId: number,
  nivel: number,
  alturaCm: number | null,
): Promise<Resultado<void>> {
  return ejecutar(async () => {
    await autorizar("admin");
    if (alturaCm != null && (alturaCm < 20 || alturaCm > 1500)) {
      fallar("La altura tiene que estar entre 20 y 1500 cm.");
    }
    await db
      .insert(nivelesDeGrupo)
      .values({ grupoId, nivel, alturaMaxCm: alturaCm })
      .onConflictDoUpdate({
        target: [nivelesDeGrupo.grupoId, nivelesDeGrupo.nivel],
        set: { alturaMaxCm: alturaCm },
      });
    revalidatePath("/", "layout");
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
          `No se puede suspender: todavía tiene un bulto adentro. Sacalo o movelo primero.`,
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


/* -------------------------------------------------------------------------- */
/* Ajustes del índice de confiabilidad                                        */
/* -------------------------------------------------------------------------- */

/**
 * A los cuántos días un chequeo vale la mitad. Ver DISENO.md §5.3.
 *
 * El rango no es decorativo. Por abajo, menos de 5 días hace que todo se ponga
 * rojo en una semana y la recorrida deje de distinguir lo urgente de lo demás:
 * si todo grita, nada grita. Por arriba, más de 365 es lo mismo al revés —nada
 * envejece nunca y el tablero queda verde para siempre—, y un tablero siempre
 * verde no distingue un galpón controlado de uno abandonado.
 *
 * Entero y en días porque es lo que alguien puede comparar con su propia
 * recorrida: "tardo tres semanas en dar la vuelta" se escribe 21.
 */
const esquemaSemivida = z.object({
  dias: z.coerce
    .number({ invalid_type_error: "Poné un número de días." })
    .int("Tiene que ser un número entero de días.")
    .min(5, "Menos de 5 días hace que todo se ponga rojo en una semana.")
    .max(365, "Más de un año es como no tener vencimiento."),
});

export async function guardarSemivida(
  entrada: z.input<typeof esquemaSemivida>,
): Promise<Resultado<void>> {
  return ejecutar(async () => {
    await autorizar("admin");
    const d = esquemaSemivida.parse(entrada);

    await escribirConfig(CLAVE_SEMIVIDA, String(d.dias));

    /**
     * `layout` y no una ruta: la confianza se muestra en el tablero, en la
     * recorrida, en la ficha de cada bulto y en el detalle de posición. Cambiar
     * esto cambia un número que está en media app.
     */
    revalidatePath("/", "layout");
  });
}

/**
 * A los cuántos días sin mirarla una posición con producto sube al tope.
 *
 * El 0 es un valor legítimo y significa "sin piso": vuelve al orden puro por
 * urgencia. Se permite porque quien lo apague tiene que poder apagarlo, pero el
 * default viene prendido (ver `olvidoDias`).
 *
 * El mínimo distinto de cero es 7: un piso más corto que una semana pondría
 * arriba media planta todos los lunes y dejaría de señalar algo.
 */
const esquemaOlvido = z.object({
  dias: z.coerce
    .number({ invalid_type_error: "Poné un número de días." })
    .int("Tiene que ser un número entero de días.")
    .min(0)
    .max(730, "Más de dos años es como no tener piso.")
    .refine((d) => d === 0 || d >= 7, {
      message: "Poné 0 para desactivarlo, o 7 días como mínimo.",
    }),
});

export async function guardarOlvido(
  entrada: z.input<typeof esquemaOlvido>,
): Promise<Resultado<void>> {
  return ejecutar(async () => {
    await autorizar("admin");
    const d = esquemaOlvido.parse(entrada);
    await escribirConfig(CLAVE_OLVIDO, String(d.dias));
    revalidatePath("/", "layout");
  });
}
