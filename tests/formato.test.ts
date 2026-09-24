import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { abreviaturas, medidaDeSolapa, resumenPackaging } from "../lib/formato";

/**
 * "si me dice palets 3, deben ser 3 palets no tres placas".
 *
 * Es la corrección del dueño, y es la razón de que `medidaDeSolapa` exista. Un
 * palet se cuenta en palets; el equivalente en unidades va al lado, entre
 * paréntesis, como traducción y no como número principal.
 */
describe("las solapas de palet cuentan PALETS, no unidades", () => {
  const cuenta = { bultos: 3, unidades: 144 };

  test("palet: el número grande son los palets", () => {
    const m = medidaDeSolapa("palet", cuenta, "paquete", "paquetes");
    assert.equal(m.valor, 3);
    assert.equal(m.unidad, "palets");
    assert.equal(m.equivale, 144, "el equivalente en paquetes va al lado");
  });

  test("optimizado: igual que palet", () => {
    const m = medidaDeSolapa("optimizado", cuenta, "paquete", "paquetes");
    assert.equal(m.valor, 3);
    assert.equal(m.equivale, 144);
  });

  /**
   * El suelto NO tiene equivalencia: no hay un "bulto suelto" que valga como
   * unidad comercial, se cuenta de a uno. `equivale` en null es eso.
   */
  test("suelto: el número grande son las unidades, y no hay traducción", () => {
    const m = medidaDeSolapa("suelto", { bultos: 2, unidades: 21 }, "placa", "placas");
    assert.equal(m.valor, 21);
    assert.equal(m.unidad, "placas");
    assert.equal(m.equivale, null);
  });

  test("uno solo va en singular, en las dos formas", () => {
    assert.equal(medidaDeSolapa("palet", { bultos: 1, unidades: 48 }, "p", "ps").unidad, "palet");
    assert.equal(medidaDeSolapa("suelto", { bultos: 1, unidades: 1 }, "placa", "placas").unidad, "placa");
  });
});

describe("resumenPackaging", () => {
  test("los palets se resumen en palets", () => {
    assert.equal(resumenPackaging("palet", { bultos: 5, unidades: 240 }, "p", "ps"), "5 palets");
    assert.equal(resumenPackaging("optimizado", { bultos: 1, unidades: 60 }, "p", "ps"), "1 optimizado");
  });

  /**
   * "Suelto: 21 placas" y no "21 placas sueltas": la unidad sale de la línea y
   * no sabemos su género. Placa y caja son femeninas, paquete masculino, y un
   * adjetivo obligaría a cargar el género de cada unidad por una `s`.
   */
  test("el suelto va como etiqueta, no como adjetivo", () => {
    const r = resumenPackaging("suelto", { bultos: 3, unidades: 21 }, "placa", "placas");
    assert.equal(r, "Suelto: 21 placas");
    assert.doesNotMatch(r, /sueltas|sueltos/);
  });
});

describe("abreviaturas del tablero", () => {
  /**
   * El color solo no puede cargar la identidad -hay quien no lo distingue, y una
   * pantalla al sol tampoco-, así que cada celda lleva dos letras. Y "Placas" y
   * "Piedras" empiezan igual.
   */
  test("dos líneas que empiezan igual reciben marcas distintas", () => {
    const a = abreviaturas(["Placas", "Piedras"]);
    assert.notEqual(a["Placas"], a["Piedras"]);
  });

  test("todas las marcas son únicas, aunque los nombres se parezcan", () => {
    const nombres = ["Placas", "Piedras", "Pisos flotantes", "Porcelanato", "Piedra laja"];
    const marcas = Object.values(abreviaturas(nombres));
    assert.equal(new Set(marcas).size, nombres.length);
  });

  test("hay una marca para cada línea", () => {
    const nombres = ["Placas", "Piedras"];
    const a = abreviaturas(nombres);
    for (const n of nombres) assert.ok(a[n], `falta la marca de ${n}`);
  });
});
