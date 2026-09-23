/*
 * Un bulto alto puede ocupar DOS posiciones.
 *
 * Un optimizado que mide mas que su nivel entra igual en la practica, pero
 * sobresale e inutiliza la posicion de arriba. Hasta ahora la app lo prohibia y
 * la realidad lo hacia igual: eso es lo peor de los dos mundos, porque el palet
 * termina en el rack y el sistema no lo sabe. Ahora se permite, y a cambio se
 * marca la de arriba como ocupada por el bulto de abajo.
 *
 * La columna es NULLABLE y sin default, asi que esta migracion es segura sobre
 * datos existentes: todas las posiciones arrancan sin bloquear, que es
 * exactamente el estado de hoy. No hay backfill que hacer.
 *
 * La FK no lleva ON DELETE porque en esta app NADA SE BORRA: los bultos que se
 * van quedan en `salido`. Si algun dia se borrara uno, queremos que la FK grite
 * en vez de dejar la posicion apuntando al vacio.
 */
ALTER TABLE "posiciones" ADD COLUMN "bloqueada_por_bulto_id" integer;--> statement-breakpoint
ALTER TABLE "posiciones" ADD CONSTRAINT "posiciones_bloqueada_por_bulto_id_bultos_id_fk" FOREIGN KEY ("bloqueada_por_bulto_id") REFERENCES "public"."bultos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "posiciones_bloqueada_por" ON "posiciones" USING btree ("bloqueada_por_bulto_id");
