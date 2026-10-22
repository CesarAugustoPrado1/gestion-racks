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

/* -------------------------------------------------------------------------- */
/* Estilos                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Cómo se ve un elemento. Todos los campos son opcionales: lo que no se dice
 * sale de la regla del tipo (`Plano.estilos`) y, si tampoco está, del estilo
 * de fábrica (`ESTILO_DE_FABRICA`). Ver `estiloDe`.
 *
 * Colores: "#rrggbb", o "ninguno" para no pintar. El relleno de un rack puede
 * ser además "ocupacion": el color de la app, más intenso cuanto más lleno.
 *
 * En una CALLE el relleno es la franja de la calle y el trazo, la línea del
 * medio. En un acceso o el frente, que son líneas, solo hay trazo.
 */
export type TipoTrazo = "continuo" | "guiones" | "puntos";
export type Estilo = {
  relleno?: string;
  /** 0 a 100. */
  opacidad?: number;
  trazo?: string;
  tipoTrazo?: TipoTrazo;
  /** 0,5 a 20, en una unidad relativa al tamaño del plano. */
  grosor?: number;
};
export type EstiloResuelto = Required<Estilo>;

export const TIPOS_DE_TRAZO: Record<TipoTrazo, string> = {
  continuo: "Continuo",
  guiones: "Guiones",
  puntos: "Puntos",
};

/** Los que no tienen superficie: el relleno no aplica. */
export const sinRelleno = (t: TipoElemento) => t === "acceso" || t === "frente";

/**
 * Cómo se ve cada tipo si nadie dijo nada. Es lo que se veía antes de que
 * hubiera estilos, para que un plano viejo no cambie al actualizar.
 */
export const ESTILO_DE_FABRICA: Record<TipoElemento, EstiloResuelto> = {
  limite: { relleno: "ninguno", opacidad: 100, trazo: "#0f172a", tipoTrazo: "continuo", grosor: 6 },
  techado: { relleno: "#f1f5f9", opacidad: 100, trazo: "#94a3b8", tipoTrazo: "guiones", grosor: 2.5 },
  rack: { relleno: "ocupacion", opacidad: 100, trazo: "#2a78d6", tipoTrazo: "continuo", grosor: 3 },
  calle: { relleno: "#cbd5e1", opacidad: 100, trazo: "#ffffff", tipoTrazo: "guiones", grosor: 2.5 },
  acceso: { relleno: "ninguno", opacidad: 100, trazo: "#059669", tipoTrazo: "continuo", grosor: 9 },
  frente: { relleno: "ninguno", opacidad: 100, trazo: "#0f172a", tipoTrazo: "guiones", grosor: 12 },
};

/** La tipografía del plano entero. */
export type Fuente = "sans" | "serif" | "mono" | "angosta";
export type Tipografia = {
  fuente: Fuente;
  /** Porcentaje: 100 es el tamaño normal. */
  tamano: number;
  /** "#rrggbb" para todos los textos, o sin dato: cada texto con su color. */
  color?: string;
};
export const TIPOGRAFIA_DE_FABRICA: Tipografia = { fuente: "sans", tamano: 100 };

export const FUENTES: Record<Fuente, { etiqueta: string; css: string }> = {
  sans: { etiqueta: "Sin serifa", css: "Inter, ui-sans-serif, system-ui, sans-serif" },
  serif: { etiqueta: "Con serifa", css: "ui-serif, Georgia, 'Times New Roman', serif" },
  mono: { etiqueta: "Monoespaciada", css: "ui-monospace, 'SFMono-Regular', Menlo, monospace" },
  angosta: { etiqueta: "Angosta", css: "'Arial Narrow', 'Roboto Condensed', ui-sans-serif, sans-serif" },
};

/**
 * El estilo que vale para un elemento: fábrica, después la regla del tipo,
 * después lo propio del elemento. Cada campo por separado: un elemento puede
 * cambiar solo el color del trazo y heredar todo lo demás.
 */
export function estiloDe(e: Elemento, p: Pick<Plano, "estilos">): EstiloResuelto {
  const limpio = (x?: Estilo) =>
    Object.fromEntries(Object.entries(x ?? {}).filter(([, v]) => v !== undefined)) as Estilo;
  return { ...ESTILO_DE_FABRICA[e.tipo], ...limpio(p.estilos?.[e.tipo]), ...limpio(e.estilo) };
}

export function estiloDelTipo(t: TipoElemento, p: Pick<Plano, "estilos">): EstiloResuelto {
  return estiloDe({ id: "", tipo: t } as Elemento, p);
}

export function tipografiaDe(p: Pick<Plano, "texto">): Tipografia {
  return { ...TIPOGRAFIA_DE_FABRICA, ...(p.texto ?? {}) };
}

export type ElementoBase = { id: string; etiqueta?: string; estilo?: Estilo };

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
  /**
   * Los ejes de referencia para cargar por medidas: dónde está el (0,0),
   * medido desde la esquina de ABAJO A LA IZQUIERDA del espacio de trabajo.
   * Sin dato, es esa misma esquina. Ver `aUsuario`.
   */
  origen?: { x: number; y: number };
  /** Las reglas de estilo por tipo. Ver `estiloDe`. */
  estilos?: Partial<Record<TipoElemento, Estilo>>;
  /** La tipografía de todo el plano. */
  texto?: Tipografia;
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
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Un color tiene que ser #rrggbb.");
const esquemaEstilo = z
  .object({
    relleno: z.union([color, z.literal("ninguno"), z.literal("ocupacion")]).optional(),
    opacidad: z.number().min(0).max(100).optional(),
    trazo: z.union([color, z.literal("ninguno")]).optional(),
    tipoTrazo: z.enum(["continuo", "guiones", "puntos"]).optional(),
    grosor: z.number().min(0.5).max(20).optional(),
  })
  .strict();
const estilo = esquemaEstilo.optional();

const esquemaElemento = z.discriminatedUnion("tipo", [
  z.object({ id, etiqueta, estilo, tipo: z.literal("limite"), puntos: z.array(punto).min(3).max(200) }),
  z.object({ id, etiqueta, estilo, tipo: z.literal("techado"), puntos: z.array(punto).min(3).max(200) }),
  z.object({
    id,
    etiqueta,
    estilo,
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
    estilo,
    tipo: z.literal("calle"),
    puntos: z.array(punto).min(2).max(200),
    ancho: z.number().min(1).max(30),
  }),
  z.object({ id, etiqueta, estilo, tipo: z.literal("acceso"), puntos: z.array(punto).length(2) }),
  z.object({ id, etiqueta, estilo, tipo: z.literal("frente"), puntos: z.array(punto).length(2) }),
]);

export const esquemaPlano = z.object({
  ancho: z.number().min(10, "El espacio de trabajo tiene que medir al menos 10 m.").max(2000),
  largo: z.number().min(10, "El espacio de trabajo tiene que medir al menos 10 m.").max(2000),
  origen: z.object({ x: metros, y: metros }).optional(),
  estilos: z.record(z.enum(TIPOS), esquemaEstilo).optional(),
  texto: z
    .object({
      fuente: z.enum(["sans", "serif", "mono", "angosta"]),
      tamano: z.number().min(40).max(300),
      color: color.optional(),
    })
    .optional(),
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

/* -------------------------------------------------------------------------- */
/* Ejes de referencia: las coordenadas que ve el usuario                       */
/* -------------------------------------------------------------------------- */

/**
 * Por dentro el plano usa coordenadas de pantalla: (0,0) arriba a la izquierda
 * e Y hacia ABAJO. Para cargar medidas eso es antinatural, así que el usuario
 * trabaja con ejes de plano de obra: X hacia la derecha, Y hacia ARRIBA, con el
 * (0,0) en `origen` (por defecto, la esquina de abajo a la izquierda).
 *
 * Toda conversión pasa por estas dos funciones; nada más hace la cuenta.
 */
export function origenDe(p: Pick<Plano, "origen">): { x: number; y: number } {
  return p.origen ?? { x: 0, y: 0 };
}

export function aUsuario([x, y]: Punto, p: Pick<Plano, "largo" | "origen">): Punto {
  const o = origenDe(p);
  return [x - o.x, p.largo - y - o.y];
}

export function deUsuario([u, v]: Punto, p: Pick<Plano, "largo" | "origen">): Punto {
  const o = origenDe(p);
  return [u + o.x, p.largo - (v + o.y)];
}

/**
 * Un rectángulo alineado a los ejes, en coordenadas de usuario: `x, y` es la
 * esquina de ABAJO A LA IZQUIERDA, `ancho` va en X y `alto` en Y. Para un
 * segmento (acceso, frente) una de las dos medidas es 0.
 */
export type RectUsuario = { x: number; y: number; ancho: number; alto: number };

const casi = (a: number, b: number) => Math.abs(a - b) < 1e-6;

/** Las cuatro esquinas, en coordenadas internas, en el orden del contorno. */
export function esquinasDeRect(r: RectUsuario, p: Pick<Plano, "largo" | "origen">): Punto[] {
  return [
    deUsuario([r.x, r.y + r.alto], p),
    deUsuario([r.x + r.ancho, r.y + r.alto], p),
    deUsuario([r.x + r.ancho, r.y], p),
    deUsuario([r.x, r.y], p),
  ];
}

function rectDePuntos(ps: Punto[], p: Pick<Plano, "largo" | "origen">): RectUsuario {
  const us = ps.map((q) => aUsuario(q, p));
  const xs = us.map((q) => q[0]);
  const ys = us.map((q) => q[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, ancho: Math.max(...xs) - x, alto: Math.max(...ys) - y };
}

/** Si un polígono es un rectángulo alineado a los ejes. */
export function esRectangulo(ps: Punto[]): boolean {
  if (ps.length !== 4) return false;
  const xs = new Set(ps.map((q) => Math.round(q[0] * 1e6)));
  const ys = new Set(ps.map((q) => Math.round(q[1] * 1e6)));
  return xs.size === 2 && ys.size === 2 && esRectilineo(ps);
}

/** Si todos los lados de un polígono son horizontales o verticales. */
export function esRectilineo(ps: Punto[]): boolean {
  return ps.every((a, i) => {
    const b = ps[(i + 1) % ps.length];
    return casi(a[0], b[0]) || casi(a[1], b[1]);
  });
}

/**
 * El rectángulo que describe un elemento, si se puede cargar por medidas. Null
 * si no: un polígono con forma de L, una calle con quiebres. Esos se editan en
 * el dibujo libre.
 */
export function rectDeElemento(e: Elemento, p: Pick<Plano, "largo" | "origen">): RectUsuario | null {
  switch (e.tipo) {
    case "rack":
      return rectDePuntos(esquinasDeRack(e), p);
    case "limite":
    case "techado":
      return esRectangulo(e.puntos) ? rectDePuntos(e.puntos, p) : null;
    case "calle": {
      if (e.puntos.length !== 2) return null;
      const [a, b] = e.puntos;
      if (casi(a[1], b[1])) {
        const r = rectDePuntos(e.puntos, p);
        return { ...r, y: r.y - e.ancho / 2, alto: e.ancho };
      }
      if (casi(a[0], b[0])) {
        const r = rectDePuntos(e.puntos, p);
        return { ...r, x: r.x - e.ancho / 2, ancho: e.ancho };
      }
      return null;
    }
    case "acceso":
    case "frente": {
      const [a, b] = e.puntos;
      return casi(a[0], b[0]) || casi(a[1], b[1]) ? rectDePuntos(e.puntos, p) : null;
    }
  }
}

/**
 * Arma (o rearma, si se pasa `base`) un elemento desde un rectángulo de usuario.
 *
 * - Límite y techado: el rectángulo.
 * - Rack: el rectángulo, sin girar (en medidas, "ancho en X, alto en Y" ya dice
 *   cómo está parado).
 * - Calle: la línea del medio a lo largo del lado más largo; el lado corto es
 *   el ancho de la calle.
 * - Acceso y frente: un segmento; una de las medidas tiene que ser 0.
 */
export function elementoDesdeRect(
  tipo: TipoElemento,
  r: RectUsuario,
  p: Pick<Plano, "largo" | "origen">,
  base?: Partial<Elemento> & { id?: string },
): Elemento {
  const id = base?.id ?? nuevoId();
  const etiqueta = base?.etiqueta;
  // Rearmar por medidas no le saca el estilo propio al elemento.
  const estilo = base?.estilo;
  const [arribaIzq] = esquinasDeRect(r, p);
  switch (tipo) {
    case "limite":
    case "techado":
      return { id, etiqueta, estilo, tipo, puntos: esquinasDeRect(r, p) };
    case "rack":
      return {
        id,
        etiqueta,
        estilo,
        tipo: "rack",
        x: arribaIzq[0],
        y: arribaIzq[1],
        ancho: r.ancho,
        largo: r.alto,
        rotacion: 0,
        grupoId: base && "grupoId" in base ? (base.grupoId ?? null) : null,
      };
    case "calle": {
      const horizontal = r.ancho >= r.alto;
      const puntos: Punto[] = horizontal
        ? [deUsuario([r.x, r.y + r.alto / 2], p), deUsuario([r.x + r.ancho, r.y + r.alto / 2], p)]
        : [deUsuario([r.x + r.ancho / 2, r.y], p), deUsuario([r.x + r.ancho / 2, r.y + r.alto], p)];
      return { id, etiqueta, estilo, tipo: "calle", puntos, ancho: horizontal ? r.alto : r.ancho };
    }
    case "acceso":
    case "frente":
      return {
        id,
        etiqueta,
        tipo,
        puntos: [deUsuario([r.x, r.y], p), r.alto === 0 ? deUsuario([r.x + r.ancho, r.y], p) : deUsuario([r.x, r.y + r.alto], p)],
      };
  }
}

/* -------------------------------------------------------------------------- */
/* Unir figuras                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Une polígonos de lados rectos (horizontales y verticales) en uno solo: suma
 * las áreas y devuelve el perímetro nuevo.
 *
 * Es para armar el lote o un techado que no es un rectángulo con dos o tres
 * rectángulos. Cómo lo hace, porque es fácil equivocarse:
 *
 * 1. Toma todas las X y todas las Y de los vértices y arma una grilla con ellas.
 *    Como los lados son rectos, cada celda de esa grilla está entera adentro o
 *    entera afuera de cada figura.
 * 2. Marca las celdas cubiertas por alguna figura (mirando su centro).
 * 3. Exige que las cubiertas formen UNA sola pieza (que las figuras se toquen
 *    por un lado, no solo por una esquina) y que no encierren un hueco: un lote
 *    con un agujero en el medio no es lo que se quiere dibujar así.
 * 4. Recorre el borde de las celdas cubiertas y saca los vértices que quedan en
 *    el medio de un lado recto.
 *
 * Devuelve el contorno en el mismo sentido que los rectángulos del plano, o un
 * error en palabras.
 */
export function unirRectilineos(figuras: Punto[][]): { puntos: Punto[] } | { error: string } {
  if (figuras.length === 0) return { error: "No hay figuras para unir." };
  if (figuras.some((f) => f.length < 3 || !esRectilineo(f))) {
    return {
      error:
        "Solo se pueden unir figuras con lados horizontales y verticales. Las de lados inclinados se dibujan a mano.",
    };
  }

  const redondear = (v: number) => Math.round(v * 1e6) / 1e6;
  const xs = [...new Set(figuras.flat().map((q) => redondear(q[0])))].sort((a, b) => a - b);
  const ys = [...new Set(figuras.flat().map((q) => redondear(q[1])))].sort((a, b) => a - b);
  const nx = xs.length - 1;
  const ny = ys.length - 1;

  const adentro = (px: number, py: number, f: Punto[]) => {
    let dentro = false;
    for (let i = 0, j = f.length - 1; i < f.length; j = i++) {
      const [xi, yi] = f[i];
      const [xj, yj] = f[j];
      if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) dentro = !dentro;
    }
    return dentro;
  };

  const cubierta: boolean[][] = Array.from({ length: nx }, (_, i) =>
    Array.from({ length: ny }, (_, j) => {
      const cx = (xs[i] + xs[i + 1]) / 2;
      const cy = (ys[j] + ys[j + 1]) / 2;
      return figuras.some((f) => adentro(cx, cy, f));
    }),
  );
  const esta = (i: number, j: number) => i >= 0 && j >= 0 && i < nx && j < ny && cubierta[i][j];

  // 3a. Una sola pieza: recorrido por vecinos de lado (no de esquina).
  const celdas: Array<[number, number]> = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) if (cubierta[i][j]) celdas.push([i, j]);
  if (celdas.length === 0) return { error: "Las figuras no tienen superficie." };
  const vistas = new Set<string>([celdas[0].join(",")]);
  const pila = [celdas[0]];
  while (pila.length) {
    const [i, j] = pila.pop()!;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = `${i + di},${j + dj}`;
      if (esta(i + di, j + dj) && !vistas.has(k)) {
        vistas.add(k);
        pila.push([i + di, j + dj]);
      }
    }
  }
  if (vistas.size !== celdas.length) {
    return { error: "Las figuras no se tocan por un lado: no forman una sola. Corré alguna para que se superpongan o compartan un lado." };
  }

  // 3b. Sin huecos: todo lo vacío tiene que poder llegar al borde de la grilla.
  const afuera = new Set<string>();
  const cola: Array<[number, number]> = [];
  for (let i = -1; i <= nx; i++) for (const j of [-1, ny]) cola.push([i, j]);
  for (let j = -1; j <= ny; j++) for (const i of [-1, nx]) cola.push([i, j]);
  for (const [i, j] of cola) afuera.add(`${i},${j}`);
  while (cola.length) {
    const [i, j] = cola.pop()!;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di;
      const b = j + dj;
      if (a < -1 || b < -1 || a > nx || b > ny) continue;
      const k = `${a},${b}`;
      if (!afuera.has(k) && !esta(a, b)) {
        afuera.add(k);
        cola.push([a, b]);
      }
    }
  }
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < ny; j++)
      if (!cubierta[i][j] && !afuera.has(`${i},${j}`)) {
        return { error: "La unión deja un hueco adentro. Dibujala en partes o a mano." };
      }

  // 4. El borde: cada lado de celda cubierta que da contra una vacía, con
  // sentido horario en pantalla (arriba → derecha → abajo → izquierda).
  const siguiente = new Map<string, Punto>();
  const clave = (q: Punto) => `${q[0]},${q[1]}`;
  for (const [i, j] of celdas) {
    const [x0, x1, y0, y1] = [xs[i], xs[i + 1], ys[j], ys[j + 1]];
    if (!esta(i, j - 1)) siguiente.set(clave([x0, y0]), [x1, y0]);
    if (!esta(i + 1, j)) siguiente.set(clave([x1, y0]), [x1, y1]);
    if (!esta(i, j + 1)) siguiente.set(clave([x1, y1]), [x0, y1]);
    if (!esta(i - 1, j)) siguiente.set(clave([x0, y1]), [x0, y0]);
  }

  // Empezar por el vértice de arriba a la izquierda, como los rectángulos.
  let inicio: Punto = [Infinity, Infinity];
  for (const k of siguiente.keys()) {
    const [x, y] = k.split(",").map(Number) as Punto;
    if (y < inicio[1] || (y === inicio[1] && x < inicio[0])) inicio = [x, y];
  }
  const contorno: Punto[] = [inicio];
  let actual = siguiente.get(clave(inicio))!;
  let guardia = 0;
  while (clave(actual) !== clave(inicio) && guardia++ < 100000) {
    contorno.push(actual);
    actual = siguiente.get(clave(actual))!;
  }

  // Sacar los vértices que están en el medio de un lado recto.
  const limpio = contorno.filter((q, i) => {
    const a = contorno[(i - 1 + contorno.length) % contorno.length];
    const b = contorno[(i + 1) % contorno.length];
    return !((casi(a[0], q[0]) && casi(q[0], b[0])) || (casi(a[1], q[1]) && casi(q[1], b[1])));
  });
  return { puntos: limpio };
}
