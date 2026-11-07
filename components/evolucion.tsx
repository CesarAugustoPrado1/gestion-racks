"use client";

import { useState } from "react";
import { numero } from "@/lib/formato";

/**
 * La evolución de UNA magnitud en el tiempo: una línea, una escala.
 *
 * Una por línea de producto y no todas juntas: placas, paquetes y cajas no se
 * pueden poner en el mismo eje sin mentir (sería un gráfico de doble escala
 * disfrazado). Por eso son gráficos chicos, uno al lado del otro, cada uno con
 * su unidad.
 *
 * Al pasar el dedo o el mouse, una línea vertical marca el tramo y dice el valor
 * exacto: el gráfico muestra la forma, el número está a un toque.
 */
export function GraficoEvolucion({
  titulo,
  unidad,
  serie,
  alto = 96,
}: {
  titulo: string;
  unidad: string;
  serie: Array<{ clave: string; etiqueta: string; valor: number }>;
  alto?: number;
}) {
  const [activo, setActivo] = useState<number | null>(null);
  if (serie.length === 0) return null;

  /**
   * La escala va del mínimo al máximo del período, con un poco de aire, y no
   * desde cero: es una línea, no barras, y lo que importa es cómo cambió. Para
   * que no engañe, el mínimo y el máximo van escritos en el eje.
   */
  const valores = serie.map((s) => s.valor);
  const maxReal = Math.max(...valores);
  const minReal = Math.min(...valores);
  const aire = Math.max((maxReal - minReal) * 0.15, 1);
  const max = maxReal + aire;
  const min = Math.max(0, minReal - aire);
  const rango = max - min || 1;
  const ancho = 300;
  const margenY = 6;
  const x = (i: number) => (serie.length === 1 ? ancho / 2 : (i / (serie.length - 1)) * ancho);
  const y = (v: number) => margenY + (1 - (v - min) / rango) * (alto - 2 * margenY);
  const puntos = serie.map((s, i) => `${x(i).toFixed(1)},${y(s.valor).toFixed(1)}`).join(" ");

  const ultimo = serie[serie.length - 1];
  const primero = serie[0];
  const cambio = ultimo.valor - primero.valor;
  const mostrado = activo != null ? serie[activo] : ultimo;

  return (
    <figure className="tarjeta p-4">
      <figcaption className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-slate-700">{titulo}</span>
        <span className="text-xs text-slate-500">
          {activo != null ? `${mostrado.etiqueta}: ` : "al cierre: "}
          <span className="cifra text-slate-900">{numero(mostrado.valor)}</span> {unidad}
        </span>
      </figcaption>
      <p className="mb-2 text-xs text-slate-500">
        {cambio === 0 ? "Sin cambio" : `${cambio > 0 ? "+" : "−"}${numero(Math.abs(cambio))} ${unidad}`} en el
        período (de {numero(primero.valor)} a {numero(ultimo.valor)})
      </p>
      <div className="relative">
        <span className="pointer-events-none absolute -top-3 left-0 text-[10px] text-slate-400 tabular-nums">
          máx. {numero(maxReal)}
        </span>
        <span className="pointer-events-none absolute bottom-1 left-0 rounded bg-white/90 px-0.5 text-[10px] text-slate-400 tabular-nums">
          mín. {numero(minReal)}
        </span>
        <svg
          viewBox={`0 0 ${ancho} ${alto}`}
          preserveAspectRatio="none"
          className="block h-24 w-full overflow-visible border-b border-slate-200"
          role="img"
          aria-label={`${titulo}: de ${numero(primero.valor)} a ${numero(ultimo.valor)} ${unidad}`}
          onMouseLeave={() => setActivo(null)}
        >
          {activo != null && (
            <line
              x1={x(activo)}
              x2={x(activo)}
              y1={0}
              y2={alto}
              stroke="var(--color-slate-300)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          )}
          <polyline
            points={puntos}
            fill="none"
            stroke="var(--color-medida)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          {/* Zonas para tocar: una por tramo, de alto completo, más grandes que la línea. */}
          {serie.map((s, i) => {
            const izq = i === 0 ? 0 : (x(i - 1) + x(i)) / 2;
            const der = i === serie.length - 1 ? ancho : (x(i) + x(i + 1)) / 2;
            return (
              <rect
                key={s.clave}
                x={izq}
                y={0}
                width={Math.max(der - izq, 1)}
                height={alto}
                fill="transparent"
                onMouseEnter={() => setActivo(i)}
                onTouchStart={() => setActivo(i)}
              >
                <title>{`${s.etiqueta}: ${numero(s.valor)} ${unidad}`}</title>
              </rect>
            );
          })}
        </svg>
        {activo != null && (
          <span
            className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-medida ring-2 ring-white"
            style={{ left: `${(x(activo) / ancho) * 100}%`, top: `${(y(serie[activo].valor) / alto) * 100}%` }}
          />
        )}
        <div className="mt-1 flex justify-between text-[10px] text-slate-400">
          <span>{primero.etiqueta}</span>
          {serie.length > 2 && <span>{serie[Math.floor(serie.length / 2)].etiqueta}</span>}
          <span>{ultimo.etiqueta}</span>
        </div>
      </div>
    </figure>
  );
}

/**
 * La curva de CONFIABILIDAD: siempre de 0 a 100 %, para que dos curvas se
 * puedan comparar a ojo -la del grupo A y la del B, un modelo y otro-. Las
 * líneas punteadas son los cortes de la app: desde 50 % es "Confiable", entre
 * 25 % y 50 % "A chequear".
 *
 * Un tramo sin nada medido no vale cero: no hay dato. Ahí la línea se corta.
 */
export function GraficoConfianza({
  titulo,
  serie,
  detalle,
}: {
  titulo: string;
  serie: Array<{ clave: string; etiqueta: string; valor: number | null; medidos?: number; sinDatos?: number }>;
  detalle?: string;
}) {
  const [activo, setActivo] = useState<number | null>(null);
  if (serie.length === 0) return null;

  const ancho = 300;
  const alto = 96;
  const x = (i: number) => (serie.length === 1 ? ancho / 2 : (i / (serie.length - 1)) * ancho);
  const y = (v: number) => alto - v * alto;
  const pct = (v: number | null) => (v == null ? "sin dato" : `${Math.round(v * 100)} %`);

  // Tramos continuos de la línea: se corta donde no hay dato.
  const tramos: string[] = [];
  let actual: string[] = [];
  serie.forEach((s, i) => {
    if (s.valor == null) {
      if (actual.length) tramos.push(actual.join(" "));
      actual = [];
    } else actual.push(`${x(i).toFixed(1)},${y(s.valor).toFixed(1)}`);
  });
  if (actual.length) tramos.push(actual.join(" "));

  const ultimoConDato = [...serie].reverse().find((s) => s.valor != null);
  const primeroConDato = serie.find((s) => s.valor != null);
  const mostrado = activo != null ? serie[activo] : (ultimoConDato ?? serie[serie.length - 1]);
  const cambio =
    ultimoConDato && primeroConDato ? Math.round((ultimoConDato.valor! - primeroConDato.valor!) * 100) : null;

  return (
    <figure className="tarjeta p-4">
      <figcaption className="mb-1 flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-semibold text-slate-700">{titulo}</span>
        <span className="shrink-0 text-xs text-slate-500">
          {activo != null ? `${mostrado.etiqueta}: ` : ""}
          <span className="cifra text-slate-900">{pct(mostrado.valor)}</span>
        </span>
      </figcaption>
      <p className="mb-2 text-xs text-slate-500">
        {detalle ??
          (mostrado.medidos != null
            ? `${mostrado.medidos} medidos${mostrado.sinDatos ? ` · ${mostrado.sinDatos} sin chequear` : ""}`
            : "")}
        {activo == null && cambio != null && cambio !== 0 && ` · ${cambio > 0 ? "+" : "−"}${Math.abs(cambio)} puntos en el período`}
      </p>
      <div className="relative">
        <svg
          viewBox={`0 0 ${ancho} ${alto}`}
          preserveAspectRatio="none"
          className="block h-20 w-full overflow-visible border-b border-slate-200"
          role="img"
          aria-label={`${titulo}: ${pct(mostrado.valor)}`}
          onMouseLeave={() => setActivo(null)}
        >
          {[0.5, 0.25].map((corte) => (
            <line
              key={corte}
              x1={0}
              x2={ancho}
              y1={y(corte)}
              y2={y(corte)}
              stroke="var(--color-slate-300)"
              strokeWidth={1}
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {activo != null && (
            <line x1={x(activo)} x2={x(activo)} y1={0} y2={alto} stroke="var(--color-slate-300)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          )}
          {tramos.map((puntos, i) =>
            puntos.includes(" ") ? (
              <polyline
                key={i}
                points={puntos}
                fill="none"
                stroke="var(--color-medida)"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            ) : (
              <circle key={i} cx={puntos.split(",")[0]} cy={puntos.split(",")[1]} r={2} fill="var(--color-medida)" />
            ),
          )}
          {serie.map((s, i) => {
            const izq = i === 0 ? 0 : (x(i - 1) + x(i)) / 2;
            const der = i === serie.length - 1 ? ancho : (x(i) + x(i + 1)) / 2;
            return (
              <rect
                key={s.clave}
                x={izq}
                y={0}
                width={Math.max(der - izq, 1)}
                height={alto}
                fill="transparent"
                onMouseEnter={() => setActivo(i)}
                onTouchStart={() => setActivo(i)}
              >
                <title>{`${s.etiqueta}: ${pct(s.valor)}`}</title>
              </rect>
            );
          })}
        </svg>
        <span className="pointer-events-none absolute right-0 text-[9px] text-slate-400" style={{ top: `${(1 - 0.5) * 100}%`, transform: "translateY(-100%)" }}>
          50 %
        </span>
        <span className="pointer-events-none absolute right-0 text-[9px] text-slate-400" style={{ top: `${(1 - 0.25) * 100}%`, transform: "translateY(-100%)" }}>
          25 %
        </span>
        {activo != null && serie[activo].valor != null && (
          <span
            className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-medida ring-2 ring-white"
            style={{ left: `${(x(activo) / ancho) * 100}%`, top: `${(y(serie[activo].valor!) / alto) * 100}%` }}
          />
        )}
        <div className="mt-1 flex justify-between text-[10px] text-slate-400">
          <span>{serie[0].etiqueta}</span>
          <span>{serie[serie.length - 1].etiqueta}</span>
        </div>
      </div>
    </figure>
  );
}
