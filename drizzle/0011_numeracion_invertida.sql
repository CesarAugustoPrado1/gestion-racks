/*
 * Grupos numerados de derecha a izquierda.
 *
 * En la planta hay grupos donde la columna o la calle 01 está a la DERECHA,
 * por cómo quedaron ubicados. Los códigos no cambian -son los pintados en el
 * fierro-: cambia el dibujo, que pone la 01 a la derecha para que la pantalla
 * se vea como el rack parado enfrente.
 *
 * Default false: de izquierda a derecha, como estaban todos. Se cambia desde
 * Administración → Grupos de racks.
 *
 * ESCRITA A MANO, segura sobre datos existentes y se puede volver a correr.
 */

ALTER TABLE "grupos" ADD COLUMN IF NOT EXISTS "numeracion_invertida" boolean DEFAULT false NOT NULL;
