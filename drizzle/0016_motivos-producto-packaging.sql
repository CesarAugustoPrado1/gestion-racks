-- Motivo de ajuste para control: el bulto está pero el packaging es otro (dice
-- palet y es suelto, dice palet y es optimizado). Para "es otro producto" ya
-- existe "Modelo equivocado".
-- El orden va en una subconsulta: ver 0012.
INSERT INTO "motivos" ("nombre", "ambito", "es_egreso", "es_merma", "pide_nota", "activo", "orden")
SELECT 'Packaging equivocado', 'ajuste', false, false, false, true,
       (SELECT coalesce(max("orden"), 0) + 1 FROM "motivos")
 WHERE NOT EXISTS (SELECT 1 FROM "motivos" WHERE lower("nombre") = 'packaging equivocado');
