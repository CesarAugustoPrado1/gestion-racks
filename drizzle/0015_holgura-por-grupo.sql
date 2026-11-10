-- El aire que se le exige al bulto arriba, por grupo. Antes era una regla fija
-- de 10 cm para toda la planta; ahora la decide el admin para cada grupo, y
-- arranca en cero.
ALTER TABLE "grupos" ADD COLUMN IF NOT EXISTS "holgura_cm" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "grupos" DROP CONSTRAINT IF EXISTS "grupos_holgura_cm_rango";--> statement-breakpoint
ALTER TABLE "grupos" ADD CONSTRAINT "grupos_holgura_cm_rango" CHECK ("holgura_cm" between 0 and 100);
