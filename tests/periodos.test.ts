import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  diaDe,
  leerMomento,
  leerRango,
  lunesDe,
  rangoAnterior,
  sumarMeses,
  tramosDe,
} from "../lib/periodos";

// Sábado 7 de noviembre de 2026, 10:30 de Argentina.
const AHORA = new Date("2026-11-07T10:30:00-03:00");

describe("días en hora de Argentina", () => {
  test("las 22 h de Argentina siguen siendo el mismo día, aunque en UTC ya sea el siguiente", () => {
    assert.equal(diaDe(new Date("2026-11-07T22:00:00-03:00")), "2026-11-07");
    assert.equal(diaDe(new Date("2026-11-08T00:30:00-03:00")), "2026-11-08");
  });
  test("la semana empieza el lunes", () => {
    assert.equal(lunesDe("2026-11-07"), "2026-11-02"); // sábado
    assert.equal(lunesDe("2026-11-08"), "2026-11-02"); // domingo
    assert.equal(lunesDe("2026-11-02"), "2026-11-02"); // lunes
  });
  test("sumar meses respeta el fin de mes", () => {
    assert.equal(sumarMeses("2026-03-31", -1), "2026-02-28");
    assert.equal(sumarMeses("2026-01-15", -1), "2025-12-15");
  });
});

describe("períodos", () => {
  test("hoy va de las 0 h a ahora, por hora", () => {
    const r = leerRango({ p: "hoy" }, AHORA);
    assert.equal(r.inicio.toISOString(), "2026-11-07T03:00:00.000Z");
    assert.equal(r.fin.getTime(), AHORA.getTime());
    assert.equal(r.enCurso, true);
    assert.equal(r.granularidad, "hora");
    assert.equal(tramosDe(r).length, 11, "de 00 a 10 h");
  });

  test("ayer es el día entero y se compara con anteayer", () => {
    const r = leerRango({ p: "ayer" }, AHORA);
    assert.equal(r.desdeDia, "2026-11-06");
    assert.equal(r.enCurso, false);
    const a = rangoAnterior(r);
    assert.equal(diaDe(a.inicio), "2026-11-05");
    assert.equal(a.fin.getTime(), r.inicio.getTime());
  });

  test("esta semana va del lunes a ahora, por día", () => {
    const r = leerRango({ p: "semana" }, AHORA);
    assert.equal(r.desdeDia, "2026-11-02");
    assert.equal(r.granularidad, "dia");
    assert.equal(tramosDe(r).length, 6, "lunes a sábado");
  });

  test("el mes en curso se compara con el MISMO TRAMO del mes anterior", () => {
    const r = leerRango({ p: "mes" }, AHORA);
    const a = rangoAnterior(r);
    assert.equal(a.inicio.toISOString(), new Date("2026-10-01T00:00:00-03:00").toISOString());
    assert.equal(a.fin.toISOString(), new Date("2026-10-07T10:30:00-03:00").toISOString());
  });

  test("el mes anterior es octubre entero, comparado con septiembre entero", () => {
    const r = leerRango({ p: "mes_anterior" }, AHORA);
    assert.equal(r.desdeDia, "2026-10-01");
    assert.equal(r.hastaDia, "2026-10-31");
    const a = rangoAnterior(r);
    assert.equal(diaDe(a.inicio), "2026-09-01");
    assert.equal(a.fin.toISOString(), new Date("2026-10-01T00:00:00-03:00").toISOString());
  });

  test("el año va por mes y un rango a elección se ordena y no pasa de hoy", () => {
    assert.equal(leerRango({ p: "anio" }, AHORA).granularidad, "mes");
    const r = leerRango({ desde: "2026-11-30", hasta: "2026-10-20" }, AHORA);
    assert.equal(r.desdeDia, "2026-10-20");
    assert.equal(r.hastaDia, "2026-11-07");
    assert.equal(r.id, "rango");
  });

  test("algo raro en la URL vuelve al mes en curso", () => {
    assert.equal(leerRango({ p: "cualquiera" }, AHORA).id, "mes");
    assert.equal(leerRango({ desde: "2026-13-45", hasta: "x" }, AHORA).id, "mes");
  });

  test("los tramos semanales empiezan donde empieza el período", () => {
    const r = leerRango({ desde: "2026-06-03", hasta: "2026-11-07" }, AHORA);
    assert.equal(r.granularidad, "semana");
    const t = tramosDe(r);
    assert.equal(t[0].inicio.getTime(), r.inicio.getTime());
    assert.equal(t[0].clave, "2026-06-01", "la clave es el lunes, como date_trunc('week')");
  });
});

describe("momentos del resumen", () => {
  test("sin fecha, o con hoy, es ahora", () => {
    assert.equal(leerMomento(undefined, AHORA).esAhora, true);
    assert.equal(leerMomento("2026-11-07", AHORA).esAhora, true);
  });
  test("una fecha pasada es ese día al cierre", () => {
    const m = leerMomento("2026-10-31", AHORA);
    assert.equal(m.esAhora, false);
    assert.equal(m.instante.toISOString(), new Date("2026-11-01T00:00:00-03:00").toISOString());
    assert.equal(m.etiqueta, "Cierre de octubre");
  });
});
