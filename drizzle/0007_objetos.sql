/*
 * Bultos que NO son producto: sillas a reparar, un aire acondicionado viejo.
 *
 * Ocupan una posición -el tablero la tiene que mostrar llena y no ofrecerla
 * como libre- pero no son stock: no tienen modelo ni cantidad, y no suman ni
 * restan en ninguna cuenta. Se describen con texto libre.
 *
 * - `packaging` gana el valor 'objeto'. Es el lugar natural: el packaging ya
 *   dice "qué clase de bulto es" y cada valor tiene su regla.
 * - `bultos.descripcion`: qué hay en el palet. Obligatoria para un objeto.
 * - `movimientos.descripcion`: la misma descripción congelada en el historial,
 *   igual que el nombre del modelo en las líneas: si después se corrige el
 *   texto del bulto, lo que se movió ese día no cambia.
 *
 * ESCRITA A MANO y segura sobre datos existentes: todo es agregado y nullable.
 * Se puede volver a correr: cada sentencia se fija si ya está.
 *
 * `ALTER TYPE ... ADD VALUE` puede ir dentro de una transacción (Postgres 12 o
 * más) siempre que el valor nuevo no se USE en la misma transacción, y acá no
 * se usa.
 */

ALTER TYPE "public"."packaging" ADD VALUE IF NOT EXISTS 'objeto';--> statement-breakpoint
ALTER TABLE "bultos" ADD COLUMN IF NOT EXISTS "descripcion" text;--> statement-breakpoint
ALTER TABLE "movimientos" ADD COLUMN IF NOT EXISTS "descripcion" text;
