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
