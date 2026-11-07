/*
 * Metros cuadrados y la foto diaria del stock.
 *
 * - `modelos.m2_por_unidad`: cuántos m² cubre una unidad del modelo (una placa
 *   de 1,20 × 2,40 son 2,88 m²). Con eso el stock se puede decir en m², y a
 *   diferencia de placas y paquetes los m² sí se suman entre líneas. Null = sin
 *   medir: ese modelo no entra en las cuentas de m², y la pantalla lo avisa.
 *
 * - `fotos_diarias`: la foto del stock al cierre de cada día, guardada. La toma
 *   un proceso programado apenas pasada la medianoche. Guarda lo que el
 *   historial no puede reconstruir después -la confiabilidad, la configuración
 *   de racks de ese día- y queda como registro de cómo se informó el stock.
 *   `origen` dice si se tomó al cierre o si se reconstruyó después (un día en
 *   que el proceso no corrió).
 *
 * Las fotos NO se modifican ni se borran: lo impide un trigger, no solo la
 * aplicación. El borrado total de la etapa de prueba usa TRUNCATE, que no pasa
 * por el trigger.
 *
 * ESCRITA A MANO, segura sobre datos existentes y se puede volver a correr.
 */

ALTER TABLE "modelos" ADD COLUMN IF NOT EXISTS "m2_por_unidad" numeric(10, 4);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fotos_diarias" (
  "id" serial PRIMARY KEY,
  "dia" date NOT NULL UNIQUE,
  "tomada_en" timestamp with time zone NOT NULL DEFAULT now(),
  "origen" text NOT NULL,
  "version" integer NOT NULL,
  "datos" jsonb NOT NULL
);--> statement-breakpoint
CREATE OR REPLACE FUNCTION "fotos_diarias_inmutables"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Las fotos diarias del stock no se modifican ni se borran.';
END;
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS "fotos_diarias_inmutables" ON "fotos_diarias";--> statement-breakpoint
CREATE TRIGGER "fotos_diarias_inmutables" BEFORE UPDATE OR DELETE ON "fotos_diarias"
  FOR EACH ROW EXECUTE FUNCTION "fotos_diarias_inmutables"();
