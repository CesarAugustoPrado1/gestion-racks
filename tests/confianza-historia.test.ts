import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { curvasDeConfianza, type EventoMovimiento } from "../lib/confianza-historia";

const DIA = 86_400_000;
const T0 = Date.UTC(2026, 9, 1, 12);
const dim = {
  grupoDe: (p: number) => (p < 100 ? "A" : "B"),
  nivelDe: () => "piso",
  lineaDe: (m: number) => (m === 1 ? "Placas" : "Piedras"),
};
const mov = (o: Partial<EventoMovimiento> & { t: number; id: number }): EventoMovimiento => ({
  bultoId: 1,
  tipo: "meter",
  packaging: "palet",
  cantidad: 48,
  desde: null,
  hasta: 10,
  lineas: [{ modeloId: 1, cantidad: 48 }],
  ...o,
});

describe("la confiabilidad en el pasado", () => {
  test("antes del primer chequeo no hay dato; después, vale lo que vale un chequeo de esa edad", () => {
    const p = curvasDeConfianza(
      [mov({ t: T0, id: 1 })],
      [{ t: T0 + DIA, id: 1, posicionId: 10, bien: true }],
      [T0 + DIA / 2, T0 + DIA + 30 * DIA],
      30,
      dim,
    );
    assert.equal(p[0].general.valor, null);
    assert.equal(p[0].general.sinDatos, 1);
    // A los 30 días de un chequeo bueno: frescura 0,5 × acierto 2/3.
    assert.ok(Math.abs(p[1].general.valor! - 0.5 * (2 / 3)) < 1e-9);
    assert.equal(p[1].porGrupo.A.medidos, 1);
    assert.equal(p[1].porLinea.Placas.medidos, 1);
  });

  test("un movimiento le borra el chequeo; un ajuste de control que lo deja en su lugar, no", () => {
    const base = [mov({ t: T0, id: 1 })];
    const cheq = [{ t: T0 + DIA, id: 1, posicionId: 10, bien: true }];
    const reubicado = curvasDeConfianza(
      [...base, mov({ t: T0 + 2 * DIA, id: 2, tipo: "mover", desde: 10, hasta: 11 })],
      cheq,
      [T0 + 3 * DIA],
      30,
      dim,
    );
    assert.equal(reubicado[0].general.valor, null, "reubicado: nadie lo verificó donde está");

    const ajustado = curvasDeConfianza(
      [...base, mov({ t: T0 + 2 * DIA, id: 2, tipo: "ajuste", desde: 10, hasta: 10, lineas: [{ modeloId: 1, cantidad: 40 }] })],
      cheq,
      [T0 + 3 * DIA],
      30,
      dim,
    );
    assert.notEqual(ajustado[0].general.valor, null, "el ajuste de control conserva el chequeo");
  });

  test("la carga inicial deja el bulto verificado, y lo que salió ya no cuenta", () => {
    const p = curvasDeConfianza(
      [
        mov({ t: T0, id: 1, tipo: "inicial" }),
        mov({ t: T0 + 5 * DIA, id: 2, tipo: "sacar", cantidad: 0, desde: 10, hasta: null, lineas: [] }),
      ],
      [],
      [T0 + DIA, T0 + 6 * DIA],
      30,
      dim,
    );
    assert.equal(p[0].general.medidos, 1);
    assert.equal(p[1].general.medidos + p[1].general.sinDatos, 0, "salió: no hay nada que medir");
  });

  test("los objetos no son stock: no entran en el índice", () => {
    const p = curvasDeConfianza(
      [mov({ t: T0, id: 1, packaging: "objeto", cantidad: 0, lineas: [] })],
      [{ t: T0 + DIA, id: 1, posicionId: 10, bien: true }],
      [T0 + 2 * DIA],
      30,
      dim,
    );
    assert.equal(p[0].general.medidos + p[0].general.sinDatos, 0);
  });

  test("la curva de una posición: un chequeo vacío cuenta, y un movimiento que la toca le borra la fecha", () => {
    const p = curvasDeConfianza(
      [mov({ t: T0 + 3 * DIA, id: 1, hasta: 20 })],
      [{ t: T0 + DIA, id: 1, posicionId: 20, bien: true }],
      [T0 + 2 * DIA, T0 + 4 * DIA],
      30,
      dim,
      20,
    );
    assert.ok(p[0].posicion! > 0, "chequeada vacía");
    assert.equal(p[1].posicion, null, "entró un palet que nadie verificó ahí");
  });

  test("un chequeo con corrección suma al total y no al acierto", () => {
    const p = curvasDeConfianza(
      [mov({ t: T0, id: 1 })],
      [{ t: T0 + DIA, id: 1, posicionId: 10, bien: false }],
      [T0 + DIA + 1],
      30,
      dim,
    );
    // Acierto (0 + 1) / (1 + 2) = 1/3, recién chequeado.
    assert.ok(Math.abs(p[0].general.valor! - 1 / 3) < 1e-6);
  });

  test("por empresa y packaging, días desde el chequeo y correcciones del tramo", () => {
    const p = curvasDeConfianza(
      [
        mov({ t: T0, id: 1, bultoId: 1, packaging: "palet", hasta: 10 }),
        mov({ t: T0, id: 2, bultoId: 2, packaging: "suelto", hasta: 11, lineas: [{ modeloId: 2, cantidad: 5 }] }),
      ],
      [
        { t: T0 + DIA, id: 1, posicionId: 10, bien: true },
        { t: T0 + 2 * DIA, id: 2, posicionId: 11, bien: false },
      ],
      [T0 + 1.5 * DIA, T0 + 4 * DIA],
      30,
      { ...dim, empresaDe: (m: number) => (m === 1 ? "Pirka" : "Rustikas") },
    );
    // Primer tramo: un chequeo, ninguno corregido. Segundo: uno, corregido.
    assert.deepEqual([p[0].chequeosEnTramo, p[0].corregidosEnTramo], [1, 0]);
    assert.deepEqual([p[1].chequeosEnTramo, p[1].corregidosEnTramo], [1, 1]);
    assert.equal(p[1].porEmpresa.Pirka.medidos, 1);
    assert.equal(p[1].porEmpresa.Rustikas.medidos, 1);
    assert.ok(p[1].porPackaging.palet.valor! > p[1].porPackaging.suelto.valor!, "el suelto tuvo una corrección");
    // Al día 4: uno chequeado hace 3 días y otro hace 2 → 2,5 de promedio.
    assert.ok(Math.abs(p[1].diasDesdeChequeo! - 2.5) < 1e-9);
    assert.equal(p[0].diasDesdeChequeo !== null, true);
  });
});
