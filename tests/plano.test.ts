import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  ESTILO_DE_FABRICA,
  estiloDe,
  tipografiaDe,
  aGrilla,
  aUsuario,
  deUsuario,
  elementoDesdeRect,
  esRectilineo,
  rectDeElemento,
  unirRectilineos,
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

describe("plano: ejes de referencia", () => {
  const p = { largo: 50, origen: { x: 10, y: 5 } };

  test("ida y vuelta entre coordenadas internas y de usuario", () => {
    const q: [number, number] = [37.5, 12];
    assert.deepEqual(deUsuario(aUsuario(q, p), p), q);
  });

  test("sin origen, el (0,0) es la esquina de abajo a la izquierda e Y crece hacia arriba", () => {
    assert.deepEqual(aUsuario([0, 50], { largo: 50 }), [0, 0]);
    assert.deepEqual(aUsuario([0, 40], { largo: 50 }), [0, 10]);
  });

  test("un rectángulo cargado por medidas vuelve con las mismas medidas, para cada tipo", () => {
    const r = { x: 3, y: 4, ancho: 20, alto: 6 };
    for (const tipo of ["limite", "techado", "rack", "calle"] as const) {
      assert.deepEqual(rectDeElemento(elementoDesdeRect(tipo, r, p), p), r, tipo);
    }
    const seg = { x: 3, y: 4, ancho: 8, alto: 0 };
    assert.deepEqual(rectDeElemento(elementoDesdeRect("acceso", seg, p), p), seg);
  });

  test("una calle angosta y vertical: el ancho es el lado corto", () => {
    const e = elementoDesdeRect("calle", { x: 0, y: 0, ancho: 4, alto: 30 }, p);
    assert.equal((e as { ancho: number }).ancho, 4);
  });

  test("un polígono en L no se puede editar por medidas", () => {
    const l: Elemento = { id: "l", tipo: "limite", puntos: [[0, 0], [10, 0], [10, 5], [5, 5], [5, 10], [0, 10]] };
    assert.equal(rectDeElemento(l, p), null);
  });
});

describe("plano: unir figuras", () => {
  const rect = (x: number, y: number, w: number, h: number): [number, number][] => [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];
  const puntos = (r: ReturnType<typeof unirRectilineos>) => {
    assert.ok("puntos" in r, "error" in r ? r.error : "");
    return (r as { puntos: [number, number][] }).puntos;
  };

  test("dos rectángulos que se superponen dan una L con el área de la unión", () => {
    const u = puntos(unirRectilineos([rect(0, 0, 10, 4), rect(0, 0, 4, 10)]));
    assert.equal(u.length, 6);
    assert.equal(superficie(u), 10 * 4 + 4 * 10 - 4 * 4);
    assert.ok(esRectilineo(u));
  });

  test("tres rectángulos: el lote en forma de T", () => {
    const u = puntos(unirRectilineos([rect(0, 0, 30, 10), rect(10, 10, 10, 20), rect(10, 5, 10, 10)]));
    assert.equal(superficie(u), 300 + 200);
    assert.equal(u.length, 8);
  });

  test("dos rectángulos que comparten un lado se funden en uno solo", () => {
    const u = puntos(unirRectilineos([rect(0, 0, 10, 5), rect(10, 0, 10, 5)]));
    assert.equal(u.length, 4);
    assert.equal(superficie(u), 100);
  });

  test("uno adentro del otro: queda el de afuera", () => {
    const u = puntos(unirRectilineos([rect(0, 0, 20, 20), rect(5, 5, 5, 5)]));
    assert.equal(u.length, 4);
    assert.equal(superficie(u), 400);
  });

  test("separados, o tocándose solo por una esquina: no se pueden unir", () => {
    assert.ok("error" in unirRectilineos([rect(0, 0, 5, 5), rect(10, 10, 5, 5)]));
    assert.ok("error" in unirRectilineos([rect(0, 0, 5, 5), rect(5, 5, 5, 5)]));
  });

  test("una unión que deja un hueco en el medio se rechaza", () => {
    const anillo = [rect(0, 0, 30, 5), rect(0, 25, 30, 5), rect(0, 0, 5, 30), rect(25, 0, 5, 30)];
    const r = unirRectilineos(anillo);
    assert.ok("error" in r && /hueco/.test(r.error));
  });

  test("figuras con lados inclinados no se unen", () => {
    assert.ok("error" in unirRectilineos([[[0, 0], [10, 0], [5, 8]], rect(0, 0, 5, 5)]));
  });

  test("el contorno arranca arriba a la izquierda y va en el mismo sentido que un rectángulo", () => {
    const u = puntos(unirRectilineos([rect(0, 0, 10, 4), rect(0, 0, 4, 10)]));
    assert.deepEqual(u[0], [0, 0]);
    assert.deepEqual(u[1], [10, 0]);
  });
});

describe("plano: estilos", () => {
  const techo: Elemento = { id: "t", tipo: "techado", puntos: [[0, 0], [10, 0], [10, 10], [0, 10]] };

  test("sin reglas ni estilo propio, sale el de fábrica", () => {
    assert.deepEqual(estiloDe(techo, {}), ESTILO_DE_FABRICA.techado);
  });

  test("la regla del tipo pisa a la de fábrica, campo por campo", () => {
    const e = estiloDe(techo, { estilos: { techado: { trazo: "#ff0000" } } });
    assert.equal(e.trazo, "#ff0000");
    assert.equal(e.relleno, ESTILO_DE_FABRICA.techado.relleno, "lo que la regla no dice, se hereda");
  });

  test("el estilo propio pisa a la regla, y lo que no dice lo hereda de la regla", () => {
    const e = estiloDe(
      { ...techo, estilo: { relleno: "ninguno" } },
      { estilos: { techado: { trazo: "#ff0000", grosor: 5 } } },
    );
    assert.equal(e.relleno, "ninguno");
    assert.equal(e.trazo, "#ff0000");
    assert.equal(e.grosor, 5);
  });

  test("un campo propio sin valor no borra el heredado", () => {
    const e = estiloDe({ ...techo, estilo: { trazo: undefined } }, { estilos: { techado: { trazo: "#00ff00" } } });
    assert.equal(e.trazo, "#00ff00");
  });

  test("la tipografía arranca en la de fábrica", () => {
    assert.deepEqual(tipografiaDe({}), { fuente: "sans", tamano: 100 });
    assert.equal(tipografiaDe({ texto: { fuente: "serif", tamano: 150 } }).tamano, 150);
  });

  test("el esquema acepta estilos y tipografía válidos, y rechaza colores mal escritos", () => {
    const base = { ancho: 100, largo: 50, elementos: [{ ...techo, estilo: { relleno: "#aabbcc", trazo: "ninguno", tipoTrazo: "puntos", grosor: 4 } }] };
    assert.ok(esquemaPlano.safeParse({ ...base, estilos: { rack: { relleno: "ocupacion" } }, texto: { fuente: "mono", tamano: 120, color: "#112233" } }).success);
    assert.equal(esquemaPlano.safeParse({ ...base, estilos: { rack: { trazo: "rojo" } } }).success, false);
    assert.equal(esquemaPlano.safeParse({ ...base, texto: { fuente: "comic", tamano: 100 } }).success, false);
  });

  test("rearmar un elemento por medidas no le borra el estilo propio", () => {
    const p = { largo: 50 };
    const conEstilo = { ...elementoDesdeRect("techado", { x: 0, y: 0, ancho: 5, alto: 5 }, p), estilo: { trazo: "#123456" } } as Elemento;
    const rearmado = elementoDesdeRect("techado", { x: 1, y: 1, ancho: 8, alto: 8 }, p, conEstilo);
    assert.deepEqual(rearmado.estilo, { trazo: "#123456" });
  });
});
