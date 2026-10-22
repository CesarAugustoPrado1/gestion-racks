import { z } from "zod";

/**
 * El plano de la planta: un dibujo editable de la fábrica, en METROS.
 *
 * Módulo PURO: lo usan el editor (en el navegador), la vista y el servidor al
 * guardar, con las mismas reglas.
 *
 * El plano es UN documento -el espacio de trabajo y una lista de elementos- y
 * se guarda entero en cada versión. Un dibujo se edita como un todo: guardar
 * elemento por elemento haría que dos personas editando a la vez dejaran un
 * plano que no dibujó ninguna de las dos.
 *
 * Coordenadas: x hacia la derecha, y hacia ABAJO (como en la pantalla), con el
 * (0,0) en la esquina de arriba a la izquierda del espacio de trabajo.
 */

export type Punto = [number, number];

export const TIPOS = ["limite", "techado", "rack", "calle", "acceso", "frente"] as const;
export type TipoElemento = (typeof TIPOS)[number];

export const ETIQUETA_TIPO: Record<TipoElemento, string> = {
  limite: "Límite de la fábrica",
  techado: "Zona techada",
  rack: "Rack",
  calle: "Calle de tránsito",
  acceso: "Acceso",
  frente: "Frente",
};

export type ElementoBase = { id: string; etiqueta?: string };

export type Elemento =
  /** Polígono cerrado: el borde del predio. */
  | (ElementoBase & { tipo: "limite"; puntos: Punto[] })
  /** Polígono cerrado: lo que está bajo techo. */
  | (ElementoBase & { tipo: "techado"; puntos: Punto[] })
  /**
   * Un rectángulo: el lugar que ocupa un grupo de racks. `x, y` es la esquina
   * de arriba a la izquierda ANTES de rotar; rota alrededor de su centro.
   */
  | (ElementoBase & {
      tipo: "rack";
      x: number;
      y: number;
      ancho: number;
      largo: number;
      rotacion: 0 | 90 | 180 | 270;
      grupoId: number | null;
    })
  /** Polilínea con un ancho: por donde circula el clark. */
  | (ElementoBase & { tipo: "calle"; puntos: Punto[]; ancho: number })
  /** Un segmento: un portón o una puerta. */
  | (ElementoBase & { tipo: "acceso"; puntos: Punto[] })
  /** Un segmento: la calle por donde se entra a la fábrica. */
  | (ElementoBase & { tipo: "frente"; puntos: Punto[] });

export type Plano = {
  /** El espacio de trabajo, en metros. */
  ancho: number;
  largo: number;
  elementos: Elemento[];
};

export const PLANO_VACIO: Plano = { ancho: 100, largo: 60, elementos: [] };

/** Cuántos puntos necesita cada tipo de trazo para estar completo. */
export const MINIMO_DE_PUNTOS: Record<Exclude<TipoElemento, "rack">, number> = {
  limite: 3,
  techado: 3,
  calle: 2,
  acceso: 2,
  frente: 2,
};

/** Los que se cierran solos al terminar: el último punto se une con el primero. */
export const esPoligono = (t: TipoElemento) => t === "limite" || t === "techado";
/** Los que se dibujan con exactamente dos puntos. */
export const esSegmento = (t: TipoElemento) => t === "acceso" || t === "frente";

/* -------------------------------------------------------------------------- */
/* Validación                                                                 */
/* -------------------------------------------------------------------------- */

const metros = z.number().finite();
const punto = z.tuple([metros, metros]);
const etiqueta = z.string().trim().max(60).optional();
const id = z.string().min(1).max(40);

const esquemaElemento = z.discriminatedUnion("tipo", [
  z.object({ id, etiqueta, tipo: z.literal("limite"), puntos: z.array(punto).min(3).max(200) }),
  z.object({ id, etiqueta, tipo: z.literal("techado"), puntos: z.array(punto).min(3).max(200) }),
  z.object({
    id,
    etiqueta,
    tipo: z.literal("rack"),
    x: metros,
    y: metros,
    ancho: z.number().min(0.5).max(300),
    largo: z.number().min(0.5).max(300),
    rotacion: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
    grupoId: z.number().int().positive().nullable(),
  }),
  z.object({
    id,
    etiqueta,
    tipo: z.literal("calle"),
    puntos: z.array(punto).min(2).max(200),
    ancho: z.number().min(1).max(30),
  }),
  z.object({ id, etiqueta, tipo: z.literal("acceso"), puntos: z.array(punto).length(2) }),
  z.object({ id, etiqueta, tipo: z.literal("frente"), puntos: z.array(punto).length(2) }),
]);

export const esquemaPlano = z.object({
  ancho: z.number().min(10, "El espacio de trabajo tiene que medir al menos 10 m.").max(2000),
  largo: z.number().min(10, "El espacio de trabajo tiene que medir al menos 10 m.").max(2000),
  elementos: z.array(esquemaElemento).max(2000, "Demasiados elementos en el plano."),
});

/**
 * Lo que el esquema no puede decir solo: que todo quede DENTRO del espacio de
 * trabajo, que los ids no se repitan y que un grupo de racks no esté dibujado
 * dos veces. Devuelve el primer problema, en palabras, o null.
 */
export function problemaDelPlano(p: Plano): string | null {
  const ids = new Set<string>();
  const grupos = new Set<number>();
  const fuera = (x: number, y: number) => x < 0 || y < 0 || x > p.ancho || y > p.largo;

  for (const e of p.elementos) {
    if (ids.has(e.id)) return "Hay dos elementos con el mismo identificador.";
    ids.add(e.id);
    const nombre = e.etiqueta || ETIQUETA_TIPO[e.tipo].toLowerCase();

    if (e.tipo === "rack") {
      if (e.grupoId != null) {
        if (grupos.has(e.grupoId)) return "Un grupo de racks está dibujado dos veces.";
        grupos.add(e.grupoId);
      }
      if (esquinasDeRack(e).some(([x, y]) => fuera(x, y))) {
        return `El rack ${nombre} se sale del espacio de trabajo.`;
      }
    } else if (e.puntos.some(([x, y]) => fuera(x, y))) {
      return `${nombre[0].toUpperCase()}${nombre.slice(1)} se sale del espacio de trabajo.`;
    }
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Geometría                                                                  */
/* -------------------------------------------------------------------------- */

/** Redondea a la grilla. 0,5 m alcanza para dibujar una planta y no molesta. */
export const GRILLA = 0.5;
export const aGrilla = (v: number, paso = GRILLA) => Math.round(v / paso) * paso;

/** Las cuatro esquinas de un rack, ya rotado, en el orden del contorno. */
export function esquinasDeRack(r: { x: number; y: number; ancho: number; largo: number; rotacion: number }): Punto[] {
  const cx = r.x + r.ancho / 2;
  const cy = r.y + r.largo / 2;
  const girado = r.rotacion === 90 || r.rotacion === 270;
  const w = girado ? r.largo : r.ancho;
  const h = girado ? r.ancho : r.largo;
  return [
    [cx - w / 2, cy - h / 2],
    [cx + w / 2, cy - h / 2],
    [cx + w / 2, cy + h / 2],
    [cx - w / 2, cy + h / 2],
  ];
}

/** Mueve un elemento entero. */
export function mover(e: Elemento, dx: number, dy: number): Elemento {
  if (e.tipo === "rack") return { ...e, x: e.x + dx, y: e.y + dy };
  return { ...e, puntos: e.puntos.map(([x, y]) => [x + dx, y + dy] as Punto) };
}

/** Mueve un vértice de un trazo. */
export function moverVertice(e: Elemento, indice: number, a: Punto): Elemento {
  if (e.tipo === "rack") return e;
  return { ...e, puntos: e.puntos.map((p, i) => (i === indice ? a : p)) };
}

/** Gira un rack 90° a la derecha, sin moverle el centro. */
export function girar(e: Elemento): Elemento {
  if (e.tipo !== "rack") return e;
  return { ...e, rotacion: (((e.rotacion + 90) % 360) as 0 | 90 | 180 | 270) };
}

/** Largo total de una polilínea, en metros. */
export function largo(puntos: Punto[], cerrado = false): number {
  let total = 0;
  const n = puntos.length;
  for (let i = 0; i < n - (cerrado ? 0 : 1); i++) {
    const [a, b] = [puntos[i], puntos[(i + 1) % n]];
    total += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return total;
}

/** Superficie de un polígono, en m². */
export function superficie(puntos: Punto[]): number {
  let s = 0;
  for (let i = 0; i < puntos.length; i++) {
    const [x1, y1] = puntos[i];
    const [x2, y2] = puntos[(i + 1) % puntos.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

/** Un id corto y suficiente para distinguir elementos dentro de un plano. */
export function nuevoId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Formato de metros para pantalla: "12,5 m". */
export const m = (v: number) => `${(Math.round(v * 10) / 10).toLocaleString("es-AR")} m`;
