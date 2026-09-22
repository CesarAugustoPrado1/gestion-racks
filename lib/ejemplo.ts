import "server-only";
import { eq } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  bultos,
  chequeos,
  lineas,
  modelos,
  motivos,
  movimientos,
  normas,
  posiciones,
  racks,
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
      { nombre: "Standard 9.5", palet: 72, optimizado: 90 },
      { nombre: "Standard 12.5", palet: 60, optimizado: 75 },
      { nombre: "RH 12.5", palet: 60, optimizado: 75 },
    ],
  },
  {
    codigo: "piedras",
    nombre: "Piedras",
    unidadSingular: "paquete",
    unidadPlural: "paquetes",
    activa: true,
    modelos: [
      { nombre: "Laja", palet: 48, optimizado: 60 },
      { nombre: "Patagónica", palet: 40, optimizado: 52 },
      { nombre: "Ekos", palet: 36, optimizado: 45 },
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

const RACKS: Array<{
  codigo: string;
  nombre: string;
  accesibilidad: "selectivo" | "penetrable";
  posiciones: number;
  profundidad: number | null;
}> = [
  { codigo: "A", nombre: "Rack A", accesibilidad: "selectivo", posiciones: 12, profundidad: null },
  { codigo: "B", nombre: "Rack B", accesibilidad: "selectivo", posiciones: 12, profundidad: null },
  {
    codigo: "C",
    nombre: "Rack C (drive-in)",
    accesibilidad: "penetrable",
    posiciones: 4,
    profundidad: 3,
  },
];

const MOTIVOS: Array<{ nombre: string; ambito: "ajuste" | "entrega" | "reempaque" }> = [
  { nombre: "Cantidad distinta a la registrada", ambito: "ajuste" },
  { nombre: "Bulto en otra posición", ambito: "ajuste" },
  { nombre: "Modelo equivocado", ambito: "ajuste" },
  { nombre: "Posición vacía en el sistema", ambito: "ajuste" },
  { nombre: "Venta", ambito: "entrega" },
  { nombre: "Muestra", ambito: "entrega" },
  { nombre: "Armado de palet", ambito: "reempaque" },
  { nombre: "Desarmado para pedido", ambito: "reempaque" },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = PgTransaction<any, any, any>;

export type ResumenEjemplo = {
  lineas: number;
  modelos: number;
  racks: number;
  posiciones: number;
  bultos: number;
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
    movimientos: 0,
    chequeos: 0,
  };

  /* Líneas, modelos y normas ------------------------------------------------ */

  const modelosCreados: Array<{
    id: number;
    nombre: string;
    lineaCodigo: string;
    normas: Partial<Record<Packaging, number>>;
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
      // Sin fila = sin norma. El suelto nunca lleva una: el sistema no opina
      // sobre cuánto producto suelto hay arriba de un palet de madera.
      if (m.palet != null) suyas.palet = m.palet;
      if (m.optimizado != null) suyas.optimizado = m.optimizado;

      for (const [packaging, cantidad] of Object.entries(suyas)) {
        await tx.insert(normas).values({
          modeloId: modelo.id,
          packaging: packaging as Packaging,
          cantidad,
        });
      }

      modelosCreados.push({
        id: modelo.id,
        nombre: m.nombre,
        lineaCodigo: l.codigo,
        normas: suyas,
      });
    }
  }

  /* Racks y posiciones ------------------------------------------------------ */

  const posicionesCreadas: Array<{
    id: number;
    codigo: string;
    profundidad: number | null;
  }> = [];

  for (const [i, r] of RACKS.entries()) {
    const [rack] = await tx
      .insert(racks)
      .values({
        codigo: r.codigo,
        nombre: r.nombre,
        accesibilidad: r.accesibilidad,
        orden: i,
      })
      .returning({ id: racks.id });
    resumen.racks++;

    for (let n = 1; n <= r.posiciones; n++) {
      const [pos] = await tx
        .insert(posiciones)
        .values({
          rackId: rack.id,
          codigo: String(n),
          profundidad: r.profundidad,
          capacidadBultos: r.profundidad ?? 1,
          orden: n,
        })
        .returning({ id: posiciones.id });
      resumen.posiciones++;
      posicionesCreadas.push({
        id: pos.id,
        codigo: `${r.codigo}-${n}`,
        profundidad: r.profundidad,
      });
    }
  }

  /* Motivos ----------------------------------------------------------------- */

  const motivosCreados: Array<{ id: number; nombre: string; ambito: string }> = [];
  for (const m of MOTIVOS) {
    const [fila] = await tx
      .insert(motivos)
      .values(m)
      .returning({ id: motivos.id });
    motivosCreados.push({ id: fila.id, nombre: m.nombre, ambito: m.ambito });
  }

  /* Bultos, con sus movimientos -------------------------------------------- */

  const conModelo = modelosCreados.filter((m) => m.normas.palet != null);
  const libres = [...posicionesCreadas];
  let numero = 0;

  /** Cuántos bultos ocupan cada posición: el penetrable lleva más de uno. */
  const aOcupar = libres.filter(() => rnd() < 0.62);

  for (const pos of aOcupar) {
    const cuantos = pos.profundidad ? 1 + Math.floor(rnd() * pos.profundidad) : 1;

    for (let k = 0; k < cuantos; k++) {
      const modelo = conModelo[Math.floor(rnd() * conModelo.length)];

      // Dos de cada diez bultos son producto suelto: sin norma y con cantidad
      // libre, que es el caso que rompe cualquier cuenta hecha a ojo.
      const dado = rnd();
      const packaging: Packaging =
        dado < 0.2 ? "suelto" : dado < 0.75 ? "palet" : "optimizado";

      const norma = modelo.normas[packaging] ?? null;
      let cantidad: number;
      if (packaging === "suelto") {
        cantidad = 3 + Math.floor(rnd() * 25);
      } else if (norma != null && rnd() < 0.12) {
        // Una de cada ocho fuera de norma: existen, y la pantalla las tiene que
        // marcar.
        cantidad = Math.max(1, norma - (1 + Math.floor(rnd() * 6)));
      } else {
        cantidad = norma ?? 1;
      }

      numero++;
      const codigo = `P-${String(numero).padStart(5, "0")}`;
      const creado = haceDias(5 + rnd() * 55);
      const subido = new Date(creado.getTime() + 20 * 60 * 1000);

      const [bulto] = await tx
        .insert(bultos)
        .values({
          codigo,
          modeloId: modelo.id,
          packaging,
          cantidad,
          estado: "en_rack",
          posicionId: pos.id,
          profundidad: pos.profundidad ? k + 1 : null,
          creadoEn: creado,
          creadoPor: usuario.id,
          vistoEn: subido,
        })
        .returning({ id: bultos.id });
      resumen.bultos++;

      const comun = {
        bultoId: bulto.id,
        bultoCodigo: codigo,
        modeloId: modelo.id,
        modeloNombre: modelo.nombre,
        lineaCodigo: modelo.lineaCodigo,
        packaging,
        cantidad,
        usuarioId: usuario.id,
        usuarioNombre: usuario.nombre,
      };

      await tx.insert(movimientos).values([
        { ...comun, tipo: "alta" as const, creadoEn: creado },
        {
          ...comun,
          tipo: "subir" as const,
          posicionHastaId: pos.id,
          posicionHastaCodigo: pos.codigo,
          creadoEn: subido,
        },
      ]);
      resumen.movimientos += 2;
    }
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

    for (let i = 0; i < cuantos; i++) {
      const edad = edades[Math.floor(rnd() * edades.length)] + i * 12;
      const cuando = haceDias(edad);
      // Una de cada seis encuentra un error: son las posiciones que el índice
      // tiene que castigar aunque se hayan chequeado ayer.
      const fallo = rnd() < 0.17;
      const resultado = fallo ? "corregido" : "ok";
      if (!fallo) ok++;

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
  }

  return resumen;
}
