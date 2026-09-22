/*
 * Movimientos: de siete tipos por intención a cuatro por efecto sobre el stock.
 *
 * ESTA MIGRACIÓN ESTÁ ESCRITA A MANO. La que generó drizzle-kit fallaba contra
 * cualquier base con datos, por dos motivos distintos:
 *
 *   1. `ADD COLUMN cantidad_antes integer NOT NULL` sin default aborta apenas
 *      hay una fila.
 *   2. Los casts de enum (`USING estado::estado_bulto`) revientan porque los
 *      valores viejos -'en_rack', 'alta', 'entrega'- no existen en los tipos
 *      nuevos. Hay que TRADUCIRLOS antes de castear.
 *
 * Es la misma pregunta de siempre después de cada migración: ¿qué filas ya
 * existentes quedan mal? Acá, todas.
 */

/* --- Motivos: columnas nuevas, y el ámbito pasa a dos valores ------------- */

ALTER TABLE "motivos" ADD COLUMN "es_egreso" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "motivos" ADD COLUMN "orden" integer DEFAULT 0 NOT NULL;--> statement-breakpoint

ALTER TABLE "public"."motivos" ALTER COLUMN "ambito" SET DATA TYPE text;--> statement-breakpoint
UPDATE "motivos" SET "ambito" = 'salida' WHERE "ambito" IN ('entrega', 'reempaque');--> statement-breakpoint
UPDATE "motivos" SET "es_egreso" = false WHERE "nombre" ILIKE '%rearmad%' OR "nombre" ILIKE '%reempaq%' OR "nombre" ILIKE '%desarmad%';--> statement-breakpoint
DROP TYPE "public"."ambito_motivo";--> statement-breakpoint
CREATE TYPE "public"."ambito_motivo" AS ENUM('salida', 'ajuste');--> statement-breakpoint
ALTER TABLE "public"."motivos" ALTER COLUMN "ambito" SET DATA TYPE "public"."ambito_motivo" USING "ambito"::"public"."ambito_motivo";--> statement-breakpoint

/* --- Antes y después ------------------------------------------------------ */

/*
 * Se agrega CON default para que las filas viejas no aborten el ALTER, y el
 * default se saca después: el esquema no lo tiene, y no debe tenerlo. Un
 * `cantidad_antes` que se completa solo con 0 escondería el error de un
 * movimiento mal escrito.
 *
 * Para el historial viejo, 0 es el valor correcto: los únicos movimientos que
 * existían eran altas y subidas de bultos que se creaban en ese momento.
 */
ALTER TABLE "movimientos" ADD COLUMN "cantidad_antes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "movimientos" ALTER COLUMN "cantidad_antes" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "movimientos" ADD COLUMN "packaging_antes" "packaging";--> statement-breakpoint
UPDATE "movimientos" SET "packaging_antes" = "packaging";--> statement-breakpoint
ALTER TABLE "movimiento_lineas" ADD COLUMN "cantidad_antes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint

/* --- Estados del bulto ---------------------------------------------------- */

ALTER TABLE "bultos" ALTER COLUMN "estado" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "public"."bultos" ALTER COLUMN "estado" SET DATA TYPE text;--> statement-breakpoint
UPDATE "bultos" SET "estado" = CASE "estado"
  WHEN 'en_rack'   THEN 'ubicado'
  WHEN 'en_piso'   THEN 'sin_ubicar'
  WHEN 'entregado' THEN 'salido'
  WHEN 'desarmado' THEN 'salido'
  ELSE "estado" END;--> statement-breakpoint
DROP TYPE "public"."estado_bulto";--> statement-breakpoint
CREATE TYPE "public"."estado_bulto" AS ENUM('ubicado', 'sin_ubicar', 'salido');--> statement-breakpoint
ALTER TABLE "public"."bultos" ALTER COLUMN "estado" SET DATA TYPE "public"."estado_bulto" USING "estado"::"public"."estado_bulto";--> statement-breakpoint

/* --- Tipos de movimiento -------------------------------------------------- */

ALTER TABLE "public"."movimientos" ALTER COLUMN "tipo" SET DATA TYPE text;--> statement-breakpoint

/*
 * El `alta` viejo y el `subir` que le seguía son, en el modelo nuevo, UN SOLO
 * movimiento: meter al rack. Si los dos se tradujeran a 'meter', el bulto
 * entraría dos veces y el stock quedaría al doble.
 *
 * Se borra el `alta` y se conserva el `subir`, que es el que tiene la posición.
 * Es el único DELETE de esta migración y está acá para que las sumas no
 * mientan, no por prolijidad.
 */
DELETE FROM "movimientos" m
 WHERE m."tipo" = 'alta'
   AND EXISTS (SELECT 1 FROM "movimientos" s
                WHERE s."bulto_id" = m."bulto_id" AND s."tipo" = 'subir');--> statement-breakpoint

UPDATE "movimientos" SET "tipo" = CASE "tipo"
  WHEN 'alta'      THEN 'meter'
  WHEN 'subir'     THEN 'meter'
  WHEN 'bajar'     THEN 'sacar'
  WHEN 'entrega'   THEN 'sacar'
  WHEN 'reempaque' THEN 'sacar'
  ELSE "tipo" END;--> statement-breakpoint

/*
 * Traducir el tipo no alcanza: hay que traducir también los NÚMEROS, porque el
 * modelo viejo guardaba "cuánto movió" y el nuevo guarda "antes y después".
 *
 * Sin esto, una entrega vieja queda con antes 0 y después 12, o sea SUMANDO 12
 * al stock de algo que salió de la fábrica. Se detectó midiendo: sobre dos
 * bultos de prueba, el stock de Ekos daba 24 donde tenía que dar 0.
 *
 *   sacar   lo que salió entero:  antes = cantidad, después = 0
 *   mover   no cambia nada:       antes = cantidad, después = cantidad
 *   ajuste  sin forma de saber qué decía antes; se deja neutro y no inventando
 *           una corrección que nadie hizo.
 */
UPDATE "movimientos" SET "cantidad_antes" = "cantidad", "cantidad" = 0 WHERE "tipo" = 'sacar';--> statement-breakpoint
UPDATE "movimiento_lineas" l SET "cantidad_antes" = l."cantidad", "cantidad" = 0
  FROM "movimientos" m WHERE m."id" = l."movimiento_id" AND m."tipo" = 'sacar';--> statement-breakpoint
UPDATE "movimientos" SET "cantidad_antes" = "cantidad" WHERE "tipo" IN ('mover', 'ajuste');--> statement-breakpoint
UPDATE "movimiento_lineas" l SET "cantidad_antes" = l."cantidad"
  FROM "movimientos" m WHERE m."id" = l."movimiento_id" AND m."tipo" IN ('mover', 'ajuste');--> statement-breakpoint

DROP TYPE "public"."tipo_movimiento";--> statement-breakpoint
CREATE TYPE "public"."tipo_movimiento" AS ENUM('meter', 'sacar', 'mover', 'ajuste');--> statement-breakpoint
ALTER TABLE "public"."movimientos" ALTER COLUMN "tipo" SET DATA TYPE "public"."tipo_movimiento" USING "tipo"::"public"."tipo_movimiento";
