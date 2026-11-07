"use client";

import { useId, useState } from "react";
import type { ModeloParaCargar } from "@/lib/consultas";

/** Para buscar sin que importen mayúsculas ni tildes: "Patagónica" empieza con "pata". */
const normalizar = (t: string) =>
  t
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

/**
 * Elegir un modelo: tipo de producto (la línea: placas, piedras…) y un
 * buscador que deja solo los modelos que EMPIEZAN con lo escrito.
 *
 * Lo usan el ingreso al rack y la carga inicial, para que se elija igual en
 * las dos pantallas. Arranca siempre sin tipo ni texto.
 */
export function ElegirModelo({
  modelos,
  yaElegidos,
  alElegir,
}: {
  modelos: ModeloParaCargar[];
  /** Los que ya están en el bulto: se muestran apagados. */
  yaElegidos: number[];
  alElegir: (m: ModeloParaCargar) => void;
}) {
  const id = useId();
  /** El tipo de producto. `null` = todos. */
  const [lineaId, setLineaId] = useState<number | null>(null);
  const [busqueda, setBusqueda] = useState("");

  // Los tipos de producto, en el orden en que vienen los modelos.
  const tipos = [...new Map(modelos.map((m) => [m.lineaId, m.lineaNombre])).entries()];
  const texto = normalizar(busqueda);
  const visibles = modelos.filter(
    (m) => (lineaId == null || m.lineaId === lineaId) && (texto === "" || normalizar(m.nombre).startsWith(texto)),
  );

  return (
    <div className="space-y-4">
      <div>
        <span className="etiqueta">Tipo de producto</span>
        <div className="flex flex-wrap gap-1.5">
          {[[null, "Todos"] as const, ...tipos].map(([lid, nombre]) => (
            <button
              key={lid ?? "todos"}
              type="button"
              onClick={() => setLineaId(lid)}
              className={`min-h-11 rounded-xl px-4 text-sm font-semibold ${
                lineaId === lid ? "bg-slate-900 text-white" : "bg-white text-slate-700 ring-1 ring-slate-300"
              }`}
            >
              {nombre}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="etiqueta" htmlFor={id}>
          Modelo
        </label>
        <input
          id={id}
          className="campo"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Escribí el principio del nombre"
          autoComplete="off"
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {visibles.map((m) => (
            <button
              key={m.id}
              type="button"
              disabled={yaElegidos.includes(m.id)}
              onClick={() => {
                alElegir(m);
                // Elegido el modelo, el buscador vuelve a vacío para el siguiente, si lo hay.
                setBusqueda("");
              }}
              className="min-h-11 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-40"
            >
              {m.nombre}
            </button>
          ))}
          {visibles.length === 0 && (
            <p className="text-sm text-slate-500">Ningún modelo empieza con «{busqueda.trim()}».</p>
          )}
        </div>
      </div>
    </div>
  );
}
