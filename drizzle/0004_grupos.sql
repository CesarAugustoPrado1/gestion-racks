/*
 * Los racks pasan a ser GRUPOS con geometría, y cada posición a ser el lugar
 * de UN bulto.
 *
 * ESCRITA A MANO. La que generó drizzle-kit hacía tres cosas que no se pueden
 * hacer contra una base con datos:
 *   - DROP TABLE racks CASCADE, que se lleva los racks y todo lo que cuelgue.
 *   - ADD COLUMN grupo_id NOT NULL sin default, que aborta con una sola fila.
 *   - ALTER COLUMN nivel SET NOT NULL, cuando las filas viejas lo tienen en null.
 *
 * Esta preserva todo lo que se puede preservar. Lo que NO se puede es inventar
 * la geometría real: las posiciones viejas no tienen nivel ni columna, así que
 * quedan todas en el nivel 1. Al editar el grupo desde Administración, el
 * sistema genera las que faltan. Para una instalación de prueba, lo correcto es
 * borrar todo y volver a cargar los grupos con su geometría de verdad.
 */

/* --- Los racks pasan a ser grupos ----------------------------------------- */

ALTER TABLE "racks" RENAME TO "grupos";--> statement-breakpoint
ALTER TABLE "grupos" RENAME CONSTRAINT "racks_codigo_unique" TO "grupos_codigo_unique";--> statement-breakpoint

ALTER TABLE "grupos" ADD COLUMN "ancho" integer;--> statement-breakpoint
ALTER TABLE "grupos" ADD COLUMN "niveles" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "grupos" ADD COLUMN "profundidad" integer;--> statement-breakpoint
ALTER TABLE "grupos" ADD COLUMN "unidades" integer DEFAULT 0 NOT NULL;--> statement-breakpoint

/*
 * Geometría inferida de lo que había: un selectivo lleva 2 de ancho -es el
 * único que existe en la planta- y un penetrable hereda la profundidad que
 * tenían sus carriles. `unidades` sale de contar las posiciones viejas, que
 * eran una por módulo o calle.
 */
UPDATE "grupos" g SET
  "ancho" = CASE WHEN g."accesibilidad" = 'selectivo' THEN 2 ELSE NULL END,
  "profundidad" = CASE WHEN g."accesibilidad" = 'penetrable'
                       THEN coalesce((SELECT max(p."profundidad") FROM "posiciones" p
                                       WHERE p."rack_id" = g."id"), 2)
                       ELSE NULL END,
  "unidades" = coalesce((SELECT count(*) FROM "posiciones" p WHERE p."rack_id" = g."id"), 0);
--> statement-breakpoint

/* --- Las posiciones ------------------------------------------------------- */

ALTER TABLE "posiciones" RENAME COLUMN "rack_id" TO "grupo_id";--> statement-breakpoint
ALTER TABLE "posiciones" RENAME CONSTRAINT "posiciones_rack_id_racks_id_fk" TO "posiciones_grupo_id_grupos_id_fk";--> statement-breakpoint
DROP INDEX "posiciones_rack_codigo";--> statement-breakpoint

ALTER TABLE "posiciones" ADD COLUMN "unidad" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "posiciones" ADD COLUMN "columna" integer;--> statement-breakpoint

/*
 * Las posiciones viejas eran "1", "2", "3"… una por módulo o calle, sin nivel.
 * Se las ubica en el nivel 1 y se les recalcula el código con el formato nuevo,
 * para que coincida con lo que genera el sistema y no queden duplicadas cuando
 * se complete la geometría del grupo.
 */
UPDATE "posiciones" p SET
  "unidad" = coalesce(nullif(regexp_replace(p."codigo", '\D', '', 'g'), '')::int, 1),
  "nivel" = 1,
  "columna" = CASE WHEN g."accesibilidad" = 'selectivo'
                   THEN coalesce(nullif(regexp_replace(p."codigo", '\D', '', 'g'), '')::int, 1)
                   ELSE NULL END,
  "profundidad" = CASE WHEN g."accesibilidad" = 'penetrable' THEN 1 ELSE NULL END
  FROM "grupos" g WHERE g."id" = p."grupo_id";
--> statement-breakpoint

UPDATE "posiciones" p SET "codigo" =
  CASE WHEN g."accesibilidad" = 'penetrable'
       THEN lpad(p."unidad"::text, 2, '0') || '-' || p."nivel" || '-' || p."profundidad"
       ELSE lpad(coalesce(p."columna", p."unidad")::text, 2, '0') || '-' || p."nivel"
  END
  FROM "grupos" g WHERE g."id" = p."grupo_id";
--> statement-breakpoint

ALTER TABLE "posiciones" ALTER COLUMN "nivel" SET DEFAULT 1;--> statement-breakpoint
ALTER TABLE "posiciones" ALTER COLUMN "nivel" SET NOT NULL;--> statement-breakpoint

/*
 * Una posición aloja UN bulto. Las calles viejas tenían varios, así que se
 * conserva el que estaba más cerca del pasillo y el resto pasa a `sin_ubicar`:
 * el producto existe, lo que se perdió es saber en qué slot exacto está. Queda
 * en la cola del autoelevador, que es la lista de lo que hay que ir a ubicar.
 */
UPDATE "bultos" b SET "posicion_id" = NULL, "estado" = 'sin_ubicar'
 WHERE b."estado" = 'ubicado'
   AND EXISTS (SELECT 1 FROM "bultos" o
                WHERE o."posicion_id" = b."posicion_id"
                  AND o."estado" = 'ubicado'
                  AND (coalesce(o."profundidad", 1), o."id") < (coalesce(b."profundidad", 1), b."id"));
--> statement-breakpoint

ALTER TABLE "bultos" DROP COLUMN "profundidad";--> statement-breakpoint
ALTER TABLE "posiciones" DROP COLUMN "capacidad_bultos";--> statement-breakpoint

CREATE UNIQUE INDEX "posiciones_grupo_codigo" ON "posiciones" USING btree ("grupo_id","codigo");--> statement-breakpoint
CREATE INDEX "posiciones_grupo_unidad" ON "posiciones" USING btree ("grupo_id","unidad","nivel");--> statement-breakpoint

/* --- Alturas por nivel ---------------------------------------------------- */

CREATE TABLE "niveles" (
	"id" serial PRIMARY KEY NOT NULL,
	"grupo_id" integer NOT NULL,
	"nivel" integer NOT NULL,
	"altura_max_cm" integer
);
--> statement-breakpoint
ALTER TABLE "niveles" ADD CONSTRAINT "niveles_grupo_id_grupos_id_fk" FOREIGN KEY ("grupo_id") REFERENCES "public"."grupos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "niveles_grupo_nivel" ON "niveles" USING btree ("grupo_id","nivel");--> statement-breakpoint

/* Un nivel por cada uno que el grupo declara, todos sin medir. */
INSERT INTO "niveles" ("grupo_id", "nivel")
  SELECT g."id", n FROM "grupos" g, generate_series(1, g."niveles") AS n;
--> statement-breakpoint

/* --- La norma pasa a llevar también la altura ----------------------------- */

ALTER TABLE "normas" ADD COLUMN "altura_cm" integer;
