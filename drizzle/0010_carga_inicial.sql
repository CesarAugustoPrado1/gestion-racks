/*
 * La carga inicial: el inventario de lo que ya estaba en los racks cuando se
 * empezó a usar la app.
 *
 * - `tipo_movimiento` gana 'inicial'. Suma al stock igual que un ingreso -así
 *   el historial sigue dando el stock vivo-, pero las estadísticas lo dejan
 *   aparte: no es producción que entró ni un error que control corrigió.
 * - Cada grupo tiene su carga inicial: se abre, control la recorre posición por
 *   posición, y se cierra. `carga_inicial_desde` es cuándo se abrió;
 *   `carga_inicial_cerrada_en`, cuándo se cerró. Las dos nulas: nunca se hizo.
 *
 * ESCRITA A MANO, segura sobre datos existentes y se puede volver a correr.
 * `ADD VALUE` puede ir en una transacción porque el valor no se usa en ella.
 */

ALTER TYPE "public"."tipo_movimiento" ADD VALUE IF NOT EXISTS 'inicial';--> statement-breakpoint
ALTER TABLE "grupos" ADD COLUMN IF NOT EXISTS "carga_inicial_desde" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "grupos" ADD COLUMN IF NOT EXISTS "carga_inicial_cerrada_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "grupos" ADD COLUMN IF NOT EXISTS "carga_inicial_cerrada_por" integer REFERENCES "usuarios"("id");
