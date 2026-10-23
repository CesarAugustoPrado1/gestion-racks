"use client";

import { useMemo, useState } from "react";
import { describirPosicion, nombreDeNivel, nombreDeProfundidad } from "@/lib/posiciones";
import type { PosicionLibre } from "@/lib/consultas";

/**
 * Elegir una posición libre por partes, como se la busca en la planta:
 * grupo → calle o columna → altura → profundidad (solo penetrables).
 *
 * Una lista con todas las posiciones libres es interminable y es fácil tocar
 * la de al lado. Por partes, cada paso tiene pocas opciones y solo se ofrecen
 * las que llevan a una posición libre. Si un paso tiene una sola opción, se
 * elige sola.
 */
export function SelectorPosicion({
  posiciones,
  valor,
  onCambio,
  deshabilitado = false,
}: {
  posiciones: PosicionLibre[];
  valor: number | null;
  onCambio: (id: number | null) => void;
  deshabilitado?: boolean;
}) {
  const elegida = posiciones.find((p) => p.id === valor);
  const [rack, setRack] = useState<string | null>(elegida?.rack ?? null);
  const [calle, setCalle] = useState<number | null>(elegida?.calle ?? null);
  const [nivel, setNivel] = useState<number | null>(elegida?.nivel ?? null);

  const racks = useMemo(() => {
    const m = new Map<string, { rack: string; empresa: string | null; penetrable: boolean; libres: number }>();
    for (const p of posiciones) {
      const r = m.get(p.rack) ?? { rack: p.rack, empresa: p.empresa, penetrable: p.penetrable, libres: 0 };
      r.libres++;
      m.set(p.rack, r);
    }
    return [...m.values()];
  }, [posiciones]);

  const delRack = posiciones.filter((p) => p.rack === rack);
  const penetrable = delRack[0]?.penetrable ?? false;
  const calles = unicos(delRack.map((p) => p.calle));
  const deLaCalle = delRack.filter((p) => p.calle === calle);
  const niveles = unicos(deLaCalle.map((p) => p.nivel));
  const delNivel = deLaCalle.filter((p) => p.nivel === nivel);

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
    if (c == null || n == null) return onCambio(null);
    const ps = posiciones.filter((p) => p.rack === r && p.calle === c && p.nivel === n);
    // Selectivo: hay una sola posición por columna y nivel.
    // Penetrable: si queda una sola profundidad libre, también se elige sola.
    onCambio(ps.length === 1 ? ps[0].id : null);
  }

  const nivelesTotal = delRack[0]?.niveles ?? 3;
  const profundidadMax = delRack[0]?.profundidadMax ?? 1;

  return (
    <fieldset disabled={deshabilitado} className={`space-y-4 ${deshabilitado ? "opacity-40" : ""}`}>
      <Paso titulo="Grupo">
        {racks.map((r) => (
          <Opcion key={r.rack} activa={rack === r.rack} onClick={() => elegirRack(r.rack)}>
            <span className="text-base font-bold">{r.rack}</span>
            <span className="block text-[11px] font-normal opacity-70">
              {r.penetrable ? "penetrable" : "selectivo"}
              {r.empresa ? ` · ${r.empresa}` : ""}
            </span>
          </Opcion>
        ))}
      </Paso>

      {rack && (
        <Paso titulo={penetrable ? "Calle" : "Columna"}>
          {calles.map((c) => (
            <Opcion key={c} activa={calle === c} angosta onClick={() => elegirCalle(rack, c)}>
              <span className="codigo">{String(c).padStart(2, "0")}</span>
            </Opcion>
          ))}
        </Paso>
      )}

      {rack && calle != null && (
        <Paso titulo="Altura">
          {niveles.map((n) => (
            <Opcion key={n} activa={nivel === n} onClick={() => elegirNivel(rack, calle, n)}>
              <span className="font-bold">{n}</span>
              <span className="block text-[11px] font-normal opacity-70">
                {nombreDeNivel(n, nivelesTotal)}
              </span>
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
              <Opcion key={p.id} activa={valor === p.id} onClick={() => onCambio(p.id)}>
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

function Opcion({
  activa,
  angosta = false,
  onClick,
  children,
}: {
  activa: boolean;
  angosta?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-12 rounded-xl px-3 py-1.5 text-sm font-semibold leading-tight transition ${
        angosta ? "min-w-12" : "min-w-16"
      } ${
        activa
          ? "bg-slate-900 text-white"
          : "bg-white text-slate-700 ring-1 ring-slate-300"
      }`}
    >
      {children}
    </button>
  );
}
