/*
 * El plano de la planta: el dibujo editable de la fábrica.
 *
 * Cada vez que se guarda se agrega una VERSIÓN entera; el plano vigente es la
 * última. Nada se borra, igual que en el resto de la app: si alguien rompe el
 * dibujo, la versión anterior sigue ahí.
 *
 * `doc` es el plano completo en JSON (ver lib/plano.ts): el espacio de trabajo
 * en metros y la lista de elementos. Se valida al guardar, no en la base.
 *
 * ESCRITA A MANO, segura sobre datos existentes y se puede volver a correr.
 */

CREATE TABLE IF NOT EXISTS "planos" (
	"id" serial PRIMARY KEY NOT NULL,
	"doc" jsonb NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" integer REFERENCES "usuarios"("id")
);
