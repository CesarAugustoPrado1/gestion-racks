import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { sql } from "drizzle-orm";
import { baseDeTest, sembrar, urlDeTest } from "./ayuda/base";
import {
  aplicarMovimiento,
  bloquearPosicion,
  crearBulto,
  exigirAltura,
  exigirLibre,
  exigirUsable,
  type Tx,
} from "../lib/acciones/motor";
import * as schema from "../lib/db/schema";
import { codigoDePosicion, posicionesDe, type Geometria } from "../lib/posiciones";
import { cubre, type ReglaExclusion } from "../lib/uso";
import { joinExclusion } from "../lib/uso-sql";

/**
 * El motor contra una base de verdad.
 *
 * Estos son los tests que importan. Todo lo demas de la suite prueba funciones
 * puras, que son faciles de probar justamente porque no pueden mentir sobre el
 * estado. Aca se prueba lo que si puede: que despues de una secuencia de
 * movimientos reales, sumar el historial siga dando el stock vivo.
 *
 * La 0003 dejo movimientos que SUMABAN en vez de restar. El esquema estaba
 * bien, las pantallas abrian, y el numero estaba mal. No lo encontro nadie
 * mirando: lo encontro una consulta. Esta.
 */

const hay = urlDeTest() != null;

/**
 * Que se vea. `describe({ skip })` no cuenta sus tests, asi que sin este aviso
 * la salida dice "63 pass" tanto con base como sin ella, y alguien podria creer
 * que probo el motor cuando en realidad solo probo funciones puras.
 */
if (!hay) {
  console.error(
    "\n  ⚠ Los tests del motor NO corrieron: no hay una base de PostgreSQL local.\n" +
      "    Se saltean a propósito; la suite nunca toca una base remota.\n" +
      "    Para correrlos: levantá Postgres y poné DATABASE_URL apuntando a localhost.\n",
  );
}
let base: Awaited<ReturnType<typeof baseDeTest>>;
let datos: Awaited<ReturnType<typeof sembrar>>;

before(async () => {
  if (!hay) return;
  base = await baseDeTest();
  datos = await sembrar(base.db);
});

after(async () => {
  if (base) await base.cerrar();
});

/** Sumar el historial: `sum(cantidad − cantidad_antes)` por modelo. */
async function segunElHistorial() {
  const filas = (await base.db.execute(sql`
    select l.modelo_id, sum(l.cantidad - l.cantidad_antes)::int as q
      from movimiento_lineas l
      join movimientos m on m.id = l.movimiento_id
     where m.anulado_en is null
     group by 1
  `)) as unknown as Array<{ modelo_id: number; q: number }>;
  return new Map(filas.map((f) => [f.modelo_id, f.q]));
}

/** El stock vivo: lo que dice `bulto_contenido` de los bultos en stock. */
async function stockVivo() {
  const filas = (await base.db.execute(sql`
    select c.modelo_id, sum(c.cantidad)::int as q
      from bulto_contenido c
      join bultos b on b.id = c.bulto_id
     where b.estado in ('ubicado', 'sin_ubicar')
     group by 1
  `)) as unknown as Array<{ modelo_id: number; q: number }>;
  return new Map(filas.map((f) => [f.modelo_id, f.q]));
}

async function exigirQueCuadre(donde: string) {
  const historial = await segunElHistorial();
  const vivo = await stockVivo();
  const modelos = new Set([...historial.keys(), ...vivo.keys()]);
  for (const id of modelos) {
    assert.equal(
      historial.get(id) ?? 0,
      vivo.get(id) ?? 0,
      `${donde}: el modelo ${id} no cuadra entre el historial y el stock vivo`,
    );
  }
  return modelos.size;
}

/** Mete un bulto nuevo, como lo hace la pantalla de meter. */
async function meter(
  tx: Tx,
  posicionId: number | null,
  packaging: "suelto" | "palet" | "optimizado",
  contenido: Array<{ modeloId: number; cantidad: number }>,
) {
  const destino = posicionId != null ? await bloquearPosicion(tx, posicionId) : null;
  let invade: { id: number; codigo: string } | null = null;
  if (destino) {
    exigirLibre(destino);
    const encaje = await exigirAltura(tx, destino, { packaging, contenido });
    invade = encaje.invadeArriba ? encaje.arriba! : null;
  }
  const nuevo = await crearBulto(tx, {
    packaging,
    estado: destino ? "ubicado" : "sin_ubicar",
    usuarioId: datos.usuario.id,
  });
  await aplicarMovimiento(tx, {
    tipo: "meter",
    bulto: {
      id: nuevo.id,
      codigo: nuevo.codigo,
      packaging,
      cantidad: 0,
      estado: destino ? "ubicado" : "sin_ubicar",
      posicionId: null,
      posicionCodigo: null,
      contenido: [],
      lineaCodigo: "",
    },
    contenidoDespues: contenido,
    packagingDespues: packaging,
    estadoDespues: destino ? "ubicado" : "sin_ubicar",
    posicionDestino: destino ? { id: destino.id, codigo: destino.codigo } : null,
    invadeArriba: invade,
    usuario: { id: datos.usuario.id, nombre: datos.usuario.nombre },
  });
  return nuevo;
}

describe("la invariante del stock", { skip: !hay && "sin base local" }, () => {
  test("meter suma exactamente lo que entró", async () => {
    await base.db.transaction(async (tx) => {
      await meter(tx as Tx, datos.pos("P-01-1-1"), "palet", [
        { modeloId: datos.laja.id, cantidad: 48 },
      ]);
    });
    const historial = await segunElHistorial();
    assert.equal(historial.get(datos.laja.id), 48);
    await exigirQueCuadre("después de meter");
  });

  test("una salida parcial RESTA, no suma", async () => {
    let bultoId = 0;
    await base.db.transaction(async (tx) => {
      const b = await meter(tx as Tx, datos.pos("P-01-3-1"), "palet", [
        { modeloId: datos.patagonica.id, cantidad: 40 },
      ]);
      bultoId = b.id;
    });

    await base.db.transaction(async (tx) => {
      const t = tx as Tx;
      // Se entregan 15 de 40: el palet pasa a suelto con 25.
      await aplicarMovimiento(t, {
        tipo: "sacar",
        bulto: {
          id: bultoId,
          codigo: "x",
          packaging: "palet",
          cantidad: 40,
          estado: "ubicado",
          posicionId: datos.pos("P-01-3-1"),
          posicionCodigo: "P-01-3-1",
          contenido: [
            {
              modeloId: datos.patagonica.id,
              cantidad: 40,
              modeloNombre: "Patagónica",
            },
          ],
          lineaCodigo: "piedras",
        },
        contenidoDespues: [{ modeloId: datos.patagonica.id, cantidad: 25 }],
        packagingDespues: "suelto",
        estadoDespues: "ubicado",
        posicionDestino: { id: datos.pos("P-01-3-1"), codigo: "P-01-3-1" },
        motivo: { id: datos.motivo.id, nombre: datos.motivo.nombre },
        usuario: { id: datos.usuario.id, nombre: datos.usuario.nombre },
      });
    });

    const historial = await segunElHistorial();
    assert.equal(historial.get(datos.patagonica.id), 25, "40 que entraron menos 15 que salieron");
    await exigirQueCuadre("después de una salida parcial");
  });

  test("mover no cambia el stock: ni suma ni resta", async () => {
    const antes = await segunElHistorial();
    let bultoId = 0;
    await base.db.transaction(async (tx) => {
      const b = await meter(tx as Tx, null, "suelto", [
        { modeloId: datos.laja.id, cantidad: 7 },
      ]);
      bultoId = b.id;
    });

    await base.db.transaction(async (tx) => {
      const t = tx as Tx;
      const destino = await bloquearPosicion(t, datos.pos("S-02-1"));
      exigirLibre(destino);
      await aplicarMovimiento(t, {
        tipo: "mover",
        bulto: {
          id: bultoId,
          codigo: "y",
          packaging: "suelto",
          cantidad: 7,
          estado: "sin_ubicar",
          posicionId: null,
          posicionCodigo: null,
          contenido: [{ modeloId: datos.laja.id, cantidad: 7, modeloNombre: "Laja" }],
          lineaCodigo: "piedras",
        },
        contenidoDespues: [{ modeloId: datos.laja.id, cantidad: 7 }],
        packagingDespues: "suelto",
        estadoDespues: "ubicado",
        posicionDestino: { id: destino.id, codigo: destino.codigo },
        usuario: { id: datos.usuario.id, nombre: datos.usuario.nombre },
      });
    });

    const despues = await segunElHistorial();
    assert.equal(
      despues.get(datos.laja.id)! - antes.get(datos.laja.id)!,
      7,
      "solo suma lo que metió, el mover aporta cero",
    );
    await exigirQueCuadre("después de mover");
  });

  test("al final de toda la secuencia el stock sigue cuadrando", async () => {
    const modelos = await exigirQueCuadre("al final");
    assert.ok(modelos >= 2, "se movieron al menos dos modelos");
  });

  test("ninguna posición quedó con dos bultos", async () => {
    const filas = (await base.db.execute(sql`
      select posicion_id from bultos
       where estado = 'ubicado' and posicion_id is not null
       group by posicion_id having count(*) > 1
    `)) as unknown as unknown[];
    assert.equal(filas.length, 0);
  });

  test("ningún movimiento quedó sin líneas", async () => {
    const filas = (await base.db.execute(sql`
      select m.id from movimientos m
       where not exists (select 1 from movimiento_lineas l where l.movimiento_id = m.id)
    `)) as unknown as unknown[];
    assert.equal(filas.length, 0);
  });
});

/**
 * La altura invasora. Es lo ultimo que se construyo y lo que mas partes toca,
 * asi que es lo que mas facil se rompe sin que nadie se entere: un error aca no
 * tira ninguna pantalla, solo deja una posicion ocupada que el sistema ofrece
 * como libre, o al reves.
 */
describe("un bulto alto ocupa dos posiciones", { skip: !hay && "sin base local" }, () => {
  /** Quien tiene tomada esta posicion desde abajo, si alguien. */
  async function tapadaPor(posicionId: number): Promise<number | null> {
    const filas = (await base.db.execute(sql`
      select bloqueada_por_bulto_id as id from posiciones where id = ${posicionId}
    `)) as unknown as Array<{ id: number | null }>;
    return filas[0].id;
  }

  test("en un PENETRABLE con el hueco de arriba libre, entra y toma las dos", async () => {
    let id = 0;
    await base.db.transaction(async (tx) => {
      const b = await meter(tx as Tx, datos.pos("P-01-2-2"), "optimizado", [
        { modeloId: datos.laja.id, cantidad: 60 },
      ]);
      id = b.id;
    });

    assert.equal(
      await tapadaPor(datos.pos("P-01-3-2")),
      id,
      "la de arriba tiene que quedar tomada por el bulto de abajo",
    );
    assert.equal(
      await tapadaPor(datos.pos("P-01-2-1")),
      null,
      "la de al lado NO se toca",
    );
  });

  test("la posición tapada ya no acepta nada", async () => {
    await assert.rejects(
      () =>
        base.db.transaction(async (tx) => {
          await meter(tx as Tx, datos.pos("P-01-3-2"), "palet", [
            { modeloId: datos.patagonica.id, cantidad: 40 },
          ]);
        }),
      /tapada|sobresale/i,
    );
  });

  test("con el hueco de arriba OCUPADO no deja: van a chocar", async () => {
    // P-01-3-2 esta tomada por el invasor del test anterior, asi que meter otro
    // optimizado en P-01-2-2 ya no se puede... usamos la otra columna.
    await base.db.transaction(async (tx) => {
      await meter(tx as Tx, datos.pos("P-01-3-1"), "palet", [
        { modeloId: datos.patagonica.id, cantidad: 40 },
      ]);
    }).catch(() => {
      /* si ya estaba ocupada de un test anterior, mejor todavia */
    });

    await assert.rejects(
      () =>
        base.db.transaction(async (tx) => {
          await meter(tx as Tx, datos.pos("P-01-2-1"), "optimizado", [
            { modeloId: datos.laja.id, cantidad: 60 },
          ]);
        }),
      /chocar/i,
      "tiene que nombrar el choque, no un 'no entra' genérico",
    );
  });

  /**
   * En un selectivo el palet se apoya en los largueros: no hay hacia donde
   * sobresalir, el hierro esta ahi. Es geometria del rack, no una preferencia.
   */
  test("en un SELECTIVO no sobresale nunca, aunque arriba esté libre", async () => {
    await assert.rejects(
      () =>
        base.db.transaction(async (tx) => {
          await meter(tx as Tx, datos.pos("S-01-1"), "optimizado", [
            { modeloId: datos.laja.id, cantidad: 60 },
          ]);
        }),
      /selectivo/i,
    );
    assert.equal(await tapadaPor(datos.pos("S-01-2")), null, "no tomó nada");
  });

  test("en el nivel más alto no hay hueco arriba: tampoco entra", async () => {
    await assert.rejects(
      () =>
        base.db.transaction(async (tx) => {
          await meter(tx as Tx, datos.pos("P-01-3-1"), "optimizado", [
            { modeloId: datos.laja.id, cantidad: 60 },
          ]);
        }),
      /nivel más alto|ya tiene|tapad/i,
    );
  });

  test("cuando el bulto se va, el hueco se libera solo", async () => {
    const arriba = datos.pos("P-01-3-2");
    const invasor = await tapadaPor(arriba);
    assert.ok(invasor, "el test anterior dejó un invasor");

    await base.db.transaction(async (tx) => {
      await aplicarMovimiento(tx as Tx, {
        tipo: "sacar",
        bulto: {
          id: invasor!,
          codigo: "z",
          packaging: "optimizado",
          cantidad: 60,
          estado: "ubicado",
          posicionId: datos.pos("P-01-2-2"),
          posicionCodigo: "P-01-2-2",
          contenido: [{ modeloId: datos.laja.id, cantidad: 60, modeloNombre: "Laja" }],
          lineaCodigo: "piedras",
        },
        contenidoDespues: [],
        packagingDespues: "optimizado",
        estadoDespues: "salido",
        posicionDestino: null,
        motivo: { id: datos.motivo.id, nombre: datos.motivo.nombre },
        usuario: { id: datos.usuario.id, nombre: datos.usuario.nombre },
      });
    });

    assert.equal(await tapadaPor(arriba), null, "el hueco tiene que quedar libre solo");
    await exigirQueCuadre("después de sacar el invasor");
  });

  test("no queda ninguna posición tomada por un bulto que ya no está en el rack", async () => {
    const filas = (await base.db.execute(sql`
      select p.id from posiciones p
      join bultos b on b.id = p.bloqueada_por_bulto_id
     where b.estado <> 'ubicado'
    `)) as unknown as unknown[];
    assert.equal(filas.length, 0);
  });
});

/**
 * Dónde NO se puede poner un bulto: niveles a los que el clark no llega y la
 * lista de exclusión.
 *
 * Usa grupos propios, creados acá, para no depender de lo que dejaron los
 * tests de arriba en P y S.
 */
describe("lugares que no se usan", { skip: !hay && "sin base local" }, () => {
  /** Crea un grupo con sus niveles y posiciones; devuelve id y buscador. */
  async function grupo(codigo: string, geo: Geometria, alturas: number[]) {
    const [g] = await base.db
      .insert(schema.grupos)
      .values({
        codigo,
        accesibilidad: geo.tipo,
        ancho: geo.ancho,
        niveles: geo.niveles,
        profundidad: geo.profundidad,
        unidades: geo.unidades,
      })
      .returning();
    await base.db.insert(schema.nivelesDeGrupo).values(
      alturas.map((a, i) => ({ grupoId: g.id, nivel: i + 1, alturaMaxCm: a })),
    );
    const ids = new Map<string, { id: number; unidad: number; nivel: number }>();
    for (const c of posicionesDe(geo)) {
      const cod = codigoDePosicion(c);
      const [p] = await base.db
        .insert(schema.posiciones)
        .values({
          grupoId: g.id,
          codigo: cod,
          unidad: c.unidad,
          columna: c.columna,
          nivel: c.nivel,
          profundidad: c.profundidad,
        })
        .returning();
      ids.set(`${codigo}-${cod}`, { id: p.id, unidad: c.unidad, nivel: c.nivel });
    }
    const pos = (c: string) => {
      const p = ids.get(c);
      if (!p) throw new Error(`no existe ${c}`);
      return p.id;
    };
    return { id: g.id, pos, todas: ids };
  }

  async function excluir(r: Omit<ReglaExclusion, "grupoId"> & { grupoId: number }) {
    const [e] = await base.db
      .insert(schema.exclusiones)
      .values({ ...r, motivo: "reparacion", nota: "test" })
      .returning();
    return e.id;
  }

  async function levantar(id: number) {
    await base.db.execute(sql`update exclusiones set levantada_en = now() where id = ${id}`);
  }

  async function usable(posicionId: number) {
    return base.db.transaction(async (tx) => {
      const p = await bloquearPosicion(tx as Tx, posicionId);
      exigirUsable(p);
      return true;
    });
  }

  let X: Awaited<ReturnType<typeof grupo>>;
  let Q: Awaited<ReturnType<typeof grupo>>;

  before(async () => {
    if (!hay) return;
    // Selectivo de 2 módulos de 1 columna, 3 niveles.
    X = await grupo(
      "X",
      { tipo: "selectivo", ancho: 1, niveles: 3, profundidad: null, unidades: 2 },
      [200, 200, 200],
    );
    // Penetrable de 1 calle, 3 niveles, profundidad 1. El 2 admite 190 y el
    // optimizado de Laja mide 205: sobresale hacia el 3.
    Q = await grupo(
      "Q",
      { tipo: "penetrable", ancho: null, niveles: 3, profundidad: 1, unidades: 1 },
      [210, 190, 230],
    );
  });

  test("un nivel al que el clark no llega se rechaza como destino", async () => {
    await base.db.execute(sql`
      update niveles set alcanzable = false where grupo_id = ${X.id} and nivel = 3
    `);
    await assert.rejects(() => usable(X.pos("X-01-3")), /clark no llega/);
    assert.ok(await usable(X.pos("X-01-2")), "el nivel de abajo sigue andando");
    await base.db.execute(sql`
      update niveles set alcanzable = true where grupo_id = ${X.id} and nivel = 3
    `);
    assert.ok(await usable(X.pos("X-01-3")), "y vuelve al prenderlo");
  });

  test("un módulo excluido se rechaza entero, y el de al lado no", async () => {
    const e = await excluir({ grupoId: X.id, unidad: 2, nivel: null, posicionId: null });
    await assert.rejects(() => usable(X.pos("X-02-1")), /fuera de uso: reparación, test/);
    await assert.rejects(() => usable(X.pos("X-02-3")), /fuera de uso/);
    assert.ok(await usable(X.pos("X-01-1")));
    await levantar(e);
    assert.ok(await usable(X.pos("X-02-1")), "levantada, vuelve a servir");
  });

  test("la regla en SQL dice lo mismo que cubre(), posición por posición", async () => {
    const reglas: ReglaExclusion[] = [
      { grupoId: X.id, unidad: null, nivel: 2, posicionId: null },
      { grupoId: X.id, unidad: null, nivel: null, posicionId: X.pos("X-02-3") },
      { grupoId: Q.id, unidad: 1, nivel: 1, posicionId: null },
    ];
    const ids: number[] = [];
    for (const r of reglas) ids.push(await excluir(r));
    // Y una levantada, que no tiene que contar para ninguna de las dos.
    const vieja = await excluir({ grupoId: X.id, unidad: 1, nivel: null, posicionId: null });
    await levantar(vieja);

    const filas = (await base.db.execute(sql`
      select p.id, p.grupo_id, p.unidad, p.nivel, ex.id as exclusion
        from posiciones p
        ${joinExclusion("p", "ex")}
       where p.grupo_id in (${X.id}, ${Q.id})
    `)) as unknown as Array<{
      id: number;
      grupo_id: number;
      unidad: number;
      nivel: number;
      exclusion: number | null;
    }>;

    assert.ok(filas.length >= 9);
    for (const f of filas) {
      const p = { id: f.id, grupoId: f.grupo_id, unidad: f.unidad, nivel: f.nivel };
      assert.equal(
        f.exclusion != null,
        reglas.some((r) => cubre(r, p)),
        `la posición ${f.id} (unidad ${f.unidad}, nivel ${f.nivel}) no coincide`,
      );
    }
    for (const id of ids) await levantar(id);
  });

  test("un bulto alto no puede sobresalir hacia un hueco excluido", async () => {
    const e = await excluir({ grupoId: Q.id, unidad: null, nivel: null, posicionId: Q.pos("Q-01-3-1") });
    await assert.rejects(
      () =>
        base.db.transaction(async (tx) => {
          await meter(tx as Tx, Q.pos("Q-01-2-1"), "optimizado", [
            { modeloId: datos.laja.id, cantidad: 60 },
          ]);
        }),
      /fuera de uso/,
    );
    await levantar(e);
  });

  test("pero sí hacia uno al que el clark no llega: el problema ahí es la horquilla, no el aire", async () => {
    await base.db.execute(sql`
      update niveles set alcanzable = false where grupo_id = ${Q.id} and nivel = 3
    `);
    await base.db.transaction(async (tx) => {
      await meter(tx as Tx, Q.pos("Q-01-2-1"), "optimizado", [
        { modeloId: datos.laja.id, cantidad: 60 },
      ]);
    });
    const [arriba] = (await base.db.execute(sql`
      select bloqueada_por_bulto_id as id from posiciones where id = ${Q.pos("Q-01-3-1")}
    `)) as unknown as Array<{ id: number | null }>;
    assert.ok(arriba.id, "la de arriba quedó tomada por el de abajo");
    await exigirQueCuadre("después de meter en Q");
  });

  test("lo que quedó en un lugar excluido no se atrapa: el origen no se valida", async () => {
    // El optimizado del test anterior está en Q-01-2-1. Se excluye la calle
    // entera y se lo saca: tiene que poder salir.
    const e = await excluir({ grupoId: Q.id, unidad: 1, nivel: null, posicionId: null });
    const [b] = (await base.db.execute(sql`
      select id from bultos where posicion_id = ${Q.pos("Q-01-2-1")} and estado = 'ubicado'
    `)) as unknown as Array<{ id: number }>;
    await base.db.transaction(async (tx) => {
      // El origen se bloquea igual que en `sacar` y NO se le pide exigirUsable.
      await bloquearPosicion(tx as Tx, Q.pos("Q-01-2-1"));
      await aplicarMovimiento(tx as Tx, {
        tipo: "sacar",
        bulto: {
          id: b.id,
          codigo: "q",
          packaging: "optimizado",
          cantidad: 60,
          estado: "ubicado",
          posicionId: Q.pos("Q-01-2-1"),
          posicionCodigo: "Q-01-2-1",
          contenido: [{ modeloId: datos.laja.id, cantidad: 60, modeloNombre: "Laja" }],
          lineaCodigo: "piedras",
        },
        contenidoDespues: [],
        packagingDespues: "optimizado",
        estadoDespues: "salido",
        posicionDestino: null,
        motivo: { id: datos.motivo.id, nombre: datos.motivo.nombre },
        usuario: { id: datos.usuario.id, nombre: datos.usuario.nombre },
      });
    });
    await levantar(e);
    await exigirQueCuadre("después de sacar de una calle excluida");
  });
});
