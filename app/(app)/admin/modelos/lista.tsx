"use client";

import { useState } from "react";
import { guardarModelo, suspenderModelo } from "@/lib/acciones/admin";
import {
  BotonAccion,
  Campo,
  Formulario,
  Interruptor,
  SelectorEmpresa,
} from "@/components/admin";
import { numero } from "@/lib/formato";
import { HOLGURA_CM } from "@/lib/posiciones";

type Modelo = {
  id: number;
  nombre: string;
  activo: boolean;
  lineaId: number;
  lineaNombre: string;
  empresaId: number | null;
  empresaNombre: string | null;
  unidadPlural: string;
  palet: number | null;
  optimizado: number | null;
  altoPalet: number | null;
  altoOptimizado: number | null;
};

type Edicion = {
  id?: number;
  lineaId: number;
  empresaId: number | null;
  nombre: string;
  activo: boolean;
  palet: string;
  optimizado: string;
  altoPalet: string;
  altoOptimizado: string;
};

export function Modelos({
  modelos,
  lineas,
  empresas,
}: {
  modelos: Modelo[];
  lineas: Array<{ id: number; nombre: string }>;
  empresas: Array<{ id: number; nombre: string; activa: boolean }>;
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
          puedeGuardar={
            editando.nombre.trim().length > 0 && editando.empresaId != null
          }
          alGuardar={() =>
            guardarModelo({
              id: editando.id,
              lineaId: editando.lineaId,
              empresaId: editando.empresaId ?? 0,
              nombre: editando.nombre,
              activo: editando.activo,
              normas: {
                palet: {
                  cantidad: editando.palet ? Number(editando.palet) : null,
                  alturaCm: editando.altoPalet ? Number(editando.altoPalet) : null,
                },
                optimizado: {
                  cantidad: editando.optimizado ? Number(editando.optimizado) : null,
                  alturaCm: editando.altoOptimizado
                    ? Number(editando.altoOptimizado)
                    : null,
                },
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

          <SelectorEmpresa
            empresas={empresas}
            valor={editando.empresaId}
            cambiar={(id) => setEditando({ ...editando, empresaId: id })}
            ayuda="De quién es el producto. Cada palet de este modelo hereda la empresa."
          />

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
            <p className="mt-1 mb-3 text-xs text-slate-500">
              Dejalo vacío si este modelo no se arma en ese packaging. Vacío no
              es cero: significa que el sistema no opina sobre esa cantidad y no
              va a marcar nada como fuera de norma.
            </p>

            <span className="etiqueta">Altura, en centímetros</span>
            <div className="grid grid-cols-2 gap-3">
              <Campo etiqueta="Palet">
                <input
                  className="campo"
                  inputMode="numeric"
                  value={editando.altoPalet}
                  onChange={(e) =>
                    setEditando({
                      ...editando,
                      altoPalet: e.target.value.replace(/\D/g, ""),
                    })
                  }
                  placeholder="180"
                />
              </Campo>
              <Campo etiqueta="Optimizado">
                <input
                  className="campo"
                  inputMode="numeric"
                  value={editando.altoOptimizado}
                  onChange={(e) =>
                    setEditando({
                      ...editando,
                      altoOptimizado: e.target.value.replace(/\D/g, ""),
                    })
                  }
                  placeholder="200"
                />
              </Campo>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Es lo que se compara contra la altura libre del nivel al meter o
              mover, dejando {HOLGURA_CM} cm de aire arriba para que el clark lo
              levante sin chocar: un palet de 1,30 m necesita un hueco de 1,40 m.
              Sin medir, no se valida nada. El <strong>suelto</strong> no
              lleva altura: no hay dos sueltos iguales.
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
              empresaId: empresas.length === 1 ? empresas[0].id : null,
              nombre: "",
              activo: true,
              palet: "",
              optimizado: "",
              altoPalet: "",
              altoOptimizado: "",
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
                      {m.empresaNombre ? (
                        <span className="ml-2 chip bg-slate-100 text-slate-600">
                          {m.empresaNombre}
                        </span>
                      ) : (
                        <span className="ml-2 chip bg-amber-100 text-amber-900">
                          sin empresa
                        </span>
                      )}
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
                          {(m.altoPalet != null || m.altoOptimizado != null) && (
                            <>
                              {" · "}
                              alto{" "}
                              {[m.altoPalet, m.altoOptimizado]
                                .filter((a): a is number => a != null)
                                .map((a) => `${(a / 100).toFixed(2).replace(".", ",")} m`)
                                .join(" / ")}
                            </>
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
                          empresaId: m.empresaId,
                          nombre: m.nombre,
                          activo: m.activo,
                          palet: m.palet != null ? String(m.palet) : "",
                          optimizado:
                            m.optimizado != null ? String(m.optimizado) : "",
                          altoPalet:
                            m.altoPalet != null ? String(m.altoPalet) : "",
                          altoOptimizado:
                            m.altoOptimizado != null
                              ? String(m.altoOptimizado)
                              : "",
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
