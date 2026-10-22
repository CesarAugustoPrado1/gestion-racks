import Link from "next/link";
import type { ReactNode } from "react";
import { numero } from "@/lib/formato";

/**
 * Las piezas del tablero y de estadísticas. Server components, sin librerías:
 * barras hechas con divs, porque son pocas y así se ven igual en el celular del
 * galpón que en la PC de la oficina.
 *
 * Reglas que siguen todas:
 * - UNA serie = UN color (`bg-medida`, el azul ya validado de la app). El color
 *   no repite el largo de la barra: el largo ya dice cuánto.
 * - El número va en tinta, al lado de la barra, nunca pintado del color de la
 *   serie.
 * - Cada barra tiene su detalle al pasar el dedo o el mouse, y el número a la
 *   vista: el gráfico se lee sin tooltip, el tooltip agrega.
 * - Nunca dos escalas en el mismo gráfico. Lo que mide cosas distintas va en
 *   gráficos separados.
 */

/** Un número grande con su nombre: cuando la respuesta es un número, no hay gráfico. */
export function Tile({
  etiqueta,
  valor,
  detalle,
  href,
  tono = "normal",
}: {
  etiqueta: string;
  valor: ReactNode;
  detalle?: ReactNode;
  href?: string;
  /** `atencion` para lo que pide que alguien haga algo: sin ubicar, ajenos. */
  tono?: "normal" | "atencion";
}) {
  const cuerpo = (
    <>
      <p className="text-xs font-medium text-slate-500">{etiqueta}</p>
      <p
        className={`cifra mt-1 text-2xl leading-tight ${
          tono === "atencion" ? "text-amber-800" : "text-slate-900"
        }`}
      >
        {valor}
      </p>
      {detalle && <p className="mt-0.5 text-xs text-slate-500">{detalle}</p>}
    </>
  );
  const clase = `tarjeta block p-4 ${tono === "atencion" ? "ring-amber-300" : ""}`;
  return href ? (
    <Link href={href} className={`${clase} transition hover:ring-slate-400`}>
      {cuerpo}
    </Link>
  ) : (
    <div className={clase}>{cuerpo}</div>
  );
}

export function Seccion({
  titulo,
  detalle,
  children,
}: {
  titulo: string;
  detalle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mt-6">
      <h2 className="text-base font-bold text-slate-900">{titulo}</h2>
      {detalle && <p className="mt-0.5 mb-2 text-xs text-slate-500">{detalle}</p>}
      <div className={detalle ? "" : "mt-2"}>{children}</div>
    </section>
  );
}

/**
 * Barras horizontales, una serie. Para comparar magnitudes entre categorías:
 * modelos, motivos, niveles.
 */
export function Barras({
  filas,
  maximo,
  vacio = "Sin datos en este período.",
}: {
  filas: Array<{
    clave: string;
    etiqueta: ReactNode;
    valor: number;
    /** Lo que se escribe al lado. Por defecto, el valor. */
    texto?: ReactNode;
    /** El detalle del tooltip. */
    detalle?: string;
    href?: string;
    /** Atenuada: cuenta, pero no es lo principal (un rearmado no es una venta). */
    atenuada?: boolean;
  }>;
  maximo?: number;
  vacio?: string;
}) {
  if (filas.length === 0) {
    return <p className="tarjeta p-4 text-sm text-slate-500">{vacio}</p>;
  }
  const max = Math.max(maximo ?? 0, ...filas.map((f) => f.valor), 1);
  return (
    <ul className="tarjeta space-y-2.5 p-4">
      {filas.map((f) => {
        const ancho = (f.valor / max) * 100;
        const contenido = (
          <>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-slate-700">{f.etiqueta}</span>
              <span className="cifra shrink-0 text-slate-900">{f.texto ?? numero(f.valor)}</span>
            </div>
            <div className="mt-1 h-2 rounded bg-slate-100">
              <div
                className={`h-2 rounded ${f.atenuada ? "bg-medida/40" : "bg-medida"}`}
                style={{ width: `${Math.max(ancho, f.valor > 0 ? 1.5 : 0)}%` }}
              />
            </div>
          </>
        );
        return (
          <li key={f.clave} title={f.detalle}>
            {f.href ? (
              <Link href={f.href} className="block rounded-lg transition hover:bg-slate-50">
                {contenido}
              </Link>
            ) : (
              contenido
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Columnas por día (o por hora): una serie en el tiempo.
 *
 * `maximo` permite que varios de estos compartan la escala -ingresos y
 * egresos uno debajo del otro- y se puedan comparar a ojo, que es lo que se
 * hace en vez de meter dos series con dos escalas en el mismo gráfico.
 */
export function Columnas({
  titulo,
  serie,
  maximo,
  unidad,
  etiquetaX,
}: {
  titulo: string;
  serie: Array<{ clave: string; valor: number; etiqueta: string }>;
  maximo?: number;
  /** "ingresos", "chequeos": para el tooltip y el total. */
  unidad: string;
  /** Las marcas del eje x: cuáles índices llevan texto. */
  etiquetaX?: (i: number, total: number) => string | null;
}) {
  const max = Math.max(maximo ?? 0, ...serie.map((s) => s.valor), 1);
  const total = serie.reduce((s, x) => s + x.valor, 0);
  const marcas =
    etiquetaX ??
    ((i: number, n: number) =>
      i === 0 || i === n - 1 || (n > 14 && i === Math.floor(n / 2)) ? serie[i].etiqueta : null);

  return (
    <figure className="tarjeta p-4">
      <figcaption className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-slate-700">{titulo}</span>
        <span className="text-xs text-slate-500">
          <span className="cifra text-slate-900">{numero(total)}</span>{" "}
          {total === 1 ? unidad.replace(/s$/, "") : unidad}
        </span>
      </figcaption>
      <div className="relative">
        {/* La línea de la escala: el máximo, para leer las alturas sin tooltip. */}
        <span className="absolute -top-1 right-0 text-[10px] text-slate-400 tabular-nums">
          {numero(max)}
        </span>
        <div className="flex h-24 items-end gap-[2px] border-b border-slate-200 pt-3">
          {serie.map((s) => (
            <div
              key={s.clave}
              className="group relative flex h-full flex-1 items-end"
              title={`${s.etiqueta}: ${numero(s.valor)} ${unidad}`}
            >
              <div
                className="w-full rounded-t bg-medida transition group-hover:bg-slate-900"
                style={{ height: `${(s.valor / max) * 100}%`, minHeight: s.valor > 0 ? 2 : 0 }}
              />
            </div>
          ))}
        </div>
        <div className="mt-1 flex gap-[2px] text-[10px] text-slate-400">
          {serie.map((s, i) => {
            const m = marcas(i, serie.length);
            return (
              <span key={s.clave} className="relative flex-1">
                {m && (
                  <span
                    className={`absolute whitespace-nowrap ${
                      i === 0 ? "left-0" : i === serie.length - 1 ? "right-0" : "left-1/2 -translate-x-1/2"
                    }`}
                  >
                    {m}
                  </span>
                )}
              </span>
            );
          })}
        </div>
        <div className="h-3" />
      </div>
    </figure>
  );
}

/**
 * Una barra partida en estados: ocupada, tapada, libre, fuera de uso. Es
 * parte-de-un-todo con pocos segmentos y un orden fijo, que es para lo único
 * que sirve una barra apilada.
 */
export const ESTADOS_POSICION = [
  { clave: "ocupadas", etiqueta: "ocupadas", clase: "bg-medida" },
  { clave: "tapadas", etiqueta: "tapadas por un bulto alto", clase: "bg-medida/45" },
  { clave: "libres", etiqueta: "libres", clase: "bg-white ring-1 ring-inset ring-slate-300" },
  { clave: "fueraDeUso", etiqueta: "fuera de uso", clase: "fuera-de-uso" },
] as const;

export type ConteoPosiciones = {
  ocupadas: number;
  tapadas: number;
  libres: number;
  fueraDeUso: number;
};

export function BarraPosiciones({ conteo }: { conteo: ConteoPosiciones }) {
  const total = ESTADOS_POSICION.reduce((s, e) => s + conteo[e.clave], 0);
  if (total === 0) return <div className="h-3 rounded bg-slate-100" />;
  return (
    <div className="flex h-3 gap-[2px]">
      {ESTADOS_POSICION.filter((e) => conteo[e.clave] > 0).map((e) => (
        <div
          key={e.clave}
          className={`h-3 first:rounded-l last:rounded-r ${e.clase}`}
          style={{ width: `${(conteo[e.clave] / total) * 100}%` }}
          title={`${numero(conteo[e.clave])} ${e.etiqueta}`}
        />
      ))}
    </div>
  );
}

export function LeyendaPosiciones() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
      {ESTADOS_POSICION.map((e) => (
        <span key={e.clave} className="flex items-center gap-1.5">
          <span className={`h-3 w-3 rounded-sm ${e.clase}`} />
          {e.etiqueta}
        </span>
      ))}
    </div>
  );
}
