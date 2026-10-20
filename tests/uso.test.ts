import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  alcanceDe,
  cubre,
  describirAlcance,
  esAjeno,
  porQueNoSeUsa,
  type ReglaExclusion,
} from "../lib/uso";

/**
 * Dónde se puede poner un bulto y de quién es.
 *
 * `cubre` está escrita dos veces -acá y en SQL, en lib/uso-sql.ts- y el test
 * del motor compara las dos contra una base de verdad. Este documenta qué
 * significa cada combinación de comodines, que es lo que alguien va a dudar al
 * leer una fila de `exclusiones` a mano.
 */

const G = 1;
const pos = (unidad: number, nivel: number, id = unidad * 10 + nivel) => ({
  id,
  grupoId: G,
  unidad,
  nivel,
});
const regla = (r: Partial<ReglaExclusion>): ReglaExclusion => ({
  grupoId: G,
  unidad: null,
  nivel: null,
  posicionId: null,
  ...r,
});

describe("cubre: qué alcanza una exclusión", () => {
  test("sin nada más que el grupo, cubre todo el grupo", () => {
    assert.ok(cubre(regla({}), pos(1, 1)));
    assert.ok(cubre(regla({}), pos(7, 3)));
  });

  test("nunca cubre otro grupo", () => {
    assert.ok(!cubre(regla({}), { ...pos(1, 1), grupoId: 2 }));
  });

  test("con calle, cubre todos los niveles de esa calle y nada más", () => {
    const r = regla({ unidad: 7 });
    assert.ok(cubre(r, pos(7, 1)));
    assert.ok(cubre(r, pos(7, 3)));
    assert.ok(!cubre(r, pos(6, 1)));
  });

  test("con nivel, cubre ese nivel en todas las calles", () => {
    const r = regla({ nivel: 3 });
    assert.ok(cubre(r, pos(1, 3)));
    assert.ok(cubre(r, pos(9, 3)));
    assert.ok(!cubre(r, pos(1, 2)));
  });

  test("con calle y nivel, solo ese nivel de esa calle", () => {
    const r = regla({ unidad: 7, nivel: 2 });
    assert.ok(cubre(r, pos(7, 2)));
    assert.ok(!cubre(r, pos(7, 1)));
    assert.ok(!cubre(r, pos(6, 2)));
  });

  test("con posición, solo esa posición", () => {
    const r = regla({ posicionId: 72 });
    assert.ok(cubre(r, pos(7, 2)));
    assert.ok(!cubre(r, pos(7, 3)));
  });
});

describe("alcanceDe y describirAlcance", () => {
  test("el alcance sale de qué columnas están puestas", () => {
    assert.equal(alcanceDe({ unidad: null, nivel: null, posicionId: null }), "grupo");
    assert.equal(alcanceDe({ unidad: 3, nivel: null, posicionId: null }), "unidad");
    assert.equal(alcanceDe({ unidad: null, nivel: 2, posicionId: null }), "nivel");
    assert.equal(alcanceDe({ unidad: 3, nivel: 2, posicionId: null }), "unidad_nivel");
    assert.equal(alcanceDe({ unidad: null, nivel: null, posicionId: 9 }), "posicion");
  });

  test("habla como la planta: calle en un penetrable, módulo en un selectivo", () => {
    const pen = { penetrable: true, niveles: 3 };
    const sel = { penetrable: false, niveles: 3 };
    assert.equal(describirAlcance({ unidad: 7, nivel: null, posicionId: null }, pen), "Calle 7 entera");
    assert.equal(describirAlcance({ unidad: 3, nivel: null, posicionId: null }, sel), "Módulo 3 entero");
    assert.equal(
      describirAlcance({ unidad: 7, nivel: 3, posicionId: null }, pen),
      "Calle 7, nivel arriba",
    );
    assert.equal(
      describirAlcance({ unidad: null, nivel: 2, posicionId: null }, pen),
      "Nivel medio en todo el grupo",
    );
    assert.equal(
      describirAlcance({ unidad: null, nivel: null, posicionId: 5 }, pen, "B-07-2-1"),
      "Posición B-07-2-1",
    );
  });
});

describe("porQueNoSeUsa", () => {
  test("se usa: null", () => {
    assert.equal(porQueNoSeUsa({ alcanzable: true, exclusion: null }), null);
  });

  test("el clark no llega", () => {
    assert.match(porQueNoSeUsa({ alcanzable: false, exclusion: null })!, /clark/);
  });

  test("la exclusión gana y lleva la nota", () => {
    const t = porQueNoSeUsa({
      alcanzable: false,
      exclusion: { motivo: "reparacion", nota: "larguero doblado" },
    })!;
    assert.match(t, /reparación/);
    assert.match(t, /larguero doblado/);
  });
});

describe("esAjeno: un bulto en el rack de otra empresa", () => {
  const RUSTIKAS = 1;
  const PIRKA = 2;

  test("misma empresa: no", () => {
    assert.equal(esAjeno(PIRKA, [PIRKA]), false);
  });

  test("otra empresa: sí", () => {
    assert.equal(esAjeno(PIRKA, [RUSTIKAS]), true);
  });

  test("mezclado con algo de la otra: sí, algo de lo que lleva no es de ahí", () => {
    assert.equal(esAjeno(PIRKA, [PIRKA, RUSTIKAS]), true);
  });

  test("grupo sin empresa cargada: no opina", () => {
    assert.equal(esAjeno(null, [RUSTIKAS]), false);
  });

  test("modelo sin empresa cargada: no opina", () => {
    assert.equal(esAjeno(PIRKA, [null]), false);
    assert.equal(esAjeno(PIRKA, []), false);
  });
});
