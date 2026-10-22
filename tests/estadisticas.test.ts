import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  completarDias,
  dias,
  leerPeriodo,
  mediana,
  porcentaje,
  tramoDeAntiguedad,
} from "../lib/estadisticas-calculo";
import { puedeVer, rutaInicial } from "../lib/permisos";

describe("estadísticas: las cuentas", () => {
  test("el período de la URL: lo raro vuelve a 30", () => {
    assert.equal(leerPeriodo("90"), 90);
    assert.equal(leerPeriodo("365"), 365);
    assert.equal(leerPeriodo("12"), 30);
    assert.equal(leerPeriodo(undefined), 30);
    assert.equal(leerPeriodo("abc"), 30);
  });

  test("los días sin movimientos aparecen en cero, y en orden", () => {
    const serie = completarDias([{ dia: "2026-10-20", valor: 4 }], 3, "2026-10-22");
    assert.deepEqual(serie, [
      { dia: "2026-10-20", valor: 4 },
      { dia: "2026-10-21", valor: 0 },
      { dia: "2026-10-22", valor: 0 },
    ]);
  });

  test("completarDias cruza bien el fin de mes", () => {
    const serie = completarDias([], 3, "2026-11-01");
    assert.deepEqual(serie.map((s) => s.dia), ["2026-10-30", "2026-10-31", "2026-11-01"]);
  });

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

describe("quién ve el tablero y las estadísticas", () => {
  test("el tablero lo ven todos", () => {
    for (const rol of ["admin", "auditor", "autoelevador", "control", "comercial"] as const) {
      assert.ok(puedeVer(rol, "/tablero"), rol);
    }
  });

  test("estadísticas no es del autoelevador", () => {
    assert.equal(puedeVer("autoelevador", "/estadisticas"), false);
    assert.ok(puedeVer("comercial", "/estadisticas"));
  });

  test("admin y auditor entran al tablero; el resto, a su puesto", () => {
    assert.equal(rutaInicial("admin"), "/tablero");
    assert.equal(rutaInicial("auditor"), "/tablero");
    assert.equal(rutaInicial("autoelevador"), "/mover");
  });
});
