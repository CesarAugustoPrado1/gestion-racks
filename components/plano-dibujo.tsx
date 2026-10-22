import type { ReactNode } from "react";
import { esquinasDeRack, type Elemento, type Plano, type Punto } from "@/lib/plano";

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
      <text x={x0 - e} y={y + e * 0.6} fontSize={e * 1.8} fill="#334155" textAnchor="end">
        {largo} m
      </text>
    </g>
  );
}

/** Un elemento del plano. `resaltado` para el seleccionado en el editor. */
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
  const borde = resaltado ? "#0f172a" : undefined;

  switch (e.tipo) {
    case "techado":
      return (
        <g>
          <polygon points={pts(e.puntos)} fill="#f1f5f9" stroke={borde ?? "#94a3b8"} strokeWidth={s * 0.25} strokeDasharray={`${s} ${s * 0.6}`} />
          {e.etiqueta && <Etiqueta en={centroide(e.puntos)} texto={e.etiqueta} s={s} color="#64748b" />}
        </g>
      );
    case "limite":
      return <polygon points={pts(e.puntos)} fill="none" stroke={borde ?? "#0f172a"} strokeWidth={s * 0.6} strokeLinejoin="round" />;
    case "calle":
      return (
        <g>
          <polyline points={pts(e.puntos)} fill="none" stroke={resaltado ? "#94a3b8" : "#cbd5e1"} strokeWidth={e.ancho} strokeLinejoin="round" strokeLinecap="butt" />
          {/* La línea del medio, punteada, como en una calle de verdad. */}
          <polyline points={pts(e.puntos)} fill="none" stroke="#fff" strokeWidth={s * 0.25} strokeDasharray={`${s * 1.5} ${s}`} />
          {e.etiqueta && <Etiqueta en={e.puntos[0]} texto={e.etiqueta} s={s} color="#475569" />}
        </g>
      );
    case "acceso":
      return (
        <g>
          <polyline points={pts(e.puntos)} stroke={borde ?? "#059669"} strokeWidth={s * 0.9} strokeLinecap="butt" />
          <Etiqueta en={afuera(e.puntos, plano, s * 2.6)} texto={e.etiqueta || "Acceso"} s={s} color="#047857" />
        </g>
      );
    case "frente":
      return (
        <g>
          <polyline points={pts(e.puntos)} stroke={borde ?? "#0f172a"} strokeWidth={s * 1.2} strokeLinecap="butt" strokeDasharray={`${s * 4} ${s * 1.5}`} />
          <Etiqueta en={afuera(e.puntos, plano, s * 3)} texto={e.etiqueta ? `Frente · ${e.etiqueta}` : "Frente"} s={s} color="#0f172a" negrita />
        </g>
      );
    case "rack": {
      const info = e.grupoId != null ? grupos.get(e.grupoId) : undefined;
      const esq = esquinasDeRack(e);
      // Ocupación como intensidad de UN solo tono: es una magnitud, no una
      // categoría. Sin grupo asignado, gris.
      const opacidad = info?.ocupacion != null ? 0.12 + (info.ocupacion / 100) * 0.6 : 0;
      const [cx, cy] = centroide(esq);
      const titulo = info
        ? `Grupo ${info.codigo} · ${info.detalle}`
        : e.etiqueta || "Rack sin grupo asignado";
      return (
        <g>
          <title>{titulo}</title>
          <polygon points={pts(esq)} fill={info ? "var(--color-medida)" : "#e2e8f0"} fillOpacity={info ? opacidad : 1} stroke={borde ?? (info ? "var(--color-medida)" : "#94a3b8")} strokeWidth={s * (resaltado ? 0.5 : 0.3)} />
          <text x={cx} y={cy - s * 0.2} textAnchor="middle" fontSize={s * 2} fontWeight={700} fill="#0f172a">
            {info ? info.codigo : e.etiqueta || "rack"}
          </text>
          {info?.ocupacion != null && (
            <text x={cx} y={cy + s * 2} textAnchor="middle" fontSize={s * 1.5} fill="#334155">
              {info.ocupacion}%
            </text>
          )}
        </g>
      );
    }
  }
}

function Etiqueta({
  en,
  texto,
  s,
  color,
  negrita = false,
}: {
  en: Punto;
  texto: string;
  s: number;
  color: string;
  negrita?: boolean;
}) {
  return (
    <text
      x={en[0]}
      y={en[1]}
      textAnchor="middle"
      fontSize={s * 1.6}
      fontWeight={negrita ? 700 : 500}
      fill={color}
      paintOrder="stroke"
      stroke="#fff"
      strokeWidth={s * 0.5}
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
