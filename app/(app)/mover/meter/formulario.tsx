"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { meter } from "@/lib/acciones/flujo";
import { useAccion } from "@/components/usar-accion";
import { Aviso } from "@/components/ui";
import { validarComposicion } from "@/lib/bultos";
import { ETIQUETA_PACKAGING, PACKAGINGS, numero } from "@/lib/formato";
import type { ModeloParaCargar, PosicionLibre } from "@/lib/consultas";
import type { Packaging } from "@/lib/db/schema";

export function FormularioMeter({
  modelos,
  posiciones,
}: {
  modelos: ModeloParaCargar[];
  posiciones: PosicionLibre[];
}) {
  const router = useRouter();
  const { ejecutar, enviando, error, setError, limpiar } = useAccion();

  const [packaging, setPackaging] = useState<Packaging>("palet");
  const [lineas, setLineas] = useState<Array<{ modeloId: number; cantidad: string }>>(
    [],
  );
  const [posicionId, setPosicionId] = useState<number | null>(null);
  const [sinUbicar, setSinUbicar] = useState(false);
  const [nota, setNota] = useState("");

  const porId = useMemo(
    () => new Map(modelos.map((m) => [m.id, m])),
    [modelos],
  );

  const contenido = lineas
    .map((l) => ({ modeloId: l.modeloId, cantidad: Number(l.cantidad) }))
    .filter((l) => Number.isFinite(l.cantidad) && l.cantidad > 0);

  const problema =
    contenido.length > 0 ? validarComposicion(packaging, contenido) : null;

  const unidad = lineas[0] ? porId.get(lineas[0].modeloId)?.unidadPlural : null;
  const total = contenido.reduce((s, l) => s + l.cantidad, 0);

  /**
   * Al elegir el modelo, la cantidad viene puesta con la norma. Es el caso
   * típico y tiene que salir en un toque; la excepción se escribe a mano, y
   * ahí abajo la pantalla avisa que está fuera de norma.
   */
  function agregar(modeloId: number) {
    const m = porId.get(modeloId);
    const norma = m?.normas[packaging];
    setLineas((l) =>
      l.some((x) => x.modeloId === modeloId)
        ? l
        : [...l, { modeloId, cantidad: norma != null ? String(norma) : "" }],
    );
    setError(null);
  }

  function cambiarPackaging(p: Packaging) {
    setPackaging(p);
    // Las normas son por packaging: al cambiarlo, las cantidades que venían de
    // la norma vieja dejan de tener sentido.
    setLineas((l) =>
      l.map((x) => {
        const norma = porId.get(x.modeloId)?.normas[p];
        return { ...x, cantidad: norma != null ? String(norma) : x.cantidad };
      }),
    );
  }

  const fueraDeNorma = lineas.some((l) => {
    const norma = porId.get(l.modeloId)?.normas[packaging];
    return norma != null && Number(l.cantidad) !== norma;
  });

  const listo = contenido.length > 0 && !problema && (posicionId != null || sinUbicar);

  async function guardar() {
    limpiar();
    await ejecutar(
      () =>
        meter({
          contenido,
          packaging,
          posicionId: sinUbicar ? null : posicionId,
          nota: nota.trim() || undefined,
        }),
      (datos) => {
        router.push(
          `/mover?q=${encodeURIComponent(datos.codigo)}`,
        );
        router.refresh();
      },
    );
  }

  const porLinea = new Map<string, ModeloParaCargar[]>();
  for (const m of modelos) {
    porLinea.set(m.lineaNombre, [...(porLinea.get(m.lineaNombre) ?? []), m]);
  }

  return (
    <div className="space-y-4">
      {error && <Aviso>{error}</Aviso>}

      <div className="tarjeta p-5">
        <span className="etiqueta">Packaging</span>
        <div className="grid grid-cols-3 gap-2">
          {PACKAGINGS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => cambiarPackaging(p)}
              className={`min-h-12 rounded-xl text-sm font-semibold transition ${
                packaging === p
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-700 ring-1 ring-slate-300"
              }`}
            >
              {ETIQUETA_PACKAGING[p]}
            </button>
          ))}
        </div>
      </div>

      <div className="tarjeta p-5">
        <span className="etiqueta">Qué lleva</span>

        {lineas.length === 0 && (
          <p className="mb-3 text-sm text-slate-500">
            Tocá un modelo. La cantidad viene con la norma puesta.
          </p>
        )}

        <ul className="mb-3 space-y-2">
          {lineas.map((l) => {
            const m = porId.get(l.modeloId)!;
            const norma = m.normas[packaging];
            const distinto = norma != null && Number(l.cantidad) !== norma;
            return (
              <li key={l.modeloId} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">
                  {m.nombre}
                  {distinto && (
                    <span className="ml-2 chip bg-amber-100 text-amber-900">
                      norma {numero(norma!)}
                    </span>
                  )}
                </span>
                <input
                  className="campo w-24 text-right"
                  inputMode="numeric"
                  value={l.cantidad}
                  onChange={(e) =>
                    setLineas((ls) =>
                      ls.map((x) =>
                        x.modeloId === l.modeloId
                          ? { ...x, cantidad: e.target.value.replace(/\D/g, "") }
                          : x,
                      ),
                    )
                  }
                  aria-label={`Cantidad de ${m.nombre}`}
                />
                <button
                  type="button"
                  className="px-2 text-lg text-slate-400"
                  onClick={() =>
                    setLineas((ls) => ls.filter((x) => x.modeloId !== l.modeloId))
                  }
                  aria-label={`Quitar ${m.nombre}`}
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>

        <div className="space-y-2">
          {[...porLinea.entries()].map(([linea, suyos]) => (
            <div key={linea}>
              <p className="mb-1 text-xs font-medium text-slate-400">{linea}</p>
              <div className="flex flex-wrap gap-1.5">
                {suyos.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => agregar(m.id)}
                    disabled={lineas.some((l) => l.modeloId === m.id)}
                    className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-40"
                  >
                    {m.nombre}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {problema && (
          <div className="mt-3">
            <Aviso tono="info">{problema}</Aviso>
          </div>
        )}
      </div>

      <div className="tarjeta p-5">
        <span className="etiqueta">Dónde va</span>

        {posiciones.length === 0 ? (
          <Aviso tono="info">
            No hay ninguna posición con lugar. Podés meterlo sin ubicar.
          </Aviso>
        ) : (
          <select
            className="campo"
            value={sinUbicar ? "" : (posicionId ?? "")}
            disabled={sinUbicar}
            onChange={(e) =>
              setPosicionId(e.target.value ? Number(e.target.value) : null)
            }
          >
            <option value="">Elegí una posición…</option>
            {posiciones.map((p) => (
              <option key={p.id} value={p.id}>
                {p.codigo}
                {p.penetrable ? ` · penetrable, ${p.libres} libre${p.libres === 1 ? "" : "s"}` : ""}
              </option>
            ))}
          </select>
        )}

        <label className="mt-3 flex items-start gap-2.5 text-sm text-slate-700">
          <input
            type="checkbox"
            className="mt-0.5 h-5 w-5"
            checked={sinUbicar}
            onChange={(e) => setSinUbicar(e.target.checked)}
          />
          <span>
            <strong>Sin ubicar</strong> — no hay lugar, o el que hay está
            reservado.
            <span className="block text-xs text-slate-500">
              Cuenta como stock igual, pero no se puede chequear hasta que
              tenga posición.
            </span>
          </span>
        </label>
      </div>

      <div className="tarjeta p-5">
        <label className="etiqueta" htmlFor="nota">
          Nota (opcional)
        </label>
        <input
          id="nota"
          className="campo"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Algo que haga falta aclarar"
        />
      </div>

      {/**
       * La confirmación con el número grande solo aparece cuando hay algo raro:
       * fuera de norma o sin ubicar. El caso típico no pregunta, porque una
       * confirmación en cada movimiento se termina tocando sin leer.
       */}
      {listo && (fueraDeNorma || sinUbicar) && (
        <Aviso tono="info">
          Vas a meter <strong>{numero(total)} {unidad}</strong> en{" "}
          {ETIQUETA_PACKAGING[packaging].toLowerCase()}
          {fueraDeNorma && <> , con una cantidad distinta a la norma</>}
          {sinUbicar && <> , sin ubicación asignada</>}.
        </Aviso>
      )}

      <button
        type="button"
        className="boton-primario w-full"
        disabled={!listo || enviando}
        onClick={() => void guardar()}
      >
        {enviando
          ? "Guardando…"
          : listo
            ? `Meter ${numero(total)} ${unidad ?? ""}`.trim()
            : "Meter al rack"}
      </button>
    </div>
  );
}
