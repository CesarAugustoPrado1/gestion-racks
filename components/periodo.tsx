import Link from "next/link";
import { numero } from "@/lib/formato";
import { PERIODOS_FIJOS, atajosDeMomento, diaDe, type Momento, type Rango } from "@/lib/periodos";

/**
 * Los selectores de tiempo de Resumen y Estadísticas. Viven en la URL -sin
 * estado en el cliente-: un período o una foto se comparte mandando el link, y
 * el botón de atrás vuelve al anterior.
 */

const chip = (activo: boolean) =>
  `shrink-0 rounded-full px-3.5 py-2 text-sm font-semibold transition ${
    activo ? "bg-slate-900 text-white" : "bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
  }`;

/** Los períodos de las estadísticas: atajos y un desde–hasta a elección. */
export function SelectorPeriodo({ rango, ruta }: { rango: Rango; ruta: string }) {
  return (
    <div className="tarjeta space-y-3 p-4">
      <div className="flex flex-wrap gap-1.5">
        {PERIODOS_FIJOS.map((p) => (
          <Link key={p.id} href={`${ruta}?p=${p.id}`} className={chip(rango.id === p.id)} scroll={false}>
            {p.etiqueta}
          </Link>
        ))}
      </div>
      <form action={ruta} className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-slate-500">
          Desde
          <input type="date" name="desde" defaultValue={rango.desdeDia} className="campo mt-0.5 py-2" required />
        </label>
        <label className="text-xs text-slate-500">
          Hasta
          <input
            type="date"
            name="hasta"
            defaultValue={rango.enCurso ? diaDe(rango.fin) : rango.hastaDia}
            className="campo mt-0.5 py-2"
            required
          />
        </label>
        <button type="submit" className={`${chip(rango.id === "rango")} h-11`}>
          Ver período
        </button>
      </form>
    </div>
  );
}

/**
 * El momento de la foto y, opcionalmente, otro para compararla. Los dos se
 * eligen igual: atajos de cierre o un día cualquiera.
 */
export function SelectorMomento({
  momento,
  comparacion,
  ruta,
  ahora,
}: {
  momento: Momento;
  comparacion: Momento | null;
  ruta: string;
  ahora: Date;
}) {
  const atajos = atajosDeMomento(ahora);
  const url = (fecha: string | null, vs: string | null) => {
    const q = new URLSearchParams();
    if (fecha) q.set("fecha", fecha);
    if (vs) q.set("vs", vs);
    const s = q.toString();
    return s ? `${ruta}?${s}` : ruta;
  };
  const vsActual = comparacion?.dia ?? null;

  return (
    <div className="tarjeta space-y-3 p-4">
      <div>
        <p className="mb-1.5 text-xs font-medium text-slate-500">Foto de</p>
        <div className="flex flex-wrap gap-1.5">
          {atajos.map((a) => (
            <Link key={a.id} href={url(a.dia, vsActual)} className={chip(momento.id === a.id)} scroll={false}>
              {a.etiqueta}
            </Link>
          ))}
        </div>
        <form action={ruta} className="mt-2 flex flex-wrap items-end gap-2">
          {vsActual && <input type="hidden" name="vs" value={vsActual} />}
          <label className="text-xs text-slate-500">
            Otro día (al cierre)
            <input type="date" name="fecha" defaultValue={momento.dia ?? ""} className="campo mt-0.5 py-2" required />
          </label>
          <button type="submit" className={`${chip(!atajos.some((a) => a.id === momento.id))} h-11`}>
            Ver
          </button>
        </form>
      </div>

      {/* Plegado mientras no se compara: es lo menos usado y ocupa media pantalla en el celular. */}
      <details className="border-t border-slate-100 pt-3" open={comparacion != null}>
        <summary className="cursor-pointer text-sm font-semibold text-slate-700">
          Comparar con otra foto{comparacion ? `: ${comparacion.etiqueta.toLowerCase()}` : ""}
        </summary>
        <div className="mt-2">
        <div className="flex flex-wrap gap-1.5">
          <Link href={url(momento.dia, null)} className={chip(comparacion == null)} scroll={false}>
            Sin comparar
          </Link>
          {atajos
            .filter((a) => a.dia != null && a.dia !== momento.dia)
            .map((a) => (
              <Link key={a.id} href={url(momento.dia, a.dia)} className={chip(vsActual === a.dia)} scroll={false}>
                {a.etiqueta}
              </Link>
            ))}
        </div>
        <form action={ruta} className="mt-2 flex flex-wrap items-end gap-2">
          {momento.dia && <input type="hidden" name="fecha" value={momento.dia} />}
          <label className="text-xs text-slate-500">
            Otro día (al cierre)
            <input type="date" name="vs" defaultValue={vsActual ?? ""} className="campo mt-0.5 py-2" required />
          </label>
          <button type="submit" className={`${chip(false)} h-11`}>
            Comparar
          </button>
        </form>
        </div>
      </details>
    </div>
  );
}

/**
 * La diferencia contra el período o la foto de comparación: "+12 (+8%) vs
 * octubre". En gris y con flecha, sin verde ni rojo: que entre más o salga más
 * no es bueno ni malo por sí solo, y el color diría que sí.
 */
export function Delta({
  actual,
  anterior,
  contra,
  unidad,
}: {
  actual: number;
  anterior: number;
  contra: string;
  unidad?: string;
}) {
  const d = actual - anterior;
  // Con una base chica el porcentaje no dice nada (de 3 a 190 es "+6233%"): se muestra solo la diferencia.
  const pct = Math.abs(anterior) >= 5 ? Math.round((d / Math.abs(anterior)) * 100) : null;
  if (d === 0) return <span className="text-slate-500">igual que {contra}</span>;
  return (
    <span className="text-slate-600">
      <span className="font-semibold text-slate-800">
        {d > 0 ? "▲ +" : "▼ −"}
        {numero(Math.abs(d))}
        {unidad ? ` ${unidad}` : ""}
      </span>
      {pct != null && ` (${d > 0 ? "+" : "−"}${Math.abs(pct)}%)`} vs {contra}
    </span>
  );
}
