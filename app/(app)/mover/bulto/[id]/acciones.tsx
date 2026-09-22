"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { mover, sacar } from "@/lib/acciones/flujo";
import { useAccion } from "@/components/usar-accion";
import { Aviso } from "@/components/ui";
import { ETIQUETA_PACKAGING, numero } from "@/lib/formato";
import type { PosicionLibre } from "@/lib/consultas";
import type { Packaging } from "@/lib/db/schema";

type Bulto = {
  id: number;
  codigo: string;
  packaging: Packaging;
  cantidad: number;
  ubicacion: string | null;
  unidadPlural: string;
};

export function AccionesBulto({
  bulto,
  contenido,
  motivos,
  posiciones,
}: {
  bulto: Bulto;
  contenido: Array<{ modeloId: number; nombre: string; cantidad: number }>;
  motivos: Array<{ id: number; nombre: string; esEgreso: boolean }>;
  posiciones: PosicionLibre[];
}) {
  const [modo, setModo] = useState<"nada" | "sacar" | "mover">("nada");

  return (
    <div className="space-y-3">
      {modo === "nada" && (
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            className="boton-peligro"
            onClick={() => setModo("sacar")}
          >
            Sacar del rack
          </button>
          <button
            type="button"
            className="boton-secundario"
            onClick={() => setModo("mover")}
          >
            Cambiar de lugar
          </button>
        </div>
      )}

      {modo === "sacar" && (
        <Sacar
          bulto={bulto}
          contenido={contenido}
          motivos={motivos}
          cancelar={() => setModo("nada")}
        />
      )}

      {modo === "mover" && (
        <Mover
          bulto={bulto}
          posiciones={posiciones}
          cancelar={() => setModo("nada")}
        />
      )}
    </div>
  );
}

function Sacar({
  bulto,
  contenido,
  motivos,
  cancelar,
}: {
  bulto: Bulto;
  contenido: Array<{ modeloId: number; nombre: string; cantidad: number }>;
  motivos: Array<{ id: number; nombre: string; esEgreso: boolean }>;
  cancelar: () => void;
}) {
  const router = useRouter();
  const { ejecutar, enviando, error, limpiar } = useAccion();
  const [todo, setTodo] = useState(true);
  const [cantidades, setCantidades] = useState<Record<number, string>>(
    Object.fromEntries(contenido.map((c) => [c.modeloId, String(c.cantidad)])),
  );
  const [motivoId, setMotivoId] = useState<number | null>(null);
  const [nota, setNota] = useState("");

  const parcial = contenido
    .map((c) => ({ modeloId: c.modeloId, cantidad: Number(cantidades[c.modeloId] || 0) }))
    .filter((l) => l.cantidad > 0);

  const salen = todo ? bulto.cantidad : parcial.reduce((s, l) => s + l.cantidad, 0);
  const quedan = bulto.cantidad - salen;
  /**
   * La conversión a suelto no se le pregunta al operario: es una consecuencia
   * de la regla comercial, no una decisión de piso. Se le avisa, nada más.
   */
  const seConvierte = quedan > 0 && bulto.packaging !== "suelto";
  const excedido = contenido.some(
    (c) => Number(cantidades[c.modeloId] || 0) > c.cantidad,
  );
  const listo = motivoId != null && salen > 0 && !excedido;

  return (
    <div className="tarjeta space-y-4 p-5">
      <h2 className="text-base font-bold text-slate-900">Sacar del rack</h2>
      {error && <Aviso>{error}</Aviso>}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setTodo(true)}
          className={`min-h-12 rounded-xl text-sm font-semibold ${todo ? "bg-slate-900 text-white" : "bg-white text-slate-700 ring-1 ring-slate-300"}`}
        >
          Todo el bulto
        </button>
        <button
          type="button"
          onClick={() => setTodo(false)}
          className={`min-h-12 rounded-xl text-sm font-semibold ${!todo ? "bg-slate-900 text-white" : "bg-white text-slate-700 ring-1 ring-slate-300"}`}
        >
          Una parte
        </button>
      </div>

      {!todo && (
        <ul className="space-y-2">
          {contenido.map((c) => (
            <li key={c.modeloId} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">
                {c.nombre}
                <span className="ml-1 font-normal text-slate-400">
                  de {numero(c.cantidad)}
                </span>
              </span>
              <input
                className="campo w-24 text-right"
                inputMode="numeric"
                value={cantidades[c.modeloId] ?? ""}
                onChange={(e) =>
                  setCantidades((v) => ({
                    ...v,
                    [c.modeloId]: e.target.value.replace(/\D/g, ""),
                  }))
                }
                aria-label={`Cuánto sale de ${c.nombre}`}
              />
            </li>
          ))}
        </ul>
      )}

      {excedido && <Aviso>No podés sacar más de lo que hay en el bulto.</Aviso>}

      <div>
        <span className="etiqueta">Por qué sale</span>
        <div className="grid gap-2">
          {motivos.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMotivoId(m.id)}
              className={`min-h-12 rounded-xl px-4 text-left text-sm font-semibold ${
                motivoId === m.id
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-700 ring-1 ring-slate-300"
              }`}
            >
              {m.nombre}
              {!m.esEgreso && (
                <span className="ml-2 text-xs font-normal opacity-70">
                  vuelve al rack
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <input
        className="campo"
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        placeholder="Nota (opcional): remito, cliente…"
      />

      {seConvierte && (
        <Aviso tono="info">
          Sacar una parte deja {numero(quedan)} {bulto.unidadPlural}, que ya no
          son un {ETIQUETA_PACKAGING[bulto.packaging].toLowerCase()}: el bulto
          pasa a <strong>suelto</strong>.
        </Aviso>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="boton-secundario" onClick={cancelar}>
          Cancelar
        </button>
        <button
          type="button"
          className="boton-peligro"
          disabled={!listo || enviando}
          onClick={() => {
            limpiar();
            void ejecutar(
              () =>
                sacar({
                  bultoId: bulto.id,
                  motivoId: motivoId!,
                  parcial: todo ? undefined : parcial,
                  nota: nota.trim() || undefined,
                }),
              () => {
                router.push("/mover");
                router.refresh();
              },
            );
          }}
        >
          {enviando ? "Sacando…" : `Sacar ${numero(salen)}`}
        </button>
      </div>
    </div>
  );
}

function Mover({
  bulto,
  posiciones,
  cancelar,
}: {
  bulto: Bulto;
  posiciones: PosicionLibre[];
  cancelar: () => void;
}) {
  const router = useRouter();
  const { ejecutar, enviando, error, limpiar } = useAccion();
  const [posicionId, setPosicionId] = useState<number | null>(null);
  const [alLimbo, setAlLimbo] = useState(false);

  const listo = alLimbo || posicionId != null;

  return (
    <div className="tarjeta space-y-4 p-5">
      <h2 className="text-base font-bold text-slate-900">Cambiar de lugar</h2>
      <p className="text-sm text-slate-500">
        No suma ni resta: el bulto sigue en el rack y sigue disponible.
      </p>
      {error && <Aviso>{error}</Aviso>}

      <select
        className="campo"
        value={alLimbo ? "" : (posicionId ?? "")}
        disabled={alLimbo}
        onChange={(e) =>
          setPosicionId(e.target.value ? Number(e.target.value) : null)
        }
      >
        <option value="">Elegí la posición nueva…</option>
        {posiciones.map((p) => (
          <option key={p.id} value={p.id}>
            {p.codigo}
            {p.penetrable
              ? ` · penetrable, ${p.libres} libre${p.libres === 1 ? "" : "s"}`
              : ""}
          </option>
        ))}
      </select>

      {bulto.ubicacion && (
        <label className="flex items-start gap-2.5 text-sm text-slate-700">
          <input
            type="checkbox"
            className="mt-0.5 h-5 w-5"
            checked={alLimbo}
            onChange={(e) => setAlLimbo(e.target.checked)}
          />
          <span>
            Dejarlo <strong>sin ubicar</strong> — lo bajo del rack pero sigue
            siendo stock.
          </span>
        </label>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="boton-secundario" onClick={cancelar}>
          Cancelar
        </button>
        <button
          type="button"
          className="boton-primario"
          disabled={!listo || enviando}
          onClick={() => {
            limpiar();
            void ejecutar(
              () =>
                mover({
                  bultoId: bulto.id,
                  posicionId: alLimbo ? null : posicionId,
                }),
              () => {
                router.push("/mover");
                router.refresh();
              },
            );
          }}
        >
          {enviando ? "Moviendo…" : "Mover"}
        </button>
      </div>
    </div>
  );
}
