"use client";

import { useState } from "react";
import { destrabar, guardarUsuario } from "@/lib/acciones/admin";
import { BotonAccion, Campo, Formulario, Interruptor } from "@/components/admin";
import { ETIQUETA_ROL, ROLES } from "@/lib/permisos";
import type { Rol } from "@/lib/db/schema";

type Usuario = {
  id: number;
  usuario: string;
  nombre: string;
  rol: string;
  activo: boolean;
  bloqueado: boolean;
};

type Edicion = {
  id?: number;
  usuario: string;
  nombre: string;
  rol: Rol;
  activo: boolean;
  pin: string;
};

export function Usuarios({
  usuarios,
  yo,
}: {
  usuarios: Usuario[];
  yo: number;
}) {
  const [editando, setEditando] = useState<Edicion | null>(null);

  return (
    <div className="space-y-3">
      {editando && (
        <Formulario
          titulo={editando.id ? `Editar ${editando.usuario}` : "Usuario nuevo"}
          puedeGuardar={
            editando.usuario.trim().length >= 3 &&
            editando.nombre.trim().length > 0 &&
            (editando.id ? true : /^\d{4,8}$/.test(editando.pin))
          }
          alGuardar={() => guardarUsuario(editando)}
          cerrar={() => setEditando(null)}
        >
          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta="Usuario">
              <input
                className="campo lowercase"
                value={editando.usuario}
                onChange={(e) =>
                  setEditando({ ...editando, usuario: e.target.value })
                }
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="jperez"
              />
            </Campo>
            <Campo etiqueta="Nombre">
              <input
                className="campo"
                value={editando.nombre}
                onChange={(e) =>
                  setEditando({ ...editando, nombre: e.target.value })
                }
                placeholder="Juan Pérez"
              />
            </Campo>
          </div>

          <Campo etiqueta="Puesto">
            <select
              className="campo"
              value={editando.rol}
              onChange={(e) =>
                setEditando({ ...editando, rol: e.target.value as Rol })
              }
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ETIQUETA_ROL[r]}
                </option>
              ))}
            </select>
          </Campo>

          <Campo
            etiqueta={editando.id ? "PIN nuevo (opcional)" : "PIN"}
            ayuda={
              editando.id
                ? "Dejalo vacío para no cambiarlo. Si lo ponés, se destraba el usuario."
                : "Entre 4 y 8 números. Es lo único que va a tener que recordar."
            }
          >
            <input
              className="campo"
              inputMode="numeric"
              value={editando.pin}
              onChange={(e) =>
                setEditando({ ...editando, pin: e.target.value.replace(/\D/g, "") })
              }
              placeholder="1234"
            />
          </Campo>

          <Interruptor
            valor={editando.activo}
            cambiar={(v) => setEditando({ ...editando, activo: v })}
            etiqueta="Activo"
            ayuda="Dar de baja no borra nada: el historial sigue nombrándolo, pero deja de poder entrar en el próximo request."
          />
        </Formulario>
      )}

      {!editando && (
        <button
          type="button"
          className="boton-primario w-full"
          onClick={() =>
            setEditando({
              usuario: "",
              nombre: "",
              rol: "autoelevador",
              activo: true,
              pin: "",
            })
          }
        >
          + Usuario nuevo
        </button>
      )}

      <ul className="space-y-2">
        {usuarios.map((u) => (
          <li key={u.id} className="tarjeta flex items-start gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="text-base font-bold text-slate-900">
                {u.nombre}
                {u.id === yo && (
                  <span className="ml-2 chip bg-slate-900 text-white">vos</span>
                )}
                {!u.activo && (
                  <span className="ml-2 chip bg-slate-100 text-slate-500">
                    de baja
                  </span>
                )}
                {u.bloqueado && (
                  <span className="ml-2 chip bg-amber-100 text-amber-900">
                    bloqueado
                  </span>
                )}
              </p>
              <p className="text-xs text-slate-500">
                <span className="codigo">{u.usuario}</span> ·{" "}
                {ETIQUETA_ROL[u.rol as Rol]}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <button
                type="button"
                className="boton-secundario text-sm"
                onClick={() =>
                  setEditando({
                    id: u.id,
                    usuario: u.usuario,
                    nombre: u.nombre,
                    rol: u.rol as Rol,
                    activo: u.activo,
                    pin: "",
                  })
                }
              >
                Editar
              </button>
              {u.bloqueado && (
                <BotonAccion accion={() => destrabar(u.id)}>Destrabar</BotonAccion>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
