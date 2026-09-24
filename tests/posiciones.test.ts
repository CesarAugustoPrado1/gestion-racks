import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  codigoDePosicion,
  cuantasPosiciones,
  loQueTapa,
  nombreDeNivel,
  nombreDeProfundidad,
  posicionesDe,
  type Geometria,
  type Ocupada,
} from "../lib/posiciones";

/**
 * La geometría del rack y la regla del penetrable.
 *
 * `loQueTapa` es la que más movimientos rechaza de toda la app, y la que peor se
 * verifica a ojo: un error acá no rompe nada, solo deja que el autoelevador vaya
 * a buscar un palet que no puede sacar. Por eso se prueba contra la planta, con
 * los casos que el dueño describió, y no contra lo que dice el código.
 */

const calle = (etiqueta: string, nivel: number, profundidad: number): Ocupada => ({
  nivel,
  profundidad,
  etiqueta,
});

describe("loQueTapa: qué impide sacar un bulto de un penetrable", () => {
  test("nada tapa a lo que está en el pasillo con la calle vacía", () => {
    assert.deepEqual(loQueTapa({ nivel: 2, profundidad: 1 }, []), []);
  });

  test("el del mismo nivel más cerca del pasillo tapa al del fondo", () => {
    const tapan = loQueTapa({ nivel: 2, profundidad: 3 }, [
      calle("adelante", 2, 1),
      calle("al medio", 2, 2),
    ]);
    assert.deepEqual(tapan.map((t) => t.etiqueta), ["adelante", "al medio"]);
  });

  test("el del fondo NO tapa al de adelante: se saca primero el de afuera", () => {
    assert.deepEqual(loQueTapa({ nivel: 2, profundidad: 1 }, [calle("fondo", 2, 3)]), []);
  });

  /**
   * La segunda regla, la que el dueño explicó y yo no habría deducido: el clark
   * entra MANEJANDO por adentro de la calle, así que un palet en el piso le corta
   * el camino aunque esté en otro nivel.
   */
  test("el piso le corta el camino al clark hasta esa profundidad", () => {
    const tapan = loQueTapa({ nivel: 2, profundidad: 2 }, [calle("en el piso", 1, 2)]);
    assert.deepEqual(tapan.map((t) => t.etiqueta), ["en el piso"]);
  });

  test("el piso tapa incluso estando a la MISMA profundidad, no solo más afuera", () => {
    const tapan = loQueTapa({ nivel: 3, profundidad: 1 }, [calle("pasillo piso", 1, 1)]);
    assert.equal(tapan.length, 1);
  });

  test("el piso MÁS ADENTRO que el objetivo no estorba: el clark no llega hasta ahí", () => {
    assert.deepEqual(loQueTapa({ nivel: 3, profundidad: 1 }, [calle("piso fondo", 1, 2)]), []);
  });

  test("estando en el piso, el piso no se tapa a sí mismo por altura", () => {
    // La regla 2 solo aplica si el objetivo está ARRIBA del piso.
    const tapan = loQueTapa({ nivel: 1, profundidad: 2 }, [calle("pasillo", 1, 1)]);
    // Lo tapa por la regla 1 (mismo nivel, más afuera), no por la 2.
    assert.deepEqual(tapan.map((t) => t.etiqueta), ["pasillo"]);
  });

  test("en un selectivo no tapa nada: se alcanza sin mover nada", () => {
    const tapan = loQueTapa({ nivel: 3, profundidad: null }, [
      { nivel: 1, profundidad: null, etiqueta: "abajo" },
      { nivel: 2, profundidad: null, etiqueta: "al medio" },
    ]);
    assert.deepEqual(tapan, []);
  });
});

describe("geometría: cuántas posiciones tiene un grupo y cómo se llaman", () => {
  const penetrable: Geometria = {
    tipo: "penetrable",
    ancho: null,
    niveles: 3,
    profundidad: 2,
    unidades: 6,
  };
  const selectivo: Geometria = {
    tipo: "selectivo",
    ancho: 2,
    niveles: 3,
    profundidad: null,
    unidades: 5,
  };

  test("penetrable: calles × niveles × profundidad", () => {
    assert.equal(cuantasPosiciones(penetrable), 6 * 3 * 2);
    assert.equal(posicionesDe(penetrable).length, 36);
  });

  test("selectivo: módulos × ancho × niveles", () => {
    assert.equal(cuantasPosiciones(selectivo), 5 * 2 * 3);
    assert.equal(posicionesDe(selectivo).length, 30);
  });

  test("las posiciones generadas no se repiten", () => {
    for (const g of [penetrable, selectivo]) {
      const codigos = posicionesDe(g).map(codigoDePosicion);
      assert.equal(new Set(codigos).size, codigos.length);
    }
  });

  /**
   * La columna CORRIDA: módulo 3, columna 2 de un rack de 2 de ancho es la
   * columna 6, no "3-2". Es lo que hace que el código sea un solo número para el
   * que lo busca parado frente al rack.
   */
  test("las columnas de un selectivo van corridas por grupo", () => {
    const columnas = posicionesDe(selectivo).map((c) => c.columna);
    assert.deepEqual([...new Set(columnas)].sort((a, b) => a! - b!), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  test("el código sale como se dice por handy", () => {
    assert.equal(codigoDePosicion({ unidad: 7, columna: null, nivel: 2, profundidad: 1 }), "07-2-1");
    assert.equal(codigoDePosicion({ unidad: 3, columna: 6, nivel: 3, profundidad: null }), "06-3");
  });
});

describe("nombres de niveles y profundidades", () => {
  test("con tres niveles: piso, medio, arriba", () => {
    assert.deepEqual(
      [1, 2, 3].map((n) => nombreDeNivel(n, 3)),
      ["piso", "medio", "arriba"],
    );
  });

  test("con cuatro se numeran los del medio, porque en la planta no tienen nombre", () => {
    const nombres = [1, 2, 3, 4].map((n) => nombreDeNivel(n, 4));
    assert.equal(nombres[0], "piso");
    assert.equal(nombres[3], "arriba");
    assert.equal(new Set(nombres).size, 4, "ninguno se repite");
  });

  test("con dos niveles no hay medio", () => {
    assert.deepEqual([1, 2].map((n) => nombreDeNivel(n, 2)), ["piso", "arriba"]);
  });

  test("profundidad: el 1 es siempre el del pasillo", () => {
    assert.equal(nombreDeProfundidad(1, 2), "pasillo");
    assert.equal(nombreDeProfundidad(1, 3), "pasillo");
    assert.equal(nombreDeProfundidad(2, 2), "pared");
    assert.equal(nombreDeProfundidad(3, 3), "pared");
    // Con tres, el del medio se llama "centro" y no "medio", que es un nivel.
    assert.equal(nombreDeProfundidad(2, 3), "centro");
  });
});
