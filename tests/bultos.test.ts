import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { esMezclado, fueraDeNorma, total, validarComposicion } from "../lib/bultos";

const laja = { modeloId: 1, cantidad: 48 };
const patagonica = { modeloId: 2, cantidad: 12 };

describe("mezclado implica sin norma, y por eso suelto", () => {
  test("un modelo no es mezclado; dos sí", () => {
    assert.equal(esMezclado([laja]), false);
    assert.equal(esMezclado([laja, patagonica]), true);
  });

  /**
   * La regla que ordena el modelo entero. Si un mezclado pudiera registrarse
   * como palet, el stock de "palets de Laja" incluiría bultos que nadie puede
   * despachar como palet de Laja.
   */
  test("un mezclado NO puede ser palet ni optimizado", () => {
    for (const p of ["palet", "optimizado"] as const) {
      const problema = validarComposicion(p, [laja, patagonica]);
      assert.ok(problema, `${p} mezclado tendría que fallar`);
      assert.match(problema!, /suelto/i);
    }
  });

  test("un mezclado como suelto es válido: es lo que realmente es", () => {
    assert.equal(validarComposicion("suelto", [laja, patagonica]), null);
  });

  test("un solo modelo puede ser cualquiera de los tres", () => {
    for (const p of ["suelto", "palet", "optimizado"] as const) {
      assert.equal(validarComposicion(p, [laja]), null);
    }
  });
});

describe("validaciones que evitan un bulto imposible", () => {
  test("un bulto sin contenido no existe", () => {
    assert.ok(validarComposicion("palet", []));
  });

  test("cantidad cero o negativa se rechaza", () => {
    assert.ok(validarComposicion("suelto", [{ modeloId: 1, cantidad: 0 }]));
    assert.ok(validarComposicion("suelto", [{ modeloId: 1, cantidad: -5 }]));
  });

  /**
   * Dos líneas del mismo modelo sumarían bien el total pero romperían el índice
   * único de `bulto_contenido`, y el error saldría como un choque de base en la
   * cara del operario en vez de un mensaje.
   */
  test("el mismo modelo dos veces se rechaza antes de llegar a la base", () => {
    const problema = validarComposicion("suelto", [laja, { modeloId: 1, cantidad: 5 }]);
    assert.ok(problema);
    assert.match(problema!, /repetido/i);
  });
});

describe("total y norma", () => {
  test("el total es la suma de las líneas", () => {
    assert.equal(total([laja, patagonica]), 60);
    assert.equal(total([]), 0);
  });

  /**
   * `null` otra vez con significado propio: sin norma contra qué comparar, la
   * pregunta no aplica. No es "fuera de norma".
   */
  test("sin norma devuelve null, no true", () => {
    assert.equal(fueraDeNorma(48, null), null);
  });

  test("coincide con la norma: false", () => {
    assert.equal(fueraDeNorma(48, 48), false);
  });

  test("no coincide: true, de más o de menos", () => {
    assert.equal(fueraDeNorma(47, 48), true);
    assert.equal(fueraDeNorma(49, 48), true);
  });
});

describe("la cantidad normalizada es fija", () => {
  const normas = new Map([[1, 48]]);
  const norma = (id: number) => normas.get(id);

  test("un palet con su cantidad pasa; con otra, es suelto", async () => {
    const { validarNormalizado } = await import("../lib/bultos");
    assert.equal(validarNormalizado("palet", [laja], norma), null);
    assert.match(validarNormalizado("palet", [{ modeloId: 1, cantidad: 43 }], norma) ?? "", /lleva 48/);
  });

  test("sin cantidad configurada no se puede cargar como palet", async () => {
    const { validarNormalizado } = await import("../lib/bultos");
    assert.match(validarNormalizado("palet", [patagonica], norma) ?? "", /no tiene cantidad normalizada/);
  });

  test("al suelto no se le exige nada, aunque coincida con la de un palet", async () => {
    const { validarNormalizado } = await import("../lib/bultos");
    assert.equal(validarNormalizado("suelto", [laja], norma), null);
    assert.equal(validarNormalizado("suelto", [{ modeloId: 1, cantidad: 7 }], norma), null);
  });
});
