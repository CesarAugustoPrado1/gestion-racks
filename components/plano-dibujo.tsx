import type { ReactNode } from "react";
import {
  FUENTES,
  esquinasDeRack,
  estiloDe,
  tipografiaDe,
  type Elemento,
  type EstiloResuelto,
  type Plano,
  type Punto,
} from "@/lib/plano";

/**
 * El dibujo del plano, sin interacción. Lo usan la vista (`/planta`) y el
 * editor, así lo que se edita es exactamente lo que se ve.
 *
 * Todo está en METROS: el SVG usa 1 unidad = 1 m, y el tamaño en pantalla lo
 * decide el viewBox. Los textos y trazos finos se escalan con el tamaño del
 * plano, para que se lean igual en una planta de 40 m que en una de 400.
 */

export type InfoDeGrupo = {
  codigo: string;
  /** 0 a 100, sobre posiciones útiles. `null` si no tiene posiciones útiles. */
  ocupacion: number | null;
  detalle: string;
};

const pts = (ps: Punto[]) => ps.map(([x, y]) => `${x},${y}`).join(" ");

/** Escala de los detalles: cuántos metros mide "un poco" en este plano. */
export function escalaDe(p: Plano): number {
  return Math.max(p.ancho, p.largo) / 100;
}

/**
 * El aire alrededor del espacio de trabajo: ahí van el frente, los accesos y
 * la regla. Crece con el tamaño de letra, si no los textos grandes se cortan.
 */
export function margenDe(p: Plano): number {
  const tamano = (p.texto?.tamano ?? 100) / 100;
  return escalaDe(p) * 6 * Math.max(1, tamano);
}

export function Grilla({ plano }: { plano: Plano }) {
  const lineas: ReactNode[] = [];
  const paso = plano.ancho > 300 || plano.largo > 300 ? 10 : 1;
  const e = escalaDe(plano);
  for (let x = 0; x <= plano.ancho; x += paso) {
    const fuerte = Math.round(x / paso) % 5 === 0;
    lineas.push(
      <line key={`x${x}`} x1={x} y1={0} x2={x} y2={plano.largo} stroke={fuerte ? "#e2e8f0" : "#f1f5f9"} strokeWidth={e * (fuerte ? 0.12 : 0.08)} />,
    );
  }
  for (let y = 0; y <= plano.largo; y += paso) {
    const fuerte = Math.round(y / paso) % 5 === 0;
    lineas.push(
      <line key={`y${y}`} x1={0} y1={y} x2={plano.ancho} y2={y} stroke={fuerte ? "#e2e8f0" : "#f1f5f9"} strokeWidth={e * (fuerte ? 0.12 : 0.08)} />,
    );
  }
  return <g aria-hidden>{lineas}</g>;
}

/**
 * Una regla de 10 m (o 50 m en plantas grandes), abajo a la DERECHA: abajo a
 * la izquierda están los ejes de referencia y se pisaban.
 */
export function Escala({ plano }: { plano: Plano }) {
  const e = escalaDe(plano);
  const largo = plano.ancho > 300 ? 50 : 10;
  const y = plano.largo + e * 3;
  const x1 = plano.ancho;
  const x0 = x1 - largo;
  return (
    <g aria-hidden>
      <line x1={x0} y1={y} x2={x1} y2={y} stroke="#334155" strokeWidth={e * 0.3} />
      <line x1={x0} y1={y - e} x2={x0} y2={y + e} stroke="#334155" strokeWidth={e * 0.3} />
      <line x1={x1} y1={y - e} x2={x1} y2={y + e} stroke="#334155" strokeWidth={e * 0.3} />
      <text x={x0 - e} y={y + e * 0.6} fontSize={e * 1.8} fill="#334155" textAnchor="end" fontFamily={FUENTES[tipografiaDe(plano).fuente].css}>
        {largo} m
      </text>
    </g>
  );
}

/** El dibujo de un trazo según su tipo: guiones y puntos escalan con el plano. */
function guiones(tipo: EstiloResuelto["tipoTrazo"], s: number, ancho: number): string | undefined {
  if (tipo === "guiones") return `${Math.max(s * 1.5, ancho * 2)} ${Math.max(s, ancho * 1.2)}`;
  if (tipo === "puntos") return `${s * 0.01} ${Math.max(s * 0.8, ancho * 2)}`;
  return undefined;
}

/** `ninguno` no pinta; cualquier otro valor es un color. */
const pintura = (c: string) => (c === "ninguno" ? "none" : c);

/**
 * Un elemento del plano, con su estilo (ver `estiloDe`) y la tipografía del
 * plano. `resaltado` para los elegidos en el editor: se marcan con un contorno
 * aparte, así se ven aunque el elemento no tenga trazo.
 */
export function DibujoElemento({
  e,
  plano,
  grupos,
  resaltado = false,
}: {
  e: Elemento;
  plano: Plano;
  grupos: Map<number, InfoDeGrupo>;
  resaltado?: boolean;
}) {
  const s = escalaDe(plano);
  const est = estiloDe(e, plano);
  const tipo = tipografiaDe(plano);
  const t: Letra = {
    s: s * (tipo.tamano / 100),
    familia: FUENTES[tipo.fuente].css,
    color: tipo.color,
  };
  const grosor = s * 0.1 * est.grosor;
  const trazo = {
    stroke: pintura(est.trazo),
    strokeWidth: grosor,
    strokeDasharray: guiones(est.tipoTrazo, s, grosor),
    strokeLinecap: est.tipoTrazo === "puntos" ? ("round" as const) : ("butt" as const),
    strokeLinejoin: "round" as const,
  };
  const relleno = {
    fill: est.relleno === "ninguno" || est.relleno === "ocupacion" ? "none" : est.relleno,
    fillOpacity: est.opacidad / 100,
  };
  const marca = (forma: ReactNode) =>
    resaltado ? <g pointerEvents="none">{forma}</g> : null;
  const marcaProps = {
    fill: "none",
    stroke: "#2563eb",
    strokeWidth: s * 0.35,
    strokeDasharray: `${s * 0.8} ${s * 0.5}`,
  };

  switch (e.tipo) {
    case "techado":
    case "limite":
      return (
        <g>
          <polygon points={pts(e.puntos)} {...relleno} {...trazo} />
          {marca(<polygon points={pts(e.puntos)} {...marcaProps} />)}
          {e.etiqueta && <Etiqueta en={centroide(e.puntos)} texto={e.etiqueta} t={t} color="#64748b" />}
        </g>
      );
    case "calle":
      return (
        <g>
          {/* La franja de la calle es el relleno: un trazo tan ancho como la calle. */}
          {est.relleno !== "ninguno" && est.relleno !== "ocupacion" && (
            <polyline points={pts(e.puntos)} fill="none" stroke={est.relleno} strokeOpacity={est.opacidad / 100} strokeWidth={e.ancho} strokeLinejoin="round" strokeLinecap="butt" />
          )}
          {/* El trazo es la línea del medio. */}
          <polyline points={pts(e.puntos)} fill="none" {...trazo} />
          {marca(<polyline points={pts(e.puntos)} {...marcaProps} strokeWidth={e.ancho + s * 0.35} strokeOpacity={0.35} strokeDasharray={undefined} />)}
          {e.etiqueta && <Etiqueta en={e.puntos[0]} texto={e.etiqueta} t={t} color="#475569" />}
        </g>
      );
    case "acceso":
      return (
        <g>
          <polyline points={pts(e.puntos)} fill="none" {...trazo} />
          {marca(<polyline points={pts(e.puntos)} {...marcaProps} />)}
          <Etiqueta en={afuera(e.puntos, plano, t.s * 2.6)} texto={e.etiqueta || "Acceso"} t={t} color={est.trazo === "ninguno" ? "#047857" : est.trazo} />
        </g>
      );
    case "frente":
      return (
        <g>
          <polyline points={pts(e.puntos)} fill="none" {...trazo} />
          {marca(<polyline points={pts(e.puntos)} {...marcaProps} />)}
          <Etiqueta en={afuera(e.puntos, plano, t.s * 3)} texto={e.etiqueta ? `Frente · ${e.etiqueta}` : "Frente"} t={t} color="#0f172a" negrita />
        </g>
      );
    case "rack": {
      const info = e.grupoId != null ? grupos.get(e.grupoId) : undefined;
      const esq = esquinasDeRack(e);
      const [cx, cy] = centroide(esq);
      const titulo = info ? `Grupo ${info.codigo} · ${info.detalle}` : e.etiqueta || "Rack sin grupo asignado";
      /**
       * "ocupacion": la intensidad de UN solo tono dice cuánto está lleno -es
       * una magnitud, no una categoría-. Sin grupo, gris.
       */
      const rellenoRack =
        est.relleno === "ocupacion"
          ? info?.ocupacion != null
            ? { fill: "var(--color-medida)", fillOpacity: (0.12 + (info.ocupacion / 100) * 0.6) * (est.opacidad / 100) }
            : { fill: "#e2e8f0", fillOpacity: est.opacidad / 100 }
          : relleno;
      return (
        <g>
          <title>{titulo}</title>
          <polygon points={pts(esq)} {...rellenoRack} {...trazo} />
          {marca(<polygon points={pts(esq)} {...marcaProps} />)}
          <text x={cx} y={cy - t.s * 0.2} textAnchor="middle" fontSize={t.s * 2} fontWeight={700} fontFamily={t.familia} fill={t.color ?? "#0f172a"}>
            {info ? info.codigo : e.etiqueta || "rack"}
          </text>
          {info?.ocupacion != null && (
            <text x={cx} y={cy + t.s * 2} textAnchor="middle" fontSize={t.s * 1.5} fontFamily={t.familia} fill={t.color ?? "#334155"}>
              {info.ocupacion}%
            </text>
          )}
        </g>
      );
    }
  }
}

type Letra = { s: number; familia: string; color?: string };

function Etiqueta({
  en,
  texto,
  t,
  color,
  negrita = false,
}: {
  en: Punto;
  texto: string;
  t: Letra;
  /** El color propio del texto; la tipografía del plano lo puede pisar. */
  color: string;
  negrita?: boolean;
}) {
  return (
    <text
      x={en[0]}
      y={en[1]}
      textAnchor="middle"
      fontSize={t.s * 1.6}
      fontFamily={t.familia}
      fontWeight={negrita ? 700 : 500}
      fill={t.color ?? color}
      paintOrder="stroke"
      stroke="#fff"
      strokeWidth={t.s * 0.5}
    >
      {texto}
    </text>
  );
}

export function centroide(ps: Punto[]): Punto {
  return [ps.reduce((t, p) => t + p[0], 0) / ps.length, ps.reduce((t, p) => t + p[1], 0) / ps.length];
}

function medio(ps: Punto[]): Punto {
  const [a, b] = [ps[0], ps[ps.length - 1]];
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

/**
 * Dónde va la etiqueta de un segmento: a `distancia` del medio, del lado de
 * AFUERA del espacio de trabajo. El frente y los accesos suelen estar sobre el
 * borde; escritos encima de la línea, se mezclan con ella y con el límite.
 */
export function afuera(ps: Punto[], plano: { ancho: number; largo: number }, distancia: number): Punto {
  const [a, b] = [ps[0], ps[ps.length - 1]];
  const mid = medio(ps);
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy) || 1;
  let n: Punto = [-dy / l, dx / l];
  const haciaAfuera: Punto = [mid[0] - plano.ancho / 2, mid[1] - plano.largo / 2];
  if (n[0] * haciaAfuera[0] + n[1] * haciaAfuera[1] < 0) n = [-n[0], -n[1]];
  // El texto se ancla por la base: del lado de abajo hace falta un poco más.
  const extra = n[1] > 0 ? distancia * 0.4 : 0;
  return [mid[0] + n[0] * (distancia + extra), mid[1] + n[1] * (distancia + extra)];
}

/**
 * El orden en que se dibuja: de lo que va abajo a lo que va arriba. El techado
 * es un fondo; el límite, un borde; las calles van sobre el piso y los racks
 * sobre las calles; los accesos y el frente, encima de todo porque son la
 * referencia para ubicarse.
 */
export const ORDEN_DE_DIBUJO: Record<Elemento["tipo"], number> = {
  techado: 0,
  calle: 1,
  limite: 2,
  rack: 3,
  acceso: 4,
  frente: 5,
};

export function ordenarParaDibujar(es: Elemento[]): Elemento[] {
  return [...es].sort((a, b) => ORDEN_DE_DIBUJO[a.tipo] - ORDEN_DE_DIBUJO[b.tipo]);
}
