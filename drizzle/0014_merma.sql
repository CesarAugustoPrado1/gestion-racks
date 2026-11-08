/*
 * MERMA: producto que se pierde o se arruina en el depósito -rotura al
 * manipular, accidente con el autoelevador, suciedad de aves, roedores,
 * humedad u hongos- y no sale vendido.
 *
 * - `motivos.es_merma`: el motivo es de merma. Se usa en egresos (lo registra
 *   el clarkista) y en ajustes de control (merma que encuentra en un chequeo).
 * - `motivos.pide_nota`: el motivo exige escribir qué pasó (por ejemplo,
 *   "Otra merma").
 * - `movimientos.es_merma`: si ESE movimiento fue merma, congelado al
 *   escribirlo, como el nombre del motivo: si mañana alguien cambia el motivo,
 *   el historial no cambia.
 *
 * Se agregan los motivos de merma de la planta. "Rotura o descarte" pasa a ser
 * de merma (y a no contar como salida de la fábrica) y se suspende, porque lo
 * reemplazan los motivos más precisos; sus movimientos viejos cuentan como
 * merma. Se puede reactivar desde Administración → Motivos.
 *
 * ESCRITA A MANO, segura sobre datos existentes y se puede volver a correr.
 */

ALTER TABLE "motivos" ADD COLUMN IF NOT EXISTS "es_merma" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "motivos" ADD COLUMN IF NOT EXISTS "pide_nota" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "movimientos" ADD COLUMN IF NOT EXISTS "es_merma" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "motivos" SET "es_merma" = true, "es_egreso" = false, "activo" = false
 WHERE lower("nombre") = 'rotura o descarte' AND NOT "es_merma";--> statement-breakpoint
INSERT INTO "motivos" ("nombre", "ambito", "es_egreso", "es_merma", "pide_nota", "activo", "orden")
SELECT n.nombre, n.ambito::"ambito_motivo", false, true, n.pide_nota, true,
       (SELECT coalesce(max("orden"), 0) FROM "motivos") + n.i
  FROM (VALUES
    (1, 'Rotura al manipular', 'salida', false),
    (2, 'Accidente con el autoelevador', 'salida', false),
    (3, 'Caída o golpe en el rack', 'salida', false),
    (4, 'Suciedad por aves (palomas)', 'salida', false),
    (5, 'Daño por roedores', 'salida', false),
    (6, 'Humedad u hongos', 'salida', false),
    (7, 'Daño por agua o goteras', 'salida', false),
    (8, 'Defecto de fabricación detectado en depósito', 'salida', false),
    (9, 'Deterioro por antigüedad', 'salida', false),
    (10, 'Otra merma', 'salida', true),
    (11, 'Merma encontrada en el chequeo', 'ajuste', true)
  ) AS n(i, nombre, ambito, pide_nota)
 WHERE NOT EXISTS (SELECT 1 FROM "motivos" m WHERE lower(m."nombre") = lower(n.nombre));--> statement-breakpoint
UPDATE "movimientos" SET "es_merma" = true
 WHERE NOT "es_merma" AND "motivo_id" IN (SELECT "id" FROM "motivos" WHERE "es_merma");
