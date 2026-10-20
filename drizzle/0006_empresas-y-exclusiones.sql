/*
 * Tres cosas que dicen DÓNDE se puede poner un bulto y DE QUIÉN es.
 *
 * 1. Empresas. En el mismo galpón trabajan Rustikas y Pirka. Cada grupo de racks
 *    es de una, y cada modelo también: el bulto hereda la empresa de lo que
 *    lleva adentro. Un palet de una en un rack de la otra se permite -pasa- pero
 *    se marca.
 * 2. Hasta qué nivel llega el clark, por grupo. Un nivel al que no llega no se
 *    ofrece ni se acepta como destino.
 * 3. La lista de exclusión: grupos, calles, niveles o posiciones que no se usan
 *    por decisión propia, por reparación o por lo que sea.
 *
 * ESCRITA A MANO y segura sobre datos existentes: todo lo nuevo es nullable o
 * tiene default, y el default es el comportamiento de hoy (todos los niveles
 * alcanzables, nada excluido, empresa sin asignar).
 */

/* --- Empresas -------------------------------------------------------------- */

CREATE TABLE "empresas" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "empresas_nombre_unique" UNIQUE("nombre")
);
--> statement-breakpoint

INSERT INTO "empresas" ("nombre", "orden") VALUES ('Rustikas', 0), ('Pirka', 1)
  ON CONFLICT ("nombre") DO NOTHING;
--> statement-breakpoint

ALTER TABLE "grupos" ADD COLUMN "empresa_id" integer;--> statement-breakpoint
ALTER TABLE "grupos" ADD CONSTRAINT "grupos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "modelos" ADD COLUMN "empresa_id" integer;--> statement-breakpoint
ALTER TABLE "modelos" ADD CONSTRAINT "modelos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

/* --- Hasta dónde llega el clark -------------------------------------------- */

ALTER TABLE "niveles" ADD COLUMN "alcanzable" boolean DEFAULT true NOT NULL;--> statement-breakpoint

/* --- Lista de exclusión ---------------------------------------------------- */

CREATE TYPE "public"."motivo_exclusion" AS ENUM('decision', 'reparacion', 'otro');--> statement-breakpoint

CREATE TABLE "exclusiones" (
	"id" serial PRIMARY KEY NOT NULL,
	"grupo_id" integer NOT NULL,
	"unidad" integer,
	"nivel" integer,
	"posicion_id" integer,
	"motivo" "motivo_exclusion" NOT NULL,
	"nota" text,
	"creada_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creada_por" integer,
	"levantada_en" timestamp with time zone,
	"levantada_por" integer
);
--> statement-breakpoint
ALTER TABLE "exclusiones" ADD CONSTRAINT "exclusiones_grupo_id_grupos_id_fk" FOREIGN KEY ("grupo_id") REFERENCES "public"."grupos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exclusiones" ADD CONSTRAINT "exclusiones_posicion_id_posiciones_id_fk" FOREIGN KEY ("posicion_id") REFERENCES "public"."posiciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exclusiones" ADD CONSTRAINT "exclusiones_creada_por_usuarios_id_fk" FOREIGN KEY ("creada_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exclusiones" ADD CONSTRAINT "exclusiones_levantada_por_usuarios_id_fk" FOREIGN KEY ("levantada_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exclusiones_vigentes" ON "exclusiones" USING btree ("grupo_id") WHERE "levantada_en" IS NULL;
