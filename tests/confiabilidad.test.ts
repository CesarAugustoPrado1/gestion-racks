import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  agruparIndices,
  confianza,
  estaOlvidada,
  indice,
  nivel,
  ordenarRecorrida,
} from "../lib/confiabilidad";

const HOY = new Date("2026-09-24T12:00:00Z");
const hace = (dias: number) => new Date(HOY.getTime() - dias * 86400000);
const fila = (dias: number | null, ok = 5, total = 5) => ({
  chequeadoEn: dias === null ? null : hace(dias),
  chequeosOk: ok,
  chequeosTotal: total,
});

describe("confianza: frescura × acierto", () => {
  /**
   * `null` no es cero, y esta es LA distinción del módulo. Cero sería "se miró y
   * está mal". Nunca chequeado es una pregunta que no se hizo.
   */
  test("nunca chequeado devuelve null, no cero", () => {
    assert.equal(confianza(fila(null), 30, HOY), null);
  });

  test("a los `semivida` días vale exactamente la mitad", () => {
    const hoy = confianza(fila(0), 30, HOY)!;
    const mes = confianza(fila(30), 30, HOY)!;
    assert.ok(Math.abs(mes.frescura - hoy.frescura / 2) < 1e-9);
  });

  test("al doble de la semivida, un cuarto", () => {
    assert.ok(Math.abs(confianza(fila(60), 30, HOY)!.frescura - 0.25) < 1e-9);
  });

  test("la semivida es lo único que cambia la velocidad del olvido", () => {
    assert.ok(confianza(fila(20), 15, HOY)!.valor < confianza(fila(20), 45, HOY)!.valor);
  });

  /**
   * Laplace: sin la corrección, un solo chequeo bueno daría confianza total y uno
   * malo condenaría la posición para siempre. Sospecha, no sentencia.
   */
  test("un solo chequeo bueno da 2/3, no 1", () => {
    assert.ok(Math.abs(confianza(fila(0, 1, 1), 30, HOY)!.acierto - 2 / 3) < 1e-9);
  });

  test("un solo chequeo malo da 1/3, no 0", () => {
    assert.ok(Math.abs(confianza(fila(0, 0, 1), 30, HOY)!.acierto - 1 / 3) < 1e-9);
  });

  test("el acierto tiende a 1 con muchos chequeos buenos, sin llegar nunca", () => {
    const muchos = confianza(fila(0, 100, 100), 30, HOY)!.acierto;
    assert.ok(muchos > 0.97 && muchos < 1);
  });

  test("una posición donde siempre se encuentran errores no es confiable ni recién chequeada", () => {
    const c = confianza(fila(0, 0, 10), 30, HOY)!;
    assert.equal(nivel(c), "baja");
  });

  test("una fecha futura no da confianza mayor a 1", () => {
    // Relojes desfasados entre el celular y el servidor: no puede romper la escala.
    const c = confianza(fila(-5), 30, HOY)!;
    assert.ok(c.frescura <= 1);
    assert.equal(c.diasDesdeElChequeo, 0);
  });
});

describe("indice: el promedio y los que no tienen dato", () => {
  test("los sin dato NO se promedian como cero, se cuentan aparte", () => {
    const r = indice([confianza(fila(0), 30, HOY), null, null]);
    assert.equal(r.medidos, 1);
    assert.equal(r.sinDatos, 2);
    // Si los null contaran como 0, esto daría un tercio de lo que da.
    assert.ok(r.valor! > 0.6);
  });

  test("todos sin dato: el valor es null, no cero", () => {
    const r = indice([null, null]);
    assert.equal(r.valor, null);
    assert.equal(r.sinDatos, 2);
  });

  test("lista vacía no rompe", () => {
    assert.deepEqual(indice([]), { valor: null, medidos: 0, sinDatos: 0 });
  });
});

describe("estaOlvidada: el piso que evita que lo chico no se mire nunca", () => {
  test("nunca chequeada y con producto: olvidada", () => {
    assert.equal(estaOlvidada({ chequeadoEn: null, unidades: 4 }, 60, HOY), true);
  });

  /**
   * Las que el sistema cree vacías NO entran, o el tope de la recorrida se
   * llenaría de confirmaciones de vacío y el operario pasaría por todas antes de
   * llegar a un palet.
   */
  test("nunca chequeada pero VACÍA: no es olvidada", () => {
    assert.equal(estaOlvidada({ chequeadoEn: null, unidades: 0 }, 60, HOY), false);
  });

  test("chequeada hace más del piso: olvidada", () => {
    assert.equal(estaOlvidada({ chequeadoEn: hace(61), unidades: 10 }, 60, HOY), true);
  });

  test("chequeada hace menos del piso: no", () => {
    assert.equal(estaOlvidada({ chequeadoEn: hace(59), unidades: 10 }, 60, HOY), false);
  });

  test("piso en 0 lo desactiva del todo", () => {
    assert.equal(estaOlvidada({ chequeadoEn: null, unidades: 999 }, 0, HOY), false);
  });
});

describe("ordenarRecorrida", () => {
  /**
   * El caso exacto que motivó el piso, medido sobre los datos de ejemplo: una
   * posición de 90 unidades recién chequeada tiene urgencia 4.1, y una de 4
   * unidades que nadie miró nunca tiene 4.0. Sin el piso, la segunda no la
   * alcanza JAMÁS: su urgencia máxima es su cantidad.
   */
  test("lo olvidado va primero aunque tenga menos urgencia", () => {
    const orden = ordenarRecorrida([
      { nombre: "grande y fresca", urgencia: 4.1, olvidada: false },
      { nombre: "chica y olvidada", urgencia: 4.0, olvidada: true },
    ]);
    assert.equal(orden[0].nombre, "chica y olvidada");
  });

  test("dentro de cada grupo sigue mandando la urgencia", () => {
    const orden = ordenarRecorrida([
      { nombre: "olvidada chica", urgencia: 5, olvidada: true },
      { nombre: "olvidada grande", urgencia: 50, olvidada: true },
      { nombre: "fresca enorme", urgencia: 200, olvidada: false },
    ]);
    assert.deepEqual(orden.map((o) => o.nombre), [
      "olvidada grande",
      "olvidada chica",
      "fresca enorme",
    ]);
  });

  test("no reordena la lista que recibe", () => {
    const original = [
      { urgencia: 1, olvidada: false },
      { urgencia: 9, olvidada: false },
    ];
    ordenarRecorrida(original);
    assert.equal(original[0].urgencia, 1, "el array de quien llama quedó intacto");
  });
});

describe("agruparIndices: el índice por línea, modelo y rack", () => {
  const c = (dias: number | null) => confianza(fila(dias), 30, HOY);
  const filas = [
    { linea: "Placas", dias: 0 },
    { linea: "Placas", dias: null },
    { linea: "Piedras", dias: 10 },
  ];
  const agrupado = () =>
    agruparIndices(filas, (f) => f.linea, (f) => c(f.dias));

  /**
   * La regla que se rompe sin que se note: si los sin dato se promediaran como
   * cero, "Placas" daría la mitad de lo que da. El numero quedaria mal en la
   * pantalla que existe justamente para decir de que fiarse.
   */
  test("los sin dato del grupo se cuentan aparte, no como cero", () => {
    const placas = agrupado().find((g) => g.clave === "Placas")!;
    assert.equal(placas.medidos, 1);
    assert.equal(placas.sinDatos, 1);
    assert.ok(placas.valor! > 0.6, "promedia solo el que tiene dato");
  });

  test("ningún renglón se pierde al agrupar", () => {
    const total = agrupado().reduce((s, g) => s + g.medidos + g.sinDatos, 0);
    assert.equal(total, filas.length);
  });

  test("un grupo sin ningún chequeo da null, no cero", () => {
    const solos = agruparIndices([{ k: "x", d: null }], (f) => f.k, (f) => c(f.d));
    assert.equal(solos[0].valor, null);
    assert.equal(solos[0].sinDatos, 1);
  });

  /**
   * El orden lo trae quien arma la lista -la base, por `orden` de linea y de
   * modelo-. Reordenar aca le pisaria esa decision.
   */
  test("conserva el orden de aparición, no alfabetiza", () => {
    assert.deepEqual(agrupado().map((g) => g.clave), ["Placas", "Piedras"]);
  });

  test("lista vacía devuelve lista vacía", () => {
    assert.deepEqual(agruparIndices([], () => "x", () => null), []);
  });
});
