import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  huecoPenetrable,
  huecoSelectivo,
  MEDIDAS,
  pendiente,
  puntoPenetrable,
  type GeometriaPenetrable,
} from "../lib/perspectiva";

/**
 * Lo que no puede pasar en el dibujo: que un hueco tenga los bordes de arriba
 * y de abajo inclinados distinto que el piso. Pasó en el primer boceto, por
 * achicar los huecos en píxeles de pantalla en vez de en los ejes del rack, y
 * a ojo cuesta verlo pero confunde. Se prueba en todos los huecos, para los dos
 * lados de acceso.
 */

const geo = (acceso: "izquierda" | "derecha"): GeometriaPenetrable => ({
  calles: 3,
  niveles: 4,
  profundidad: 3,
  acceso,
});
const O: [number, number] = [20, 300];
const casi = (a: number, b: number) => Math.abs(a - b) < 1e-9;

describe("perspectiva de un penetrable", () => {
  for (const acceso of ["derecha", "izquierda"] as const) {
    test(`acceso por la ${acceso}: arriba y abajo de cada hueco son paralelos al piso`, () => {
      const g = geo(acceso);
      const piso = pendiente(
        puntoPenetrable(g, 0, 0, 0, O),
        puntoPenetrable(g, 0, 0, g.profundidad, O),
      );
      for (let c = 0; c < g.calles; c++)
        for (let n = 0; n < g.niveles; n++)
          for (let d = 0; d < g.profundidad; d++) {
            const [a, b, cc, dd] = huecoPenetrable(g, c, n, d, O);
            assert.ok(casi(pendiente(a, b), piso), `abajo, calle ${c} nivel ${n} prof ${d}`);
            assert.ok(casi(pendiente(dd, cc), piso), `arriba, calle ${c} nivel ${n} prof ${d}`);
            // Los costados, verticales como la pared.
            assert.ok(casi(a[0], dd[0]) && casi(b[0], cc[0]), "costados verticales");
          }
    });
  }

  test("si se entra por la derecha, la pared queda a la izquierda", () => {
    const g = geo("derecha");
    const pasillo = puntoPenetrable(g, 0, 0, 0, O);
    const pared = puntoPenetrable(g, 0, 0, g.profundidad, O);
    assert.ok(pared[0] < pasillo[0]);
    assert.ok(pared[1] < pasillo[1], "la pared está más arriba: más lejos");
  });

  test("si se entra por la izquierda, la pared queda a la derecha", () => {
    const g = geo("izquierda");
    const pasillo = puntoPenetrable(g, 0, 0, 0, O);
    const pared = puntoPenetrable(g, 0, 0, g.profundidad, O);
    assert.ok(pared[0] > pasillo[0]);
  });

  test("las calles van en su orden físico y no se pisan", () => {
    for (const acceso of ["derecha", "izquierda"] as const) {
      const g = geo(acceso);
      const xs = (c: number) =>
        [0, g.profundidad].map((d) => puntoPenetrable(g, c, 0, d, O)[0]);
      for (let c = 0; c < g.calles - 1; c++) {
        assert.ok(Math.max(...xs(c)) < Math.min(...xs(c + 1)), `${acceso}: calle ${c + 1} antes de ${c + 2}`);
      }
      assert.ok(Math.min(...xs(0)) >= O[0], "nada se sale por la izquierda");
    }
  });

  test("un nivel más es exactamente un alto más arriba", () => {
    const g = geo("derecha");
    const a = puntoPenetrable(g, 1, 1, 2, O);
    const b = puntoPenetrable(g, 1, 2, 2, O);
    assert.equal(a[1] - b[1], MEDIDAS.alto);
    assert.equal(a[0], b[0]);
  });
});

describe("perspectiva de un selectivo", () => {
  test("de frente, los huecos tienen arriba y abajo horizontales", () => {
    const g = { modulos: 2, ancho: 3, niveles: 3 };
    for (let m = 0; m < 2; m++)
      for (let c = 0; c < 3; c++)
        for (let n = 0; n < 3; n++) {
          const [a, b, cc, dd] = huecoSelectivo(g, m, c, n, O);
          assert.equal(a[1], b[1]);
          assert.equal(cc[1], dd[1]);
        }
  });
});
