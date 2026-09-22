CREATE TYPE "public"."accesibilidad" AS ENUM('selectivo', 'penetrable');--> statement-breakpoint
CREATE TYPE "public"."ambito_motivo" AS ENUM('ajuste', 'entrega', 'reempaque');--> statement-breakpoint
CREATE TYPE "public"."estado_bulto" AS ENUM('en_rack', 'en_piso', 'entregado', 'desarmado');--> statement-breakpoint
CREATE TYPE "public"."packaging" AS ENUM('suelto', 'palet', 'optimizado');--> statement-breakpoint
CREATE TYPE "public"."resultado_chequeo" AS ENUM('ok', 'vacio_ok', 'corregido');--> statement-breakpoint
CREATE TYPE "public"."tipo_movimiento" AS ENUM('alta', 'subir', 'bajar', 'mover', 'entrega', 'reempaque', 'ajuste');--> statement-breakpoint
CREATE TABLE "bultos" (
	"id" serial PRIMARY KEY NOT NULL,
	"codigo" text NOT NULL,
	"etiqueta" text,
	"modelo_id" integer NOT NULL,
	"packaging" "packaging" NOT NULL,
	"cantidad" integer NOT NULL,
	"estado" "estado_bulto" DEFAULT 'en_piso' NOT NULL,
	"posicion_id" integer,
	"profundidad" integer,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" integer,
	"visto_en" timestamp with time zone DEFAULT now() NOT NULL,
	"chequeado_en" timestamp with time zone,
	"chequeos_ok" integer DEFAULT 0 NOT NULL,
	"chequeos_total" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "bultos_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "chequeos" (
	"id" serial PRIMARY KEY NOT NULL,
	"posicion_id" integer NOT NULL,
	"posicion_codigo" text NOT NULL,
	"bulto_id" integer,
	"resultado" "resultado_chequeo" NOT NULL,
	"usuario_id" integer NOT NULL,
	"usuario_nombre" text NOT NULL,
	"nota" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lineas" (
	"id" serial PRIMARY KEY NOT NULL,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	"unidad_singular" text NOT NULL,
	"unidad_plural" text NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "lineas_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "modelos" (
	"id" serial PRIMARY KEY NOT NULL,
	"linea_id" integer NOT NULL,
	"nombre" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "motivos" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"ambito" "ambito_motivo" NOT NULL,
	"activo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "movimientos" (
	"id" serial PRIMARY KEY NOT NULL,
	"bulto_id" integer NOT NULL,
	"bulto_codigo" text NOT NULL,
	"modelo_id" integer NOT NULL,
	"modelo_nombre" text NOT NULL,
	"linea_codigo" text NOT NULL,
	"packaging" "packaging" NOT NULL,
	"cantidad" integer NOT NULL,
	"tipo" "tipo_movimiento" NOT NULL,
	"posicion_desde_id" integer,
	"posicion_desde_codigo" text,
	"posicion_hasta_id" integer,
	"posicion_hasta_codigo" text,
	"usuario_id" integer NOT NULL,
	"usuario_nombre" text NOT NULL,
	"motivo_id" integer,
	"motivo_nombre" text,
	"nota" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"anulado_en" timestamp with time zone,
	"anulado_por" integer,
	"motivo_anulacion" text,
	"reemplaza_a" integer
);
--> statement-breakpoint
CREATE TABLE "normas" (
	"id" serial PRIMARY KEY NOT NULL,
	"modelo_id" integer NOT NULL,
	"packaging" "packaging" NOT NULL,
	"cantidad" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "posiciones" (
	"id" serial PRIMARY KEY NOT NULL,
	"rack_id" integer NOT NULL,
	"codigo" text NOT NULL,
	"nivel" integer,
	"profundidad" integer,
	"capacidad_bultos" integer DEFAULT 1 NOT NULL,
	"altura_max_cm" integer,
	"activa" boolean DEFAULT true NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"chequeado_en" timestamp with time zone,
	"chequeos_ok" integer DEFAULT 0 NOT NULL,
	"chequeos_total" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "racks" (
	"id" serial PRIMARY KEY NOT NULL,
	"codigo" text NOT NULL,
	"nombre" text,
	"accesibilidad" "accesibilidad" NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "racks_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
ALTER TABLE "bultos" ADD CONSTRAINT "bultos_modelo_id_modelos_id_fk" FOREIGN KEY ("modelo_id") REFERENCES "public"."modelos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bultos" ADD CONSTRAINT "bultos_posicion_id_posiciones_id_fk" FOREIGN KEY ("posicion_id") REFERENCES "public"."posiciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bultos" ADD CONSTRAINT "bultos_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chequeos" ADD CONSTRAINT "chequeos_posicion_id_posiciones_id_fk" FOREIGN KEY ("posicion_id") REFERENCES "public"."posiciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chequeos" ADD CONSTRAINT "chequeos_bulto_id_bultos_id_fk" FOREIGN KEY ("bulto_id") REFERENCES "public"."bultos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chequeos" ADD CONSTRAINT "chequeos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modelos" ADD CONSTRAINT "modelos_linea_id_lineas_id_fk" FOREIGN KEY ("linea_id") REFERENCES "public"."lineas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_bulto_id_bultos_id_fk" FOREIGN KEY ("bulto_id") REFERENCES "public"."bultos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_modelo_id_modelos_id_fk" FOREIGN KEY ("modelo_id") REFERENCES "public"."modelos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_posicion_desde_id_posiciones_id_fk" FOREIGN KEY ("posicion_desde_id") REFERENCES "public"."posiciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_posicion_hasta_id_posiciones_id_fk" FOREIGN KEY ("posicion_hasta_id") REFERENCES "public"."posiciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_motivo_id_motivos_id_fk" FOREIGN KEY ("motivo_id") REFERENCES "public"."motivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_anulado_por_usuarios_id_fk" FOREIGN KEY ("anulado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_reemplaza_a_movimientos_id_fk" FOREIGN KEY ("reemplaza_a") REFERENCES "public"."movimientos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "normas" ADD CONSTRAINT "normas_modelo_id_modelos_id_fk" FOREIGN KEY ("modelo_id") REFERENCES "public"."modelos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posiciones" ADD CONSTRAINT "posiciones_rack_id_racks_id_fk" FOREIGN KEY ("rack_id") REFERENCES "public"."racks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bultos_posicion" ON "bultos" USING btree ("posicion_id");--> statement-breakpoint
CREATE INDEX "bultos_modelo_packaging" ON "bultos" USING btree ("modelo_id","packaging","estado");--> statement-breakpoint
CREATE INDEX "chequeos_posicion" ON "chequeos" USING btree ("posicion_id","creado_en");--> statement-breakpoint
CREATE UNIQUE INDEX "modelos_linea_nombre" ON "modelos" USING btree ("linea_id","nombre");--> statement-breakpoint
CREATE INDEX "movimientos_bulto" ON "movimientos" USING btree ("bulto_id","id");--> statement-breakpoint
CREATE INDEX "movimientos_fecha" ON "movimientos" USING btree ("creado_en");--> statement-breakpoint
CREATE UNIQUE INDEX "normas_modelo_packaging" ON "normas" USING btree ("modelo_id","packaging");--> statement-breakpoint
CREATE UNIQUE INDEX "posiciones_rack_codigo" ON "posiciones" USING btree ("rack_id","codigo");