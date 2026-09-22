"use client";

import { useState } from "react";
import { guardarModelo, suspenderModelo } from "@/lib/acciones/admin";
import { BotonAccion, Campo, Formulario, Interruptor } from "@/components/admin";
import { numero } from "@/lib/formato";

type Modelo = {
  id: number;
  nombre: string;
  activo: boolean;
  lineaId: number;
  lineaNombre: string;
  unidadPlural: string;
  palet: number | null;
  optimizado: number | null;
};

type Edicion = {
  id?: number;
  lineaId: number;
  nombre: string;
  activo: boolean;
  palet: string;
  optimizado: string;
};

export function Modelos({
  modelos,
  lineas,
}: {
  modelos: Modelo[];
  lineas: Array<{ id: number; nombre: string }>;
}) {
  const [editando, setEditando] = useState<Edicion | null>(null);

  const porLinea = new Map<string, Modelo[]>();
  for (const m of modelos) {
    porLinea.set(m.lineaNombre, [...(porLinea.get(m.lineaNombre) ?? []), m]);
  }

  return (
    <div className="space-y-3">
      {editando && (
        <Formulario
          titulo={editando.id ? "Editar modelo" : "Modelo nuevo"}
          puedeGuardar={editando.nombre.trim().length > 0}
          alGuardar={() =>
            guardarModelo({
              id: editando.id,
              lineaId: editando.lineaId,
              nombre: editando.nombre,
              activo: editando.activo,
              normas: {
                palet: editando.palet ? Number(editando.palet) : null,
                optimizado: editando.optimizado ? Number(editando.optimizado) : null,
              },
            })
          }
          cerrar={() => setEditando(null)}
        >
          <Campo etiqueta="Línea">
            <select
              className="campo"
              value={editando.lineaId}
              onChange={(e) =>
                setEditando({ ...editando, lineaId: Number(e.target.value) })
              }
            >
              {lineas.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nombre}
                </option>
              ))}
            </select>
          </Campo>

          <Campo etiqueta="Nombre">
            <input
              className="campo"
              value={editando.nombre}
              onChange={(e) => setEditando({ ...editando, nombre: e.target.value })}
              placeholder="Laja"
            />
          </Campo>

          <div>
            <span className="etiqueta">Cantidad normalizada</span>
            <div className="grid grid-cols-2 gap-3">
              <Campo etiqueta="Por palet">
                <input
                  className="campo"
                  inputMode="numeric"
                  value={editando.palet}
                  onChange={(e) =>
                    setEditando({
                      ...editando,
                      palet: e.target.value.replace(/\D/g, ""),
                    })
                  }
                  placeholder="48"
                />
              </Campo>
              <Campo etiqueta="Por optimizado">
                <input
                  className="campo"
                  inputMode="numeric"
                  value={editando.optimizado}
                  onChange={(e) =>
                    setEditando({
                      ...editando,
                      optimizado: e.target.value.replace(/\D/g, ""),
                    })
                  }
                  placeholder="60"
                />
              </Campo>
            </div>
            {/* El campo vacío produce `null`, no cero. Son cosas distintas y la
                pantalla lo tiene que decir. */}
            <p className="mt-1 text-xs text-slate-500">
              Dejalo vacío si este modelo no se arma en ese packaging. Vacío no
              es cero: significa que el sistema no opina sobre esa cantidad y no
              va a marcar nada como fuera de norma.
            </p>
          </div>

          <Interruptor
            valor={editando.activo}
            cambiar={(v) => setEditando({ ...editando, activo: v })}
            etiqueta="Activo"
          />
        </Formulario>
      )}

      {!editando && (
        <button
          type="button"
          className="boton-primario w-full"
          onClick={() =>
            setEditando({
              lineaId: lineas[0].id,
              nombre: "",
              activo: true,
              palet: "",
              optimizado: "",
            })
          }
        >
          + Modelo nuevo
        </button>
      )}

      {[...porLinea.entries()].map(([linea, suyos]) => (
        <section key={linea}>
          <h2 className="mt-4 mb-2 text-sm font-semibold text-slate-500">{linea}</h2>
          <ul className="space-y-2">
            {suyos.map((m) => (
              <li key={m.id} className="tarjeta p-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-bold text-slate-900">
                      {m.nombre}
                      {!m.activo && (
                        <span className="ml-2 chip bg-slate-100 text-slate-500">
                          suspendido
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-slate-500">
                      {m.palet != null || m.optimizado != null ? (
                        <>
                          {m.palet != null && (
                            <>palet {numero(m.palet)} {m.unidadPlural}</>
                          )}
                          {m.palet != null && m.optimizado != null && " · "}
                          {m.optimizado != null && (
                            <>optimizado {numero(m.optimizado)}</>
                          )}
                        </>
                      ) : (
                        <span className="text-amber-700">
                          sin normas: no se va a poder cargar un palet con
                          cantidad automática
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <button
                      type="button"
                      className="boton-secundario text-sm"
                      onClick={() =>
                        setEditando({
                          id: m.id,
                          lineaId: m.lineaId,
                          nombre: m.nombre,
                          activo: m.activo,
                          palet: m.palet != null ? String(m.palet) : "",
                          optimizado:
                            m.optimizado != null ? String(m.optimizado) : "",
                        })
                      }
                    >
                      Editar
                    </button>
                    <BotonAccion
                      accion={() => suspenderModelo(m.id, !m.activo)}
                      confirmar={m.activo ? "¿Suspender?" : undefined}
                    >
                      {m.activo ? "Suspender" : "Reactivar"}
                    </BotonAccion>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
