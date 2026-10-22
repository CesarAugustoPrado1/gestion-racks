/*
 * De qué lado entra el clark a las calles de un grupo penetrable.
 *
 * Lo usa la vista en perspectiva para dibujar el grupo como se lo ve parado en
 * el galpón: si se entra por la derecha, la pared queda a la izquierda. En un
 * selectivo no se usa: se ve siempre de frente.
 *
 * Default 'derecha', que es como está el primero que se dibujó. Se cambia
 * desde Administración → Grupos de racks.
 *
 * ESCRITA A MANO, segura sobre datos existentes y se puede volver a correr.
 */

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lado_acceso') THEN
    CREATE TYPE "public"."lado_acceso" AS ENUM('izquierda', 'derecha');
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "grupos" ADD COLUMN IF NOT EXISTS "acceso" "lado_acceso" DEFAULT 'derecha' NOT NULL;
