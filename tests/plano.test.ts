import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  aGrilla,
  esquemaPlano,
  esquinasDeRack,
  girar,
  largo,
  mover,
  moverVertice,
  problemaDelPlano,
  superficie,
  type Elemento,
  type Plano,
} from "../lib/plano";

const rack = (extra: Partial<Extract<Elemento, { tipo: "rack" }>> = {}): Elemento => ({
  id: "r1",
  tipo: "rack",
  x: 10,
  y: 10,
  ancho: 10,
  largo: 2,
  rotacion: 0,
  grupoId: 1,
  ...extra,
});
const plano = (elementos: Elemento[]): Plano => ({ ancho: 100, largo: 50, elementos });

describe("plano: geometría", () => {
  test("un rack girado 90° cambia ancho por largo sin mover el centro", () => {
    const r = rack();
    const g = girar(r);
    const [a, , c] = esquinasDeRack(g as Extract<Elemento, { tipo: "rack" }>);
    assert.deepEqual([c[0] - a[0], c[1] - a[1]], [2, 10]);
    const centro = (ps: number[][]) => [(ps[0][0] + ps[2][0]) / 2, (ps[0][1] + ps[2][1]) / 2];
    assert.deepEqual(centro(esquinasDeRack(r as never)), centro(esquinasDeRack(g as never)));
  });

  test("cuatro giros vuelven al principio", () => {
    let r = rack();
    for (let i = 0; i < 4; i++) r = girar(r);
    assert.equal((r as { rotacion: number }).rotacion, 0);
  });

  test("mover un trazo mueve todos sus puntos; mover un vértice, solo ese", () => {
    const c: Elemento = { id: "c", tipo: "calle", ancho: 4, puntos: [[0, 0], [10, 0]] };
    assert.deepEqual((mover(c, 1, 2) as { puntos: number[][] }).puntos, [[1, 2], [11, 2]]);
    assert.deepEqual((moverVertice(c, 1, [10, 5]) as { puntos: number[][] }).puntos, [[0, 0], [10, 5]]);
  });

  test("superficie, perímetro y largo", () => {
    const cuadrado: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    assert.equal(superficie(cuadrado), 100);
    assert.equal(largo(cuadrado, true), 40);
    assert.equal(largo(cuadrado), 30);
  });

  test("la grilla redondea a medio metro", () => {
    assert.equal(aGrilla(3.26), 3.5);
    assert.equal(aGrilla(3.24), 3);
  });
});

describe("plano: lo que no se puede guardar", () => {
  test("un plano correcto pasa", () => {
    assert.equal(problemaDelPlano(plano([rack()])), null);
    assert.ok(esquemaPlano.safeParse(plano([rack()])).success);
  });

  test("algo que se sale del espacio de trabajo", () => {
    assert.match(problemaDelPlano(plano([rack({ x: 95 })]))!, /se sale/);
    const calle: Elemento = { id: "c", tipo: "calle", ancho: 4, puntos: [[0, 0], [120, 0]] };
    assert.match(problemaDelPlano(plano([calle]))!, /se sale/);
  });

  test("un rack girado que se sale aunque sin girar entraría", () => {
    // 10 × 2 pegado abajo: girado mide 2 × 10 y se sale por abajo.
    const r = girar(rack({ y: 47 }));
    assert.match(problemaDelPlano(plano([r]))!, /se sale/);
  });

  test("el mismo grupo dibujado dos veces", () => {
    assert.match(problemaDelPlano(plano([rack(), rack({ id: "r2", x: 40 })]))!, /dos veces/);
  });

  test("dos racks sin grupo no es problema", () => {
    assert.equal(problemaDelPlano(plano([rack({ grupoId: null }), rack({ id: "r2", x: 40, grupoId: null })])), null);
  });

  test("ids repetidos", () => {
    assert.match(problemaDelPlano(plano([rack({ grupoId: null }), rack({ x: 40, grupoId: null })]))!, /identificador/);
  });

  test("el esquema rechaza trazos incompletos y medidas absurdas", () => {
    assert.equal(esquemaPlano.safeParse(plano([{ id: "l", tipo: "limite", puntos: [[0, 0], [1, 1]] }])).success, false);
    assert.equal(esquemaPlano.safeParse(plano([{ id: "a", tipo: "acceso", puntos: [[0, 0]] }])).success, false);
    assert.equal(esquemaPlano.safeParse({ ancho: 5, largo: 50, elementos: [] }).success, false);
  });
});
