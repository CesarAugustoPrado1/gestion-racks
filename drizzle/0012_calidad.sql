/*
 * Producto de PRIMERA y de SEGUNDA.
 *
 * - `bultos.calidad`: la categoría de cada bulto. Todo lo que ya está cargado
 *   queda de primera, que es el default y lo que se venía asumiendo.
 * - `movimientos.calidad_antes` / `movimientos.calidad`: la categoría antes y
 *   después de cada movimiento, con la misma convención que la cantidad. En un
 *   ingreso son iguales; en un pasaje o una corrección, distintas. Así el
 *   historial dice siempre quién cambió la categoría, cuándo y de qué a qué.
 * - `tipo_movimiento` gana 'categoria': el PASAJE de categoría, cuando se
 *   detecta después que un bulto es de otra categoría. No mueve stock ni
 *   posición.
 * - El motivo de ajuste "Categoría equivocada", para cuando control encuentra
 *   un bulto registrado con la categoría que no es: eso es un error del
 *   registro y se corrige como cualquier otro ajuste.
 *
 * ESCRITA A MANO, segura sobre datos existentes y se puede volver a correr.
 * `ADD VALUE` puede ir en una transacción porque el valor no se usa en ella.
 */

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'calidad') THEN
    CREATE TYPE "public"."calidad" AS ENUM('primera', 'segunda');
  END IF;
END $$;--> statement-breakpoint
ALTER TYPE "public"."tipo_movimiento" ADD VALUE IF NOT EXISTS 'categoria';--> statement-breakpoint
ALTER TABLE "bultos" ADD COLUMN IF NOT EXISTS "calidad" "calidad" DEFAULT 'primera' NOT NULL;--> statement-breakpoint
ALTER TABLE "movimientos" ADD COLUMN IF NOT EXISTS "calidad_antes" "calidad" DEFAULT 'primera' NOT NULL;--> statement-breakpoint
ALTER TABLE "movimientos" ADD COLUMN IF NOT EXISTS "calidad" "calidad" DEFAULT 'primera' NOT NULL;--> statement-breakpoint
-- El orden va en una subconsulta: un SELECT con max() devuelve una fila aunque
-- el WHERE no deje ninguna, y entonces el NOT EXISTS no frenaría nada.
INSERT INTO "motivos" ("nombre", "ambito", "es_egreso", "activo", "orden")
SELECT 'Categoría equivocada', 'ajuste', false, true,
       (SELECT coalesce(max("orden"), 0) + 1 FROM "motivos")
WHERE NOT EXISTS (SELECT 1 FROM "motivos" WHERE lower("nombre") = 'categoría equivocada');
