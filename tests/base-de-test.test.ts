import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { urlDeTest } from "./ayuda/base";

/**
 * El guardia que impide que la suite dropee la base de produccion.
 *
 * `baseDeTest()` hace `drop database ... with (force)`. Si alguien corre los
 * tests con `DATABASE_URL` apuntando a Neon -porque es lo que tiene en
 * `.env.local`, que es exactamente lo normal- eso se lleva puesta la planta.
 *
 * Por eso `urlDeTest()` devuelve `null` para cualquier host que no sea local, y
 * por eso esta funcion tiene tests propios: es el unico codigo de toda la suite
 * cuyo fallo no se ve como un test en rojo sino como una base vacia.
 */
describe("urlDeTest: de qué bases se puede abusar", () => {
  const con = (url: string | undefined) => {
    const previo = process.env.DATABASE_URL;
    const previoTest = process.env.TEST_DATABASE_URL;
    delete process.env.TEST_DATABASE_URL;
    if (url === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = url;
    try {
      return urlDeTest();
    } finally {
      if (previo === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previo;
      if (previoTest !== undefined) process.env.TEST_DATABASE_URL = previoTest;
    }
  };

  test("NEON QUEDA AFUERA", () => {
    assert.equal(
      con("postgresql://u:p@ep-algo-pooler.c-2.sa-east-1.aws.neon.tech/neondb"),
      null,
    );
  });

  test("cualquier host remoto queda afuera", () => {
    for (const host of ["db.produccion.com", "10.0.0.5", "192.168.1.9", "algo.rds.amazonaws.com"]) {
      assert.equal(con(`postgresql://u:p@${host}:5432/racks`), null, host);
    }
  });

  test("sin variable, null", () => {
    assert.equal(con(undefined), null);
  });

  test("una URL rota no explota, devuelve null", () => {
    assert.equal(con("esto no es una url"), null);
  });

  /**
   * Y lo que SI se permite: local, y sobre una base con sufijo `_test`. Nunca
   * la base de desarrollo, que tambien tiene datos que alguien esta mirando.
   */
  test("local sí, pero sobre otra base: le agrega _test", () => {
    const url = con("postgresql://postgres@127.0.0.1:5433/racks");
    assert.ok(url);
    assert.match(url!, /\/racks_test$/);
    assert.doesNotMatch(url!, /\/racks$/);
  });

  test("localhost también vale", () => {
    assert.match(con("postgresql://postgres@localhost:5432/loquesea")!, /_test$/);
  });
});
