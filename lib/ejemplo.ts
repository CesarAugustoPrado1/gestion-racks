import "server-only";
import { eq } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { esMezclado, total, validarComposicion } from "./bultos";
import { codigoDePosicion, posicionesDe, type Geometria } from "./posiciones";
import {
  bultoContenido,
  bultos,
  chequeos,
  grupos,
  nivelesDeGrupo,
  lineas,
  modelos,
  movimientoLineas,
  movimientos,
  normas,
  posiciones,
  type Packaging,
} from "./db/schema";

/**
 * Datos de ejemplo para probar la app antes de cargar los reales.
 *
 * LOS NUMEROS SON INVENTADOS. Las normas de abajo -cuantos paquetes lleva un
 * optimizado de Laja- son plausibles, no reales: estan para que las pantallas
 * tengan algo que mostrar, no para usarse. Los modelos si son los que nombraste,
 * para que se reconozcan de un vistazo.
 *
 * El conjunto esta armado para que se vea lo que hay que ver:
 * - Los tres packagings, incluido producto suelto sin norma.
 * - Bultos fuera de norma, que tienen que aparecer marcados.
 * - Un rack penetrable con carriles de profundidad 3, al lado de dos selectivos.
 * - Chequeos de ayer, de hace un mes y de hace dos, MAS posiciones nunca
 *   chequeadas: sin esa mezcla el indice de confiabilidad se ve plano y no se
 *   entiende para que sirve.
 * - Movimientos repartidos en los ultimos dos meses, no todos hoy.
 */

/**
 * Azar reproducible.
 *
 * Con Math.random cada carga daria un conjunto distinto, y entonces "en la
 * prueba de ayer el rack C se veia mal" no se podria volver a mirar. Mismo
 * ejemplo siempre.
 */
function azar(semilla: number) {
  let s = semilla;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const DIA = 24 * 60 * 60 * 1000;
const haceDias = (d: number) => new Date(Date.now() - d * DIA);

type DefModelo = {
  nombre: string;
  palet: number | null;
  optimizado: number | null;
  /** Alturas en centímetros. Inventadas, como las cantidades. */
  altoPalet: number | null;
  altoOptimizado: number | null;
};

const CATALOGO: Array<{
  codigo: string;
  nombre: string;
  unidadSingular: string;
  unidadPlural: string;
  activa: boolean;
  modelos: DefModelo[];
}> = [
  {
    codigo: "placas",
    nombre: "Placas",
    unidadSingular: "placa",
    unidadPlural: "placas",
    activa: true,
    modelos: [
      { nombre: "Standard 9.5", palet: 72, optimizado: 90, altoPalet: 150, altoOptimizado: 185 },
      { nombre: "Standard 12.5", palet: 60, optimizado: 75, altoPalet: 160, altoOptimizado: 200 },
      { nombre: "RH 12.5", palet: 60, optimizado: 75, altoPalet: 160, altoOptimizado: 200 },
    ],
  },
  {
    codigo: "piedras",
    nombre: "Piedras",
    unidadSingular: "paquete",
    unidadPlural: "paquetes",
    activa: true,
    modelos: [
      { nombre: "Laja", palet: 48, optimizado: 60, altoPalet: 145, altoOptimizado: 205 },
      { nombre: "Patagónica", palet: 40, optimizado: 52, altoPalet: 140, altoOptimizado: 195 },
      { nombre: "Ekos", palet: 36, optimizado: 45, altoPalet: 138, altoOptimizado: 180 },
    ],
  },
  {
    /**
     * La tercera linea entra apagada y sin modelos. Es a proposito: demuestra
     * que el sistema ya la contempla y que encenderla no necesita tocar codigo,
     * que es todo lo que "dejar listo para pisos flotantes" tenia que significar.
     */
    codigo: "pisos",
    nombre: "Pisos flotantes",
    unidadSingular: "caja",
    unidadPlural: "cajas",
    activa: false,
    modelos: [],
  },
];

/**
 * Los cuatro grupos del ejemplo cubren las cuatro formas que existen en la
 * planta: selectivos de 3 y de 4 niveles, y penetrables de 2 y de 3 de
 * profundidad. Las alturas están en centímetros y son inventadas, como las
 * normas: están para que la validación tenga algo que rechazar.
 */
const GRUPOS: Array<{
  codigo: string;
  nombre: string;
  geometria: Geometria;
  /** Altura libre de cada nivel, del piso para arriba. */
  alturas: Array<number | null>;
}> = [
  {
    codigo: "A",
    nombre: "Penetrable chico",
    geometria: { tipo: "penetrable", ancho: null, niveles: 3, profundidad: 2, unidades: 6 },
    alturas: [210, 190, 230],
  },
  {
    codigo: "B",
    nombre: "Penetrable grande",
    geometria: { tipo: "penetrable", ancho: null, niveles: 3, profundidad: 3, unidades: 4 },
    alturas: [210, 190, 230],
  },
  {
    codigo: "C",
    nombre: "Selectivo",
    geometria: { tipo: "selectivo", ancho: 2, niveles: 3, profundidad: null, unidades: 5 },
    alturas: [200, 200, 240],
  },
  {
    codigo: "D",
    nombre: "Selectivo alto",
    geometria: { tipo: "selectivo", ancho: 2, niveles: 4, profundidad: null, unidades: 4 },
    // El nivel de arriba sin medir: el sistema no valida y eso también hay que
    // poder verlo en el ejemplo.
    alturas: [190, 185, 185, null],
  },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = PgTransaction<any, any, any>;

export type ResumenEjemplo = {
  lineas: number;
  modelos: number;
  racks: number;
  posiciones: number;
  bultos: number;
  mezclados: number;
  sinUbicar: number;
  movimientos: number;
  chequeos: number;
};

export async function cargarDatosDeEjemplo(
  tx: Tx,
  usuario: { id: number; nombre: string },
): Promise<ResumenEjemplo> {
  const rnd = azar(20260922);
  const resumen: ResumenEjemplo = {
    lineas: 0,
    modelos: 0,
    racks: 0,
    posiciones: 0,
    bultos: 0,
    mezclados: 0,
    sinUbicar: 0,
    movimientos: 0,
    chequeos: 0,
  };

  /* Líneas, modelos y normas ------------------------------------------------ */

  const modelosCreados: Array<{
    id: number;
    nombre: string;
    lineaCodigo: string;
    normas: Partial<Record<Packaging, number>>;
    alturas: Partial<Record<Packaging, number | null>>;
  }> = [];

  for (const [i, l] of CATALOGO.entries()) {
    const [linea] = await tx
      .insert(lineas)
      .values({
        codigo: l.codigo,
        nombre: l.nombre,
        unidadSingular: l.unidadSingular,
        unidadPlural: l.unidadPlural,
        activa: l.activa,
        orden: i,
      })
      .returning({ id: lineas.id });
    resumen.lineas++;

    for (const [j, m] of l.modelos.entries()) {
      const [modelo] = await tx
        .insert(modelos)
        .values({ lineaId: linea.id, nombre: m.nombre, orden: j })
        .returning({ id: modelos.id });
      resumen.modelos++;

      const suyas: Partial<Record<Packaging, number>> = {};
      const alturas: Partial<Record<Packaging, number | null>> = {};
      // Sin fila = sin norma. El suelto nunca lleva una: el sistema no opina
      // sobre cuánto producto suelto hay arriba de un palet de madera, ni
      // sobre cuánto mide.
      if (m.palet != null) {
        suyas.palet = m.palet;
        alturas.palet = m.altoPalet;
      }
      if (m.optimizado != null) {
        suyas.optimizado = m.optimizado;
        alturas.optimizado = m.altoOptimizado;
      }

      for (const [packaging, cantidad] of Object.entries(suyas)) {
        await tx.insert(normas).values({
          modeloId: modelo.id,
          packaging: packaging as Packaging,
          cantidad,
          alturaCm: alturas[packaging as Packaging] ?? null,
        });
      }

      modelosCreados.push({
        id: modelo.id,
        nombre: m.nombre,
        lineaCodigo: l.codigo,
        normas: suyas,
        alturas,
      });
    }
  }

  /* Grupos, niveles y posiciones ------------------------------------------- */

  const posicionesCreadas: Array<{
    id: number;
    codigo: string;
    nivel: number;
    profundidad: number | null;
    alturaMaxCm: number | null;
    /** Los bultos que quedaron acá, con desde cuándo. Ver el bloque de chequeos. */
    bultos: Array<{ id: number; desde: Date }>;
  }> = [];

  for (const [i, g] of GRUPOS.entries()) {
    const [grupo] = await tx
      .insert(grupos)
      .values({
        codigo: g.codigo,
        nombre: g.nombre,
        accesibilidad: g.geometria.tipo,
        ancho: g.geometria.ancho,
        niveles: g.geometria.niveles,
        profundidad: g.geometria.profundidad,
        unidades: g.geometria.unidades,
        orden: i,
      })
      .returning({ id: grupos.id });
    resumen.racks++;

    for (let n = 1; n <= g.geometria.niveles; n++) {
      await tx.insert(nivelesDeGrupo).values({
        grupoId: grupo.id,
        nivel: n,
        alturaMaxCm: g.alturas[n - 1] ?? null,
      });
    }

    for (const [orden, c] of posicionesDe(g.geometria).entries()) {
      const codigo = codigoDePosicion(c);
      const [pos] = await tx
        .insert(posiciones)
        .values({
          grupoId: grupo.id,
          codigo,
          unidad: c.unidad,
          columna: c.columna,
          nivel: c.nivel,
          profundidad: c.profundidad,
          orden,
        })
        .returning({ id: posiciones.id });
      resumen.posiciones++;
      posicionesCreadas.push({
        id: pos.id,
        codigo: `${g.codigo}-${codigo}`,
        nivel: c.nivel,
        profundidad: c.profundidad,
        alturaMaxCm: g.alturas[c.nivel - 1] ?? null,
        bultos: [],
      });
    }
  }

  /* Bultos, con sus movimientos -------------------------------------------- */

  const conModelo = modelosCreados.filter((m) => m.normas.palet != null);
  let numero = 0;

  /**
   * Una posición aloja UN bulto. Antes el ejemplo metía varios por carril y la
   * profundidad era del bulto; ahora cada slot es una posición con dirección
   * propia y esto es un solo recorrido.
   */
  for (const pos of posicionesCreadas) {
    if (rnd() > 0.55) continue;

    /**
     * Uno de cada quince es MEZCLADO: dos modelos de la misma línea en el
     * mismo bulto. Se arma poco -para completar un pedido- pero se arma, y
     * nunca es normalizado: la norma es de un modelo y un packaging, así que
     * un mezclado no tiene contra qué compararse y va siempre como suelto.
     */
    const mezclado = rnd() < 0.05;
    const primero = conModelo[Math.floor(rnd() * conModelo.length)];

    const dado = rnd();
    const packaging: Packaging = mezclado
      ? "suelto"
      : dado < 0.2
        ? "suelto"
        : dado < 0.75
          ? "palet"
          : "optimizado";

    const contenido: Array<{ modeloId: number; nombre: string; cantidad: number }> = [];

    if (mezclado) {
      // El segundo modelo sale de la misma línea: mezclar placas con piedras
      // no pasa, son dos depósitos distintos en la cabeza del operario.
      const hermanos = conModelo.filter(
        (m) => m.lineaCodigo === primero.lineaCodigo && m.id !== primero.id,
      );
      const segundo = hermanos[Math.floor(rnd() * hermanos.length)] ?? primero;
      contenido.push({
        modeloId: primero.id,
        nombre: primero.nombre,
        cantidad: 8 + Math.floor(rnd() * 20),
      });
      if (segundo.id !== primero.id) {
        contenido.push({
          modeloId: segundo.id,
          nombre: segundo.nombre,
          cantidad: 5 + Math.floor(rnd() * 15),
        });
      }
    } else {
      const norma = primero.normas[packaging] ?? null;
      let cantidad: number;
      if (packaging === "suelto") {
        cantidad = 3 + Math.floor(rnd() * 25);
      } else if (norma != null && rnd() < 0.12) {
        // Una de cada ocho fuera de norma: existen, y la pantalla las tiene
        // que marcar.
        cantidad = Math.max(1, norma - (1 + Math.floor(rnd() * 6)));
      } else {
        cantidad = norma ?? 1;
      }
      contenido.push({ modeloId: primero.id, nombre: primero.nombre, cantidad });
    }

    // Las mismas reglas que valida la pantalla de mover. Si el ejemplo pudiera
    // generar algo que la app rechazaría, el ejemplo miente.
    const problema = validarComposicion(packaging, contenido);
    if (problema) throw new Error(`Ejemplo inválido: ${problema}`);

    const alto = packaging === "suelto" ? null : (primero.alturas[packaging] ?? null);
    if (alto != null && pos.alturaMaxCm != null && alto > pos.alturaMaxCm) continue;

    const cantidad = total(contenido);
    numero++;
    const codigo = `P-${String(numero).padStart(5, "0")}`;
    const creado = haceDias(5 + rnd() * 55);
    const subido = new Date(creado.getTime() + 20 * 60 * 1000);

    const [bulto] = await tx
      .insert(bultos)
      .values({
        codigo,
        packaging,
        cantidad,
        estado: "ubicado",
        posicionId: pos.id,
        creadoEn: creado,
        creadoPor: usuario.id,
        vistoEn: subido,
      })
      .returning({ id: bultos.id });
    resumen.bultos++;
    if (esMezclado(contenido)) resumen.mezclados++;
    pos.bultos.push({ id: bulto.id, desde: subido });

    await tx.insert(bultoContenido).values(
      contenido.map((l) => ({
        bultoId: bulto.id,
        modeloId: l.modeloId,
        cantidad: l.cantidad,
      })),
    );

    const [mov] = await tx
      .insert(movimientos)
      .values({
        bultoId: bulto.id,
        bultoCodigo: codigo,
        lineaCodigo: primero.lineaCodigo,
        tipo: "meter",
        cantidadAntes: 0,
        cantidad,
        packaging,
        posicionHastaId: pos.id,
        posicionHastaCodigo: pos.codigo,
        usuarioId: usuario.id,
        usuarioNombre: usuario.nombre,
        creadoEn: subido,
      })
      .returning({ id: movimientos.id });
    resumen.movimientos++;

    await tx.insert(movimientoLineas).values(
      contenido.map((l) => ({
        movimientoId: mov.id,
        modeloId: l.modeloId,
        modeloNombre: l.nombre,
        cantidadAntes: 0,
        cantidad: l.cantidad,
      })),
    );
  }

  /* Bultos sin ubicar: el limbo ------------------------------------------- */

  /**
   * Dos bultos que entraron al rack pero no tienen lugar asignado.
   *
   * Están en el ejemplo porque es un caso real y no un borde raro: las
   * posiciones previstas para ese producto se llenan, o hay lugar pero está
   * reservado para otra cosa, y el palet no puede dejar de existir solo porque
   * no hay dónde ponerlo. Son stock y se cuentan.
   *
   * Nunca van a tener chequeo -no hay posición que verificar- así que aparecen
   * siempre como "sin chequear". Eso es correcto y es a propósito: el limbo
   * tiene que incomodar.
   */
  for (let i = 0; i < 2; i++) {
    const modelo = conModelo[Math.floor(rnd() * conModelo.length)];
    const cantidad = modelo.normas.palet ?? 1;
    numero++;
    const codigo = `P-${String(numero).padStart(5, "0")}`;
    const creado = haceDias(1 + rnd() * 6);

    const [bulto] = await tx
      .insert(bultos)
      .values({
        codigo,
        packaging: "palet",
        cantidad,
        estado: "sin_ubicar",
        creadoEn: creado,
        creadoPor: usuario.id,
        vistoEn: creado,
      })
      .returning({ id: bultos.id });
    resumen.bultos++;
    resumen.sinUbicar++;

    await tx
      .insert(bultoContenido)
      .values({ bultoId: bulto.id, modeloId: modelo.id, cantidad });

    const [mov] = await tx
      .insert(movimientos)
      .values({
        bultoId: bulto.id,
        bultoCodigo: codigo,
        lineaCodigo: modelo.lineaCodigo,
        tipo: "meter",
        cantidadAntes: 0,
        cantidad,
        packaging: "palet",
        nota: "Sin lugar disponible al momento de entrar",
        usuarioId: usuario.id,
        usuarioNombre: usuario.nombre,
        creadoEn: creado,
      })
      .returning({ id: movimientos.id });
    resumen.movimientos++;

    await tx.insert(movimientoLineas).values({
      movimientoId: mov.id,
      modeloId: modelo.id,
      modeloNombre: modelo.nombre,
      cantidadAntes: 0,
      cantidad,
    });
  }

  /* Chequeos ---------------------------------------------------------------- */

  /**
   * La mezcla que importa. Un tercio de las posiciones queda SIN chequear nunca,
   * y esas no valen cero: son la pregunta que todavía no se hizo, y el índice las
   * muestra aparte.
   */
  const edades = [1, 2, 4, 9, 15, 28, 35, 44, 61, 70];

  for (const pos of posicionesCreadas) {
    if (rnd() < 0.34) continue;

    const cuantos = 1 + Math.floor(rnd() * 3);
    let ok = 0;
    let ultima: Date | null = null;
    const fechas: Array<{ cuando: Date; bien: boolean }> = [];

    for (let i = 0; i < cuantos; i++) {
      const edad = edades[Math.floor(rnd() * edades.length)] + i * 12;
      const cuando = haceDias(edad);
      // Una de cada seis encuentra un error: son las posiciones que el índice
      // tiene que castigar aunque se hayan chequeado ayer.
      const fallo = rnd() < 0.17;
      const resultado = fallo ? "corregido" : "ok";
      if (!fallo) ok++;
      fechas.push({ cuando, bien: !fallo });

      await tx.insert(chequeos).values({
        posicionId: pos.id,
        posicionCodigo: pos.codigo,
        resultado,
        usuarioId: usuario.id,
        usuarioNombre: usuario.nombre,
        nota: fallo ? "Diferencia corregida en la recorrida" : null,
        creadoEn: cuando,
      });
      resumen.chequeos++;

      if (!ultima || cuando > ultima) ultima = cuando;
    }

    await tx
      .update(posiciones)
      .set({ chequeadoEn: ultima, chequeosOk: ok, chequeosTotal: cuantos })
      .where(eq(posiciones.id, pos.id));

    /**
     * Un chequeo solo cubre a los bultos que YA ESTABAN ahí cuando se hizo.
     *
     * Si el bulto llegó después, ese chequeo no dice nada sobre él: nadie
     * verificó que esté donde el sistema dice. Sin este filtro, un bulto subido
     * hoy a una posición chequeada el mes pasado se vería verde, que es
     * exactamente al revés de la verdad.
     */
    for (const b of pos.bultos) {
      const suyos = fechas.filter((f) => f.cuando >= b.desde);
      if (suyos.length === 0) continue;
      await tx
        .update(bultos)
        .set({
          chequeadoEn: suyos.reduce(
            (max, f) => (f.cuando > max ? f.cuando : max),
            suyos[0].cuando,
          ),
          chequeosOk: suyos.filter((f) => f.bien).length,
          chequeosTotal: suyos.length,
        })
        .where(eq(bultos.id, b.id));
    }
  }

  return resumen;
}
