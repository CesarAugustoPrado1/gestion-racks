"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { describirPosicion, nombreDeNivel, nombreDeProfundidad } from "@/lib/posiciones";

/** Lo mínimo que el selector necesita de una posición. */
export type PosicionElegible = {
  id: number;
  codigo: string;
  rack: string;
  empresa: string | null;
  penetrable: boolean;
  /** La 01 está a la derecha: las calles o columnas se ofrecen en ese orden. */
  numeracionInvertida?: boolean;
  /** Calle (penetrable) o columna corrida (selectivo). */
  calle: number;
  nivel: number;
  niveles: number;
  profundidad: number | null;
  profundidadMax: number | null;
};

/**
 * Elegir una posición por partes, como se la busca en la planta:
 * grupo → calle o columna → altura → profundidad (solo penetrables).
 *
 * Una lista con todas las posiciones es interminable y es fácil tocar la de al
 * lado. Por partes, cada paso tiene pocas opciones. Si un paso tiene una sola
 * opción, se elige sola.
 *
 * - `hecha`: marca en verde las posiciones ya resueltas (la carga inicial marca
 *   las relevadas). Una calle o una altura se pinta en verde cuando todo lo que
 *   tiene adentro está hecho.
 * - `grupos`: los grupos son páginas aparte (la carga inicial es por grupo).
 *   Cada uno es un link y el actual queda elegido.
 * - Si la pantalla cambia `valor` desde afuera -pasar a la siguiente
 *   pendiente-, los pasos se acomodan solos a esa posición.
 */
export function SelectorPosicion<P extends PosicionElegible>({
  posiciones,
  valor,
  onCambio,
  deshabilitado = false,
  hecha,
  grupos,
}: {
  posiciones: P[];
  valor: number | null;
  onCambio: (id: number | null) => void;
  deshabilitado?: boolean;
  hecha?: (p: P) => boolean;
  grupos?: Array<{ codigo: string; href: string; actual: boolean; detalle?: string }>;
}) {
  const elegida = posiciones.find((p) => p.id === valor);
  const [rack, setRack] = useState<string | null>(elegida?.rack ?? grupos?.find((g) => g.actual)?.codigo ?? null);
  const [calle, setCalle] = useState<number | null>(elegida?.calle ?? null);
  const [nivel, setNivel] = useState<number | null>(elegida?.nivel ?? null);

  // Cambio de `valor` desde afuera: los pasos siguen a la posición nueva. Se
  // hace al renderizar y no en un efecto para no mostrar un cuadro desfasado.
  const [valorVisto, setValorVisto] = useState(valor);
  if (valor !== valorVisto) {
    setValorVisto(valor);
    if (elegida) {
      setRack(elegida.rack);
      setCalle(elegida.calle);
      setNivel(elegida.nivel);
    }
  }

  const racks = useMemo(() => {
    const m = new Map<string, { rack: string; empresa: string | null; penetrable: boolean }>();
    for (const p of posiciones) {
      if (!m.has(p.rack)) m.set(p.rack, { rack: p.rack, empresa: p.empresa, penetrable: p.penetrable });
    }
    return [...m.values()];
  }, [posiciones]);

  const delRack = posiciones.filter((p) => p.rack === rack);
  const penetrable = delRack[0]?.penetrable ?? false;
  // En el orden en que están en el galpón: numerado al revés, la 01 a la derecha.
  const calles = unicos(delRack.map((p) => p.calle));
  if (delRack[0]?.numeracionInvertida) calles.reverse();
  const deLaCalle = delRack.filter((p) => p.calle === calle);
  const niveles = unicos(deLaCalle.map((p) => p.nivel));
  const delNivel = deLaCalle.filter((p) => p.nivel === nivel);

  const todoHecho = (ps: P[]) => hecha != null && ps.length > 0 && ps.every(hecha);

  /** Avanza al paso siguiente; si tiene una sola opción, la elige sola. */
  function elegirRack(r: string) {
    setRack(r);
    const cs = unicos(posiciones.filter((p) => p.rack === r).map((p) => p.calle));
    elegirCalle(r, cs.length === 1 ? cs[0] : null);
  }
  function elegirCalle(r: string, c: number | null) {
    setCalle(c);
    if (c == null) return elegirNivel(r, null, null);
    const ns = unicos(posiciones.filter((p) => p.rack === r && p.calle === c).map((p) => p.nivel));
    elegirNivel(r, c, ns.length === 1 ? ns[0] : null);
  }
  function elegirNivel(r: string, c: number | null, n: number | null) {
    setNivel(n);
    if (c == null || n == null) return elegir(null);
    const ps = posiciones.filter((p) => p.rack === r && p.calle === c && p.nivel === n);
    // Selectivo: hay una sola posición por columna y nivel.
    // Penetrable: si queda una sola profundidad, también se elige sola.
    elegir(ps.length === 1 ? ps[0].id : null);
  }
  function elegir(id: number | null) {
    // Lo elige el usuario: no hace falta que los pasos se vuelvan a acomodar.
    setValorVisto(id);
    onCambio(id);
  }

  const nivelesTotal = delRack[0]?.niveles ?? 3;
  const profundidadMax = delRack[0]?.profundidadMax ?? 1;

  return (
    <fieldset disabled={deshabilitado} className={`space-y-4 ${deshabilitado ? "opacity-40" : ""}`}>
      <Paso titulo="Grupo">
        {grupos
          ? grupos.map((g) => (
              <Link
                key={g.codigo}
                href={g.href}
                className={`${clasesOpcion(g.actual, false, "min-w-16")} flex flex-col items-center justify-center`}
              >
                <span className="text-base font-bold">{g.codigo}</span>
                {g.detalle && <span className="block text-[11px] font-normal opacity-70">{g.detalle}</span>}
              </Link>
            ))
          : racks.map((r) => (
              <Opcion
                key={r.rack}
                activa={rack === r.rack}
                hecha={todoHecho(posiciones.filter((p) => p.rack === r.rack))}
                onClick={() => elegirRack(r.rack)}
              >
                <span className="text-base font-bold">{r.rack}</span>
                <span className="block text-[11px] font-normal opacity-70">
                  {r.penetrable ? "penetrable" : "selectivo"}
                  {r.empresa ? ` · ${r.empresa}` : ""}
                </span>
              </Opcion>
            ))}
      </Paso>

      {rack && calles.length > 0 && (
        <Paso titulo={penetrable ? "Calle" : "Columna"}>
          {calles.map((c) => (
            <Opcion
              key={c}
              activa={calle === c}
              hecha={todoHecho(delRack.filter((p) => p.calle === c))}
              angosta
              onClick={() => elegirCalle(rack, c)}
            >
              <span className="codigo">{String(c).padStart(2, "0")}</span>
            </Opcion>
          ))}
        </Paso>
      )}

      {rack && calle != null && (
        <Paso titulo="Altura">
          {niveles.map((n) => (
            <Opcion
              key={n}
              activa={nivel === n}
              hecha={todoHecho(deLaCalle.filter((p) => p.nivel === n))}
              onClick={() => elegirNivel(rack, calle, n)}
            >
              <span className="font-bold">{n}</span>
              <span className="block text-[11px] font-normal opacity-70">{nombreDeNivel(n, nivelesTotal)}</span>
            </Opcion>
          ))}
        </Paso>
      )}

      {rack && calle != null && nivel != null && penetrable && (
        <Paso titulo="Profundidad">
          {delNivel
            .slice()
            .sort((a, b) => (a.profundidad ?? 0) - (b.profundidad ?? 0))
            .map((p) => (
              <Opcion key={p.id} activa={valor === p.id} hecha={todoHecho([p])} onClick={() => elegir(p.id)}>
                <span className="font-bold">{p.profundidad}</span>
                <span className="block text-[11px] font-normal opacity-70">
                  {nombreDeProfundidad(p.profundidad ?? 1, profundidadMax)}
                </span>
              </Opcion>
            ))}
        </Paso>
      )}

      {elegida && !deshabilitado && (
        <p className="rounded-xl bg-slate-100 px-4 py-3 text-center">
          <span className="codigo block text-2xl font-bold text-slate-900">{elegida.codigo}</span>
          <span className="text-sm text-slate-600">
            {describirPosicion(elegida).split(" · ")[1]}
            {elegida.empresa ? ` · ${elegida.empresa}` : ""}
          </span>
        </p>
      )}
    </fieldset>
  );
}

function unicos(xs: number[]): number[] {
  return [...new Set(xs)].sort((a, b) => a - b);
}

function Paso({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-slate-500">{titulo}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function clasesOpcion(activa: boolean, hecha: boolean, ancho: string) {
  return `min-h-12 rounded-xl px-3 py-1.5 text-sm font-semibold leading-tight transition ${ancho} ${
    activa
      ? "bg-slate-900 text-white"
      : hecha
        ? "bg-confiable-suave text-confiable ring-1 ring-confiable/40"
        : "bg-white text-slate-700 ring-1 ring-slate-300"
  }`;
}

function Opcion({
  activa,
  hecha = false,
  angosta = false,
  onClick,
  children,
}: {
  activa: boolean;
  hecha?: boolean;
  angosta?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clasesOpcion(activa, hecha, angosta ? "min-w-12" : "min-w-16")}
    >
      {children}
    </button>
  );
}
