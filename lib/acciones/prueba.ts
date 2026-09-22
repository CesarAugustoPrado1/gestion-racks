"use server";

import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { autorizar } from "../auth";
import {
  CLAVE_MODO_PRUEBA,
  enModoPrueba,
  escribirConfig,
} from "../configuracion";
import { cargarDatosDeEjemplo, type ResumenEjemplo } from "../ejemplo";
import { ejecutar, fallar, type Resultado } from "./comun";

/**
 * La etapa de prueba: cargar datos inventados, mirar como se ve, borrar todo y
 * volver a empezar. Cuando eso termina, el borrado tiene que DEJAR DE EXISTIR.
 *
 * Por que un interruptor en la base y no una variable de entorno: la variable la
 * lee el deploy, y el dia que alguien clone el proyecto para otra planta se la
 * lleva puesta sin darse cuenta. El estado "esto es una instalacion de prueba"
 * es un hecho de ESTA base, y tiene que viajar con ella.
 *
 * Tres candados sobre el borrado, y ninguno sobra:
 *   1. Solo `admin`, revalidado contra la base en cada accion.
 *   2. Solo con el modo prueba encendido.
 *   3. Hay que escribir la palabra exacta. Un "¿estás seguro?" con un botón
 *      Aceptar se contesta que si sin leerlo; escribir BORRAR TODO no.
 *
 * Los USUARIOS no se tocan nunca, en ninguna de las dos operaciones. Un borrado
 * que se lleva los usuarios te deja afuera de tu propia app, y el que lo
 * descubre es el que aprieta el boton.
 */

/**
 * Orden de borrado: de lo que referencia a lo referenciado.
 *
 * `motivos` NO está en la lista, y es a propósito: son CONFIGURACIÓN, no datos
 * de prueba. Sin motivos no se puede sacar nada del rack, y quedarse sin ellos
 * justo al terminar la etapa de prueba -o sea, justo al empezar a trabajar en
 * serio- sería el peor momento posible. Se editan desde Administración.
 *
 * Tampoco están `usuarios` ni `config`, por la misma razón: un borrado que se
 * lleva los usuarios te deja afuera de tu propia app.
 */
const TABLAS_EN_ORDEN = [
  "chequeos",
  "movimiento_lineas",
  "movimientos",
  "bulto_contenido",
  "bultos",
  "posiciones",
  "racks",
  "normas",
  "modelos",
  "lineas",
];

async function exigirModoPrueba() {
  if (!(await enModoPrueba())) {
    fallar(
      "La etapa de prueba está terminada: esta instalación ya tiene datos reales. " +
        "Si de verdad hace falta volver a habilitarla, se hace desde la base.",
    );
  }
}

function exigirConfirmacion(escrito: string, esperado: string) {
  if (escrito.trim().toUpperCase() !== esperado) {
    fallar(`Para confirmar, escribí exactamente: ${esperado}`);
  }
}

async function vaciar() {
  /**
   * TRUNCATE y no DELETE: reinicia tambien los contadores, asi el primer bulto
   * despues de un borrado vuelve a ser el P-00001. Un inventario nuevo que
   * arranca en el bulto 743 hace dudar de si de verdad se borro.
   *
   * Todas juntas en una sentencia, para que las FK entre ellas no importen.
   */
  await db.execute(
    sql.raw(
      `truncate table ${TABLAS_EN_ORDEN.map((t) => `"${t}"`).join(", ")} restart identity cascade`,
    ),
  );
}

export async function cargarEjemplo(): Promise<Resultado<ResumenEjemplo>> {
  return ejecutar(async () => {
    const sesion = await autorizar("admin");
    await exigirModoPrueba();

    const [{ cuantos }] = (await db.execute(
      sql`select count(*)::int as cuantos from lineas`,
    )) as unknown as Array<{ cuantos: number }>;

    if (cuantos > 0) {
      fallar(
        "Ya hay datos cargados. Borrá todo primero: cargar el ejemplo encima " +
          "duplicaría modelos y racks, y después no se sabe qué es qué.",
      );
    }

    const resumen = await db.transaction((tx) =>
      cargarDatosDeEjemplo(tx, { id: sesion.uid, nombre: sesion.nombre }),
    );

    revalidatePath("/", "layout");
    return resumen;
  });
}

export async function borrarTodo(
  confirmacion: string,
): Promise<Resultado<void>> {
  return ejecutar(async () => {
    await autorizar("admin");
    await exigirModoPrueba();
    exigirConfirmacion(confirmacion, "BORRAR TODO");

    await vaciar();
    revalidatePath("/", "layout");
  });
}

/**
 * El unico camino de ida del sistema: borra todo y apaga el modo prueba.
 *
 * Es una sola operacion y no dos botones porque es una sola decision: "esto que
 * hay es basura de prueba, empecemos en serio". Separarlas deja el estado
 * intermedio peligroso -modo prueba apagado con datos de prueba adentro, o datos
 * reales con el boton de borrar a mano- que es justo lo que hay que evitar.
 *
 * Desde la app no se vuelve a encender. Se puede desde la base, con una linea de
 * SQL, y esta bien que cueste eso: es la diferencia entre un error de un clic y
 * un acto deliberado.
 */
export async function terminarEtapaDePrueba(
  confirmacion: string,
): Promise<Resultado<void>> {
  return ejecutar(async () => {
    await autorizar("admin");
    await exigirModoPrueba();
    exigirConfirmacion(confirmacion, "EMPEZAR EN SERIO");

    await vaciar();
    await escribirConfig(CLAVE_MODO_PRUEBA, "no");

    revalidatePath("/", "layout");
  });
}
