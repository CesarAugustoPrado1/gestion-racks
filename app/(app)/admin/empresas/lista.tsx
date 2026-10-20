"use client";

import { useState } from "react";
import { guardarEmpresa } from "@/lib/acciones/admin";
import { Campo, Formulario, Interruptor } from "@/components/admin";

type Empresa = {
  id: number;
  nombre: string;
  activa: boolean;
  grupos: number;
  modelos: number;
};

const VACIA = { id: undefined as number | undefined, nombre: "", activa: true };

export function Empresas({ empresas }: { empresas: Empresa[] }) {
  const [editando, setEditando] = useState<typeof VACIA | null>(null);

  return (
    <div className="space-y-3">
      {editando && (
        <Formulario
          titulo={editando.id ? "Editar empresa" : "Empresa nueva"}
          puedeGuardar={editando.nombre.trim().length > 0}
          alGuardar={() => guardarEmpresa(editando)}
          cerrar={() => setEditando(null)}
        >
          <Campo etiqueta="Nombre">
            <input
              className="campo"
              value={editando.nombre}
              onChange={(e) => setEditando({ ...editando, nombre: e.target.value })}
              placeholder="Pirka"
            />
          </Campo>
          <Interruptor
            valor={editando.activa}
            cambiar={(v) => setEditando({ ...editando, activa: v })}
            etiqueta="Activa"
            ayuda="Una empresa apagada no se ofrece para grupos ni modelos nuevos. Lo que ya tiene asignado la sigue mostrando."
          />
        </Formulario>
      )}

      {!editando && (
        <button
          type="button"
          className="boton-primario w-full"
          onClick={() => setEditando({ ...VACIA })}
        >
          + Empresa nueva
        </button>
      )}

      <ul className="space-y-2">
        {empresas.map((e) => (
          <li key={e.id} className="tarjeta flex items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="text-base font-bold text-slate-900">
                {e.nombre}
                {!e.activa && (
                  <span className="ml-2 chip bg-slate-100 text-slate-500">apagada</span>
                )}
              </p>
              <p className="text-xs text-slate-500">
                {e.grupos} grupo{e.grupos === 1 ? "" : "s"} de racks · {e.modelos} modelo
                {e.modelos === 1 ? "" : "s"}
              </p>
            </div>
            <button
              type="button"
              className="boton-secundario text-sm"
              onClick={() => setEditando({ id: e.id, nombre: e.nombre, activa: e.activa })}
            >
              Editar
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
