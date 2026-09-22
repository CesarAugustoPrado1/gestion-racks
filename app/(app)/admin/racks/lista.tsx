"use client";

import { useState } from "react";
import { guardarAlturaNivel, guardarGrupo } from "@/lib/acciones/admin";
import { Campo, Formulario, Interruptor } from "@/components/admin";
import { useAccion } from "@/components/usar-accion";
import { Aviso } from "@/components/ui";
import { useRouter } from "next/navigation";
import {
  cuantasPosiciones,
  describirGeometria,
  nombreDeNivel,
  type TipoGrupo,
} from "@/lib/posiciones";

type Grupo = {
  id: number;
  codigo: string;
  nombre: string | null;
  accesibilidad: TipoGrupo;
  ancho: number | null;
  niveles: number;
  profundidad: number | null;
  unidades: number;
  activo: boolean;
  posiciones: number;
  ocupadas: number;
};

type Nivel = { grupoId: number; nivel: number; alturaMaxCm: number | null };

type Edicion = {
  id?: number;
  codigo: string;
  nombre: string;
  accesibilidad: TipoGrupo;
  ancho: string;
  niveles: string;
  profundidad: string;
  unidades: string;
  activo: boolean;
};

const NUEVO: Edicion = {
  codigo: "",
  nombre: "",
  accesibilidad: "selectivo",
  ancho: "2",
  niveles: "3",
  profundidad: "2",
  unidades: "",
  activo: true,
};

export function Grupos({
  grupos,
  niveles,
}: {
  grupos: Grupo[];
  niveles: Nivel[];
}) {
  const [editando, setEditando] = useState<Edicion | null>(null);

  return (
    <div className="space-y-3">
      {editando && (
        <FormularioGrupo
          edicion={editando}
          cambiar={setEditando}
          cerrar={() => setEditando(null)}
        />
      )}

      {!editando && (
        <button
          type="button"
          className="boton-primario w-full"
          onClick={() => setEditando({ ...NUEVO })}
        >
          + Grupo nuevo
        </button>
      )}

      <ul className="space-y-2">
        {grupos.map((g) => (
          <li key={g.id} className="tarjeta p-4">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-base font-bold text-slate-900">
                  Grupo {g.codigo}
                  <span className="ml-2 chip bg-slate-100 text-slate-600">
                    {g.accesibilidad}
                  </span>
                  {!g.activo && (
                    <span className="ml-2 chip bg-slate-100 text-slate-500">
                      suspendido
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-500">
                  {g.nombre ? `${g.nombre} · ` : ""}
                  {describirGeometria({ ...g, tipo: g.accesibilidad })}
                </p>
                <p className="text-xs text-slate-500">
                  {g.posiciones} posiciones · {g.ocupadas} ocupadas
                </p>
              </div>
              <button
                type="button"
                className="boton-secundario shrink-0 text-sm"
                onClick={() =>
                  setEditando({
                    id: g.id,
                    codigo: g.codigo,
                    nombre: g.nombre ?? "",
                    accesibilidad: g.accesibilidad,
                    ancho: String(g.ancho ?? 2),
                    niveles: String(g.niveles),
                    profundidad: String(g.profundidad ?? 2),
                    unidades: String(g.unidades),
                    activo: g.activo,
                  })
                }
              >
                Editar
              </button>
            </div>

            <Alturas
              grupo={g}
              niveles={niveles.filter((n) => n.grupoId === g.id)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function FormularioGrupo({
  edicion,
  cambiar,
  cerrar,
}: {
  edicion: Edicion;
  cambiar: (e: Edicion) => void;
  cerrar: () => void;
}) {
  const selectivo = edicion.accesibilidad === "selectivo";
  const geometria = {
    tipo: edicion.accesibilidad,
    ancho: selectivo ? Number(edicion.ancho || 0) : null,
    niveles: Number(edicion.niveles || 0),
    profundidad: selectivo ? null : Number(edicion.profundidad || 0),
    unidades: Number(edicion.unidades || 0),
  };
  const total = cuantasPosiciones(geometria);
  const puede =
    edicion.codigo.trim().length > 0 &&
    geometria.niveles > 0 &&
    geometria.unidades > 0 &&
    (selectivo ? (geometria.ancho ?? 0) > 0 : (geometria.profundidad ?? 0) > 0);

  return (
    <Formulario
      titulo={edicion.id ? `Editar grupo ${edicion.codigo}` : "Grupo nuevo"}
      puedeGuardar={puede}
      textoBoton={edicion.id ? "Guardar" : `Crear con ${total} posiciones`}
      alGuardar={() =>
        guardarGrupo({
          id: edicion.id,
          codigo: edicion.codigo,
          nombre: edicion.nombre || undefined,
          accesibilidad: edicion.accesibilidad,
          ancho: geometria.ancho,
          niveles: geometria.niveles,
          profundidad: geometria.profundidad,
          unidades: geometria.unidades,
          activo: edicion.activo,
        })
      }
      cerrar={cerrar}
    >
      <div className="grid grid-cols-3 gap-3">
        <Campo etiqueta="Código">
          <input
            className="campo uppercase"
            value={edicion.codigo}
            onChange={(e) => cambiar({ ...edicion, codigo: e.target.value })}
            placeholder="B"
          />
        </Campo>
        <div className="col-span-2">
          <Campo etiqueta="Nombre (opcional)">
            <input
              className="campo"
              value={edicion.nombre}
              onChange={(e) => cambiar({ ...edicion, nombre: e.target.value })}
              placeholder="Penetrable del fondo"
            />
          </Campo>
        </div>
      </div>

      <div>
        <span className="etiqueta">Tipo</span>
        <div className="grid grid-cols-2 gap-2">
          {(["selectivo", "penetrable"] as const).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => cambiar({ ...edicion, accesibilidad: a })}
              className={`min-h-12 rounded-xl text-sm font-semibold capitalize ${
                edicion.accesibilidad === a
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-700 ring-1 ring-slate-300"
              }`}
            >
              {a}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-slate-500">
          En un <strong>penetrable</strong> el clark entra por adentro de la
          calle: el palet del piso le corta el paso a los de arriba, y el sistema
          lo va a impedir.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {selectivo ? (
          <Campo etiqueta="Ancho">
            <input
              className="campo"
              inputMode="numeric"
              value={edicion.ancho}
              onChange={(e) =>
                cambiar({ ...edicion, ancho: e.target.value.replace(/\D/g, "") })
              }
            />
          </Campo>
        ) : (
          <Campo etiqueta="Profundidad">
            <input
              className="campo"
              inputMode="numeric"
              value={edicion.profundidad}
              onChange={(e) =>
                cambiar({
                  ...edicion,
                  profundidad: e.target.value.replace(/\D/g, ""),
                })
              }
            />
          </Campo>
        )}
        <Campo etiqueta="Niveles">
          <input
            className="campo"
            inputMode="numeric"
            value={edicion.niveles}
            onChange={(e) =>
              cambiar({ ...edicion, niveles: e.target.value.replace(/\D/g, "") })
            }
          />
        </Campo>
        <Campo etiqueta={selectivo ? "Módulos" : "Calles"}>
          <input
            className="campo"
            inputMode="numeric"
            value={edicion.unidades}
            onChange={(e) =>
              cambiar({ ...edicion, unidades: e.target.value.replace(/\D/g, "") })
            }
            placeholder="15"
          />
        </Campo>
      </div>

      {puede && (
        <Aviso tono="info">
          {describirGeometria(geometria)} = <strong>{total} posiciones</strong>.
          {edicion.id && " Las que ya existen no se tocan; solo se agregan las que falten."}
        </Aviso>
      )}

      <Interruptor
        valor={edicion.activo}
        cambiar={(v) => cambiar({ ...edicion, activo: v })}
        etiqueta="Activo"
      />
    </Formulario>
  );
}

/**
 * La altura libre de cada nivel, editable en la misma fila del grupo.
 *
 * Sin medir no se valida nada, y por eso el estado vacío se muestra: es la
 * diferencia entre "acá entra un optimizado" y "nadie lo midió todavía".
 */
function Alturas({ grupo, niveles }: { grupo: Grupo; niveles: Nivel[] }) {
  const router = useRouter();
  const { ejecutar, enviando, error } = useAccion();
  const [valores, setValores] = useState<Record<number, string>>(
    Object.fromEntries(
      niveles.map((n) => [n.nivel, n.alturaMaxCm != null ? String(n.alturaMaxCm) : ""]),
    ),
  );

  if (niveles.length === 0) return null;

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <p className="mb-2 text-xs font-semibold text-slate-500">
        Altura libre por nivel, en cm
      </p>
      {error && <Aviso>{error}</Aviso>}
      <ul className="space-y-1.5">
        {[...niveles]
          .sort((a, b) => b.nivel - a.nivel)
          .map((n) => (
            <li key={n.nivel} className="flex items-center gap-2">
              <span className="w-24 text-sm text-slate-600">
                {nombreDeNivel(n.nivel, grupo.niveles)}
              </span>
              <input
                className="campo w-24 text-right"
                inputMode="numeric"
                value={valores[n.nivel] ?? ""}
                placeholder="sin medir"
                disabled={enviando}
                onChange={(e) =>
                  setValores((v) => ({
                    ...v,
                    [n.nivel]: e.target.value.replace(/\D/g, ""),
                  }))
                }
                onBlur={() => {
                  const antes = n.alturaMaxCm != null ? String(n.alturaMaxCm) : "";
                  const ahora = valores[n.nivel] ?? "";
                  if (ahora === antes) return;
                  void ejecutar(
                    () =>
                      guardarAlturaNivel(
                        grupo.id,
                        n.nivel,
                        ahora ? Number(ahora) : null,
                      ),
                    () => router.refresh(),
                  );
                }}
                aria-label={`Altura del nivel ${n.nivel} del grupo ${grupo.codigo}`}
              />
              {valores[n.nivel] && (
                <span className="text-xs text-slate-400">
                  {(Number(valores[n.nivel]) / 100).toFixed(2).replace(".", ",")} m
                </span>
              )}
            </li>
          ))}
      </ul>
    </div>
  );
}
