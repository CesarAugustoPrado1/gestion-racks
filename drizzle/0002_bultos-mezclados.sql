CREATE TABLE "bulto_contenido" (
	"id" serial PRIMARY KEY NOT NULL,
	"bulto_id" integer NOT NULL,
	"modelo_id" integer NOT NULL,
	"cantidad" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "movimiento_lineas" (
	"id" serial PRIMARY KEY NOT NULL,
	"movimiento_id" integer NOT NULL,
	"modelo_id" integer NOT NULL,
	"modelo_nombre" text NOT NULL,
	"cantidad" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bultos" DROP CONSTRAINT "bultos_modelo_id_modelos_id_fk";
--> statement-breakpoint
ALTER TABLE "movimientos" DROP CONSTRAINT "movimientos_modelo_id_modelos_id_fk";
--> statement-breakpoint
DROP INDEX "bultos_modelo_packaging";--> statement-breakpoint
ALTER TABLE "bulto_contenido" ADD CONSTRAINT "bulto_contenido_bulto_id_bultos_id_fk" FOREIGN KEY ("bulto_id") REFERENCES "public"."bultos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulto_contenido" ADD CONSTRAINT "bulto_contenido_modelo_id_modelos_id_fk" FOREIGN KEY ("modelo_id") REFERENCES "public"."modelos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimiento_lineas" ADD CONSTRAINT "movimiento_lineas_movimiento_id_movimientos_id_fk" FOREIGN KEY ("movimiento_id") REFERENCES "public"."movimientos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimiento_lineas" ADD CONSTRAINT "movimiento_lineas_modelo_id_modelos_id_fk" FOREIGN KEY ("modelo_id") REFERENCES "public"."modelos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bulto_contenido_bulto_modelo" ON "bulto_contenido" USING btree ("bulto_id","modelo_id");--> statement-breakpoint
CREATE INDEX "bulto_contenido_modelo" ON "bulto_contenido" USING btree ("modelo_id");--> statement-breakpoint
CREATE INDEX "movimiento_lineas_movimiento" ON "movimiento_lineas" USING btree ("movimiento_id");--> statement-breakpoint
CREATE INDEX "bultos_packaging" ON "bultos" USING btree ("packaging","estado");--> statement-breakpoint
/*
 * BACKFILL. Lo escribió una persona, no drizzle-kit.
 *
 * `drizzle-kit generate` sincroniza el ESQUEMA, no los DATOS: sin estas dos
 * sentencias, los DROP COLUMN de abajo se llevarían el modelo de cada bulto y de
 * cada movimiento que ya estuviera cargado, y no hay forma de recuperarlo.
 *
 * Es la pregunta que hay que hacerse después de toda migración: ¿qué filas ya
 * existentes quedan con el valor equivocado? Acá la respuesta era "todas".
 *
 * Cada bulto que existía es de un solo modelo -no había otra forma de
 * registrarlo- así que se convierte en exactamente una línea de contenido.
 */
INSERT INTO "bulto_contenido" ("bulto_id", "modelo_id", "cantidad")
  SELECT "id", "modelo_id", "cantidad" FROM "bultos";
--> statement-breakpoint
INSERT INTO "movimiento_lineas" ("movimiento_id", "modelo_id", "modelo_nombre", "cantidad")
  SELECT "id", "modelo_id", "modelo_nombre", "cantidad" FROM "movimientos";
--> statement-breakpoint
ALTER TABLE "bultos" DROP COLUMN "modelo_id";--> statement-breakpoint
ALTER TABLE "movimientos" DROP COLUMN "modelo_id";--> statement-breakpoint
ALTER TABLE "movimientos" DROP COLUMN "modelo_nombre";