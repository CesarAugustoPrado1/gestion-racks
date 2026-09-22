"use client";

import { useState } from "react";
import { guardarLinea } from "@/lib/acciones/admin";
import { Campo, Formulario, Interruptor } from "@/components/admin";

type Linea = {
  id: number;
  nombre: string;
  unidadSingular: string;
  unidadPlural: string;
  activa: boolean;
  modelos: number;
};

const VACIA = {
  id: undefined as number | undefined,
  nombre: "",
  unidadSingular: "",
  unidadPlural: "",
  activa: true,
};

export function Lineas({ lineas }: { lineas: Linea[] }) {
  const [editando, setEditando] = useState<typeof VACIA | null>(null);

  return (
    <div className="space-y-3">
      {editando && (
        <Formulario
          titulo={editando.id ? "Editar línea" : "Línea nueva"}
          puedeGuardar={
            editando.nombre.trim().length > 0 &&
            editando.unidadSingular.trim().length > 0 &&
            editando.unidadPlural.trim().length > 0
          }
          alGuardar={() => guardarLinea(editando)}
          cerrar={() => setEditando(null)}
        >
          <Campo etiqueta="Nombre">
            <input
              className="campo"
              value={editando.nombre}
              onChange={(e) => setEditando({ ...editando, nombre: e.target.value })}
              placeholder="Piedras"
            />
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta="Unidad, singular">
              <input
                className="campo"
                value={editando.unidadSingular}
                onChange={(e) =>
                  setEditando({ ...editando, unidadSingular: e.target.value })
                }
                placeholder="paquete"
              />
            </Campo>
            <Campo etiqueta="Unidad, plural">
              <input
                className="campo"
                value={editando.unidadPlural}
                onChange={(e) =>
                  setEditando({ ...editando, unidadPlural: e.target.value })
                }
                placeholder="paquetes"
              />
            </Campo>
          </div>
          <p className="text-xs text-slate-500">
            Es la unidad que van a decir todas las pantallas de esta línea. Si acá
            dice «paquetes», el stock va a decir «224 paquetes».
          </p>
          <Interruptor
            valor={editando.activa}
            cambiar={(v) => setEditando({ ...editando, activa: v })}
            etiqueta="Activa"
            ayuda="Una línea apagada no aparece en stock ni para cargar. Sirve para dejarla preparada antes de empezar a usarla."
          />
        </Formulario>
      )}

      {!editando && (
        <button
          type="button"
          className="boton-primario w-full"
          onClick={() => setEditando({ ...VACIA })}
        >
          + Línea nueva
        </button>
      )}

      <ul className="space-y-2">
        {lineas.map((l) => (
          <li key={l.id} className="tarjeta flex items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="text-base font-bold text-slate-900">
                {l.nombre}
                {!l.activa && (
                  <span className="ml-2 chip bg-slate-100 text-slate-500">
                    apagada
                  </span>
                )}
              </p>
              <p className="text-xs text-slate-500">
                se cuenta en {l.unidadPlural} · {l.modelos} modelo
                {l.modelos === 1 ? "" : "s"}
              </p>
            </div>
            <button
              type="button"
              className="boton-secundario text-sm"
              onClick={() =>
                setEditando({
                  id: l.id,
                  nombre: l.nombre,
                  unidadSingular: l.unidadSingular,
                  unidadPlural: l.unidadPlural,
                  activa: l.activa,
                })
              }
            >
              Editar
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
