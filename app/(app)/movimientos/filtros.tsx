"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Valores = {
  desde?: string;
  hasta?: string;
  tipo?: string;
  modelo?: string;
  usuario?: string;
  q?: string;
  anulados?: string;
};

const TIPOS = [
  { id: "meter", etiqueta: "Metió" },
  { id: "sacar", etiqueta: "Sacó" },
  { id: "mover", etiqueta: "Movió" },
  { id: "ajuste", etiqueta: "Ajustó" },
];

const dia = (atras: number) =>
  new Date(Date.now() - atras * 86400000).toISOString().slice(0, 10);

/**
 * Los filtros viven en la URL, no en estado del cliente.
 *
 * Así un filtro se comparte por WhatsApp y se vuelve con el botón de atrás, y
 * el CSV se baja con exactamente lo que se está viendo: el botón de descargar
 * lleva los mismos parámetros que la pantalla.
 */
export function Filtros({
  actual,
  opciones,
}: {
  actual: Valores;
  opciones: {
    usuarios: Array<{ id: number; nombre: string }>;
    modelos: Array<{ id: number; nombre: string; linea: string }>;
  };
}) {
  const router = useRouter();
  const [v, setV] = useState<Valores>(actual);
  const [abierto, setAbierto] = useState(false);

  function aplicar(cambios: Valores) {
    const nuevos = { ...v, ...cambios };
    setV(nuevos);
    const q = new URLSearchParams(
      Object.entries(nuevos).filter(([, val]) => val) as [string, string][],
    );
    router.push(q.toString() ? `/movimientos?${q}` : "/movimientos");
  }

  const hayFiltros = Object.values(v).some(Boolean);

  const porLinea = new Map<string, typeof opciones.modelos>();
  for (const m of opciones.modelos) {
    porLinea.set(m.linea, [...(porLinea.get(m.linea) ?? []), m]);
  }

  return (
    <div className="tarjeta space-y-3 p-4">
      {/* Los presets van primero: "los últimos 7 días" es lo que se pide nueve
          de cada diez veces, y nadie debería pelear con dos calendarios. */}
      <div className="flex flex-wrap gap-1.5">
        {[
          { etiqueta: "Hoy", desde: dia(0) },
          { etiqueta: "7 días", desde: dia(7) },
          { etiqueta: "30 días", desde: dia(30) },
          { etiqueta: "Todo", desde: "" },
        ].map((p) => (
          <button
            key={p.etiqueta}
            type="button"
            onClick={() => aplicar({ desde: p.desde, hasta: "" })}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              (v.desde ?? "") === p.desde && !v.hasta
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-700"
            }`}
          >
            {p.etiqueta}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          className="campo"
          value={v.q ?? ""}
          onChange={(e) => setV({ ...v, q: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && aplicar({})}
          placeholder="Bulto o posición: P-00021, B-07…"
          autoCapitalize="none"
          autoCorrect="off"
        />
        <button
          type="button"
          className="boton-secundario px-4"
          onClick={() => aplicar({})}
        >
          Buscar
        </button>
      </div>

      <div className="flex items-center gap-4">
        <button
          type="button"
          className="text-sm font-medium text-slate-500"
          onClick={() => setAbierto((a) => !a)}
        >
          {abierto ? "Menos filtros" : "Más filtros"}
        </button>
        {hayFiltros && (
          <button
            type="button"
            className="text-sm font-medium text-slate-500 underline"
            onClick={() => {
              setV({});
              router.push("/movimientos");
            }}
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {abierto && (
        <div className="space-y-3 border-t border-slate-100 pt-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="etiqueta">Desde</span>
              <input
                type="date"
                className="campo"
                value={v.desde ?? ""}
                onChange={(e) => aplicar({ desde: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="etiqueta">Hasta</span>
              <input
                type="date"
                className="campo"
                value={v.hasta ?? ""}
                onChange={(e) => aplicar({ hasta: e.target.value })}
              />
            </label>
          </div>

          <label className="block">
            <span className="etiqueta">Movimiento</span>
            <select
              className="campo"
              value={v.tipo ?? ""}
              onChange={(e) => aplicar({ tipo: e.target.value })}
            >
              <option value="">Todos</option>
              {TIPOS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.etiqueta}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="etiqueta">Modelo</span>
            <select
              className="campo"
              value={v.modelo ?? ""}
              onChange={(e) => aplicar({ modelo: e.target.value })}
            >
              <option value="">Todos</option>
              {[...porLinea.entries()].map(([linea, suyos]) => (
                <optgroup key={linea} label={linea}>
                  {suyos.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="etiqueta">Quién</span>
            <select
              className="campo"
              value={v.usuario ?? ""}
              onChange={(e) => aplicar({ usuario: e.target.value })}
            >
              <option value="">Todos</option>
              {opciones.usuarios.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-start gap-2.5 text-sm text-slate-700">
            <input
              type="checkbox"
              className="mt-0.5 h-5 w-5"
              checked={v.anulados === "si"}
              onChange={(e) => aplicar({ anulados: e.target.checked ? "si" : "" })}
            />
            <span>
              <strong>Mostrar los anulados</strong>
              <span className="block text-xs text-slate-500">
                Un movimiento corregido sigue guardado con sus datos originales,
                porque el error también es un dato. No se suma a nada: acá se ve
                marcado.
              </span>
            </span>
          </label>
        </div>
      )}
    </div>
  );
}
