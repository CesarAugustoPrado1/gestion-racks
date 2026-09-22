"use client";

import { useState } from "react";
import {
  generarPosiciones,
  guardarRack,
  suspenderPosicion,
} from "@/lib/acciones/admin";
import { BotonAccion, Campo, Formulario, Interruptor } from "@/components/admin";

type Rack = {
  id: number;
  codigo: string;
  nombre: string | null;
  accesibilidad: "selectivo" | "penetrable";
  activo: boolean;
  posiciones: number;
};

type Posicion = {
  id: number;
  rackId: number;
  codigo: string;
  profundidad: number | null;
  capacidad: number;
  activa: boolean;
  ocupados: number;
};

export function Racks({
  racks,
  posiciones,
}: {
  racks: Rack[];
  posiciones: Posicion[];
}) {
  const [editando, setEditando] = useState<Partial<Rack> | null>(null);
  const [generando, setGenerando] = useState<Rack | null>(null);
  const [abierto, setAbierto] = useState<number | null>(null);

  return (
    <div className="space-y-3">
      {editando && (
        <Formulario
          titulo={editando.id ? "Editar rack" : "Rack nuevo"}
          puedeGuardar={(editando.codigo ?? "").trim().length > 0}
          alGuardar={() =>
            guardarRack({
              id: editando.id,
              codigo: editando.codigo ?? "",
              nombre: editando.nombre ?? undefined,
              accesibilidad: editando.accesibilidad ?? "selectivo",
              activo: editando.activo ?? true,
            })
          }
          cerrar={() => setEditando(null)}
        >
          <div className="grid grid-cols-3 gap-3">
            <Campo etiqueta="Código">
              <input
                className="campo uppercase"
                value={editando.codigo ?? ""}
                onChange={(e) =>
                  setEditando({ ...editando, codigo: e.target.value })
                }
                placeholder="B"
              />
            </Campo>
            <div className="col-span-2">
              <Campo etiqueta="Nombre (opcional)">
                <input
                  className="campo"
                  value={editando.nombre ?? ""}
                  onChange={(e) =>
                    setEditando({ ...editando, nombre: e.target.value })
                  }
                  placeholder="Rack del fondo"
                />
              </Campo>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            El código es el que se dice por handy: las posiciones se van a llamar
            B-1, B-2…
          </p>

          <div>
            <span className="etiqueta">Accesibilidad</span>
            <div className="grid grid-cols-2 gap-2">
              {(["selectivo", "penetrable"] as const).map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setEditando({ ...editando, accesibilidad: a })}
                  className={`min-h-12 rounded-xl text-sm font-semibold capitalize ${
                    (editando.accesibilidad ?? "selectivo") === a
                      ? "bg-slate-900 text-white"
                      : "bg-white text-slate-700 ring-1 ring-slate-300"
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              En un rack <strong>penetrable</strong> cada posición es un carril
              con fondo, y para sacar el de atrás hay que bajar el de adelante.
              El sistema lo va a impedir si no se respeta.
            </p>
          </div>

          <Interruptor
            valor={editando.activo ?? true}
            cambiar={(v) => setEditando({ ...editando, activo: v })}
            etiqueta="Activo"
          />
        </Formulario>
      )}

      {generando && (
        <GenerarPosiciones rack={generando} cerrar={() => setGenerando(null)} />
      )}

      {!editando && !generando && (
        <button
          type="button"
          className="boton-primario w-full"
          onClick={() => setEditando({ accesibilidad: "selectivo", activo: true })}
        >
          + Rack nuevo
        </button>
      )}

      <ul className="space-y-2">
        {racks.map((r) => {
          const suyas = posiciones.filter((p) => p.rackId === r.id);
          const libres = suyas.filter((p) => p.activa && p.ocupados < p.capacidad);
          return (
            <li key={r.id} className="tarjeta p-4">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-base font-bold text-slate-900">
                    Rack {r.codigo}
                    <span className="ml-2 chip bg-slate-100 text-slate-600">
                      {r.accesibilidad}
                    </span>
                    {!r.activo && (
                      <span className="ml-2 chip bg-slate-100 text-slate-500">
                        suspendido
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-slate-500">
                    {r.nombre ? `${r.nombre} · ` : ""}
                    {suyas.length} posicion{suyas.length === 1 ? "" : "es"} ·{" "}
                    {libres.length} con lugar
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <button
                    type="button"
                    className="boton-secundario text-sm"
                    onClick={() => setEditando(r)}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="boton-secundario text-sm"
                    onClick={() => setGenerando(r)}
                  >
                    Agregar posiciones
                  </button>
                </div>
              </div>

              {suyas.length > 0 && (
                <>
                  <button
                    type="button"
                    className="mt-3 text-sm font-medium text-slate-500"
                    onClick={() => setAbierto(abierto === r.id ? null : r.id)}
                  >
                    {abierto === r.id ? "Ocultar" : "Ver"} posiciones
                  </button>
                  {abierto === r.id && (
                    <ul className="mt-2 divide-y divide-slate-100">
                      {suyas.map((p) => (
                        <li
                          key={p.id}
                          className="flex items-center gap-3 py-2 text-sm"
                        >
                          <span className="codigo w-16 text-slate-900">
                            {r.codigo}-{p.codigo}
                          </span>
                          <span className="min-w-0 flex-1 text-xs text-slate-500">
                            {p.ocupados} de {p.capacidad}
                            {p.profundidad ? ` · fondo ${p.profundidad}` : ""}
                            {!p.activa && " · suspendida"}
                          </span>
                          <BotonAccion
                            accion={() => suspenderPosicion(p.id, !p.activa)}
                          >
                            {p.activa ? "Suspender" : "Reactivar"}
                          </BotonAccion>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Crear las posiciones de a una es media hora de tocar botones para un rack de
 * treinta. Se generan por rango, y las que ya existen se saltean: así se puede
 * volver a correr para ampliar un rack sin tocar lo que ya está.
 */
function GenerarPosiciones({
  rack,
  cerrar,
}: {
  rack: Rack;
  cerrar: () => void;
}) {
  const [desde, setDesde] = useState("1");
  const [hasta, setHasta] = useState("12");
  const [profundidad, setProfundidad] = useState(
    rack.accesibilidad === "penetrable" ? "3" : "",
  );

  const d = Number(desde);
  const h = Number(hasta);
  const cuantas = h >= d ? h - d + 1 : 0;

  return (
    <Formulario
      titulo={`Posiciones del rack ${rack.codigo}`}
      puedeGuardar={cuantas > 0}
      textoBoton={`Crear ${cuantas}`}
      alGuardar={() =>
        generarPosiciones({
          rackId: rack.id,
          desde: d,
          hasta: h,
          profundidad: profundidad ? Number(profundidad) : null,
        })
      }
      cerrar={cerrar}
    >
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Desde">
          <input
            className="campo"
            inputMode="numeric"
            value={desde}
            onChange={(e) => setDesde(e.target.value.replace(/\D/g, ""))}
          />
        </Campo>
        <Campo etiqueta="Hasta">
          <input
            className="campo"
            inputMode="numeric"
            value={hasta}
            onChange={(e) => setHasta(e.target.value.replace(/\D/g, ""))}
          />
        </Campo>
      </div>

      {rack.accesibilidad === "penetrable" && (
        <Campo
          etiqueta="Profundidad del carril"
          ayuda="Cuántos bultos entran uno detrás de otro. El primero que entra queda al fondo."
        >
          <input
            className="campo"
            inputMode="numeric"
            value={profundidad}
            onChange={(e) => setProfundidad(e.target.value.replace(/\D/g, ""))}
            placeholder="3"
          />
        </Campo>
      )}

      <p className="text-sm text-slate-600">
        Se van a crear{" "}
        <strong>
          {rack.codigo}-{desde || "?"} a {rack.codigo}-{hasta || "?"}
        </strong>
        . Las que ya existan se saltean.
      </p>
    </Formulario>
  );
}
