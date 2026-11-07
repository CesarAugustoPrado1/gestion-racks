import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  dias,
  mediana,
  porcentaje,
  tramoDeAntiguedad,
} from "../lib/estadisticas-calculo";
import { puedeVer, rutaInicial } from "../lib/permisos";

describe("estadísticas: las cuentas", () => {
  test("porcentaje no divide por cero", () => {
    assert.equal(porcentaje(1, 0), 0);
    assert.equal(porcentaje(1, 3), 33);
  });

  test("la mediana, con cantidad par e impar", () => {
    assert.equal(mediana([]), null);
    assert.equal(mediana([5, 1, 3]), 3);
    assert.equal(mediana([1, 2, 3, 100]), 2.5);
  });

  test("los tramos de antigüedad tienen los bordes donde se espera", () => {
    assert.equal(tramoDeAntiguedad(0), "menos de 1 semana");
    assert.equal(tramoDeAntiguedad(6.9), "menos de 1 semana");
    assert.equal(tramoDeAntiguedad(7), "1 semana a 1 mes");
    assert.equal(tramoDeAntiguedad(200), "más de 6 meses");
  });

  test("días en palabras", () => {
    assert.equal(dias(null), "—");
    assert.equal(dias(0.4), "menos de 1 día");
    assert.equal(dias(1), "1 día");
    assert.equal(dias(12.6), "13 días");
  });
});

describe("quién ve el resumen y las estadísticas", () => {
  test("el resumen lo ven todos", () => {
    for (const rol of ["admin", "auditor", "autoelevador", "control", "comercial"] as const) {
      assert.ok(puedeVer(rol, "/resumen"), rol);
    }
  });

  test("estadísticas no es del autoelevador", () => {
    assert.equal(puedeVer("autoelevador", "/estadisticas"), false);
    assert.ok(puedeVer("comercial", "/estadisticas"));
  });

  test("admin y auditor entran al resumen; el resto, a su puesto", () => {
    assert.equal(rutaInicial("admin"), "/resumen");
    assert.equal(rutaInicial("auditor"), "/resumen");
    assert.equal(rutaInicial("autoelevador"), "/mover");
  });
});
