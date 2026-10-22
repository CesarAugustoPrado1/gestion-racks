import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { esObjeto, validarComposicion, validarDescripcion } from "../lib/bultos";
import { ETIQUETA_MOVIMIENTO } from "../lib/formato";

describe("objetos: lo que ocupa lugar sin ser producto", () => {
  test("un objeto no lleva modelos", () => {
    assert.equal(validarComposicion("objeto", []), null);
    assert.match(validarComposicion("objeto", [{ modeloId: 1, cantidad: 5 }])!, /no lleva modelos/);
  });

  test("un producto sigue necesitando al menos un modelo", () => {
    assert.match(validarComposicion("palet", [])!, /al menos un modelo/);
  });

  test("la descripción es obligatoria y dice algo", () => {
    assert.ok(validarDescripcion(""));
    assert.ok(validarDescripcion("  ab "));
    assert.equal(validarDescripcion("6 sillas a reparar"), null);
    assert.ok(validarDescripcion("x".repeat(201)));
  });

  test("esObjeto", () => {
    assert.equal(esObjeto("objeto"), true);
    assert.equal(esObjeto("palet"), false);
  });
});

describe("los nombres de los movimientos, como se dicen en la planta", () => {
  test("ingreso, egreso, reubicación y ajuste", () => {
    assert.deepEqual(ETIQUETA_MOVIMIENTO, {
      meter: "Ingreso",
      sacar: "Egreso",
      mover: "Reubicación",
      ajuste: "Ajuste",
    });
  });
});
