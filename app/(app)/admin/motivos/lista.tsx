"use client";

import { useState } from "react";
import { cargarMotivosEstandar, guardarMotivo } from "@/lib/acciones/admin";
import { BotonAccion, Campo, Formulario, Interruptor } from "@/components/admin";
import { Aviso } from "@/components/ui";

type Motivo = {
  id: number;
  nombre: string;
  ambito: "salida" | "ajuste";
  esEgreso: boolean;
  activo: boolean;
};

type Edicion = Omit<Motivo, "id"> & { id?: number };

const TITULO = {
  salida: "Por qué sale del rack",
  ajuste: "Por qué hubo que ajustar",
};

export function Motivos({ motivos }: { motivos: Motivo[] }) {
  const [editando, setEditando] = useState<Edicion | null>(null);

  const salida = motivos.filter((m) => m.ambito === "salida");
  const ajuste = motivos.filter((m) => m.ambito === "ajuste");

  return (
    <div className="space-y-3">
      {motivos.length === 0 && (
        <div className="tarjeta space-y-3 p-5">
          <Aviso tono="info">
            No hay ningún motivo cargado. <strong>Sin motivos no se puede
            sacar nada del rack</strong>, porque el motivo es obligatorio.
          </Aviso>
          <BotonAccion accion={cargarMotivosEstandar} clase="boton-primario">
            Cargar los motivos estándar
          </BotonAccion>
        </div>
      )}

      {editando && (
        <Formulario
          titulo={editando.id ? "Editar motivo" : "Motivo nuevo"}
          puedeGuardar={editando.nombre.trim().length > 0}
          alGuardar={() => guardarMotivo(editando)}
          cerrar={() => setEditando(null)}
        >
          <Campo etiqueta="Nombre">
            <input
              className="campo"
              value={editando.nombre}
              onChange={(e) => setEditando({ ...editando, nombre: e.target.value })}
              placeholder="Entrega a cliente"
            />
          </Campo>

          <div>
            <span className="etiqueta">Cuándo se usa</span>
            <div className="grid grid-cols-2 gap-2">
              {(["salida", "ajuste"] as const).map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setEditando({ ...editando, ambito: a })}
                  className={`min-h-12 rounded-xl px-2 text-sm font-semibold ${
                    editando.ambito === a
                      ? "bg-slate-900 text-white"
                      : "bg-white text-slate-700 ring-1 ring-slate-300"
                  }`}
                >
                  {a === "salida" ? "Al sacar" : "Al corregir"}
                </button>
              ))}
            </div>
          </div>

          {editando.ambito === "salida" && (
            <Interruptor
              valor={editando.esEgreso}
              cambiar={(v) => setEditando({ ...editando, esEgreso: v })}
              etiqueta="El producto se va de la fábrica"
              ayuda="Apagalo si vuelve al rack, como un rearmado. Sin esta distinción, «lo que salió» y «lo que se vendió» serían el mismo número, y no lo son."
            />
          )}

          <Interruptor
            valor={editando.activo}
            cambiar={(v) => setEditando({ ...editando, activo: v })}
            etiqueta="Activo"
            ayuda="Un motivo apagado no se ofrece más, pero el historial que lo usó se sigue leyendo."
          />
        </Formulario>
      )}

      {!editando && (
        <button
          type="button"
          className="boton-primario w-full"
          onClick={() =>
            setEditando({
              nombre: "",
              ambito: "salida",
              esEgreso: true,
              activo: true,
            })
          }
        >
          + Motivo nuevo
        </button>
      )}

      {([
        ["salida", salida],
        ["ajuste", ajuste],
      ] as const).map(([ambito, suyos]) =>
        suyos.length === 0 ? null : (
          <section key={ambito}>
            <h2 className="mt-4 mb-2 text-sm font-semibold text-slate-500">
              {TITULO[ambito]}
            </h2>
            <ul className="space-y-2">
              {suyos.map((m) => (
                <li key={m.id} className="tarjeta flex items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-900">
                      {m.nombre}
                      {!m.activo && (
                        <span className="ml-2 chip bg-slate-100 text-slate-500">
                          apagado
                        </span>
                      )}
                    </p>
                    {m.ambito === "salida" && !m.esEgreso && (
                      <p className="text-xs text-slate-500">
                        vuelve al rack: no cuenta como despacho
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    className="boton-secundario text-sm"
                    onClick={() => setEditando({ ...m })}
                  >
                    Editar
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ),
      )}
    </div>
  );
}
