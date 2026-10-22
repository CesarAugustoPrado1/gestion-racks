"use client";

import { useState } from "react";
import {
  guardarAlcanceNivel,
  guardarAlturaNivel,
  guardarGrupo,
} from "@/lib/acciones/admin";
import { Campo, Formulario, Interruptor, SelectorEmpresa } from "@/components/admin";
import { useAccion } from "@/components/usar-accion";
import { Aviso } from "@/components/ui";
import { useRouter } from "next/navigation";
import {
  alturaAdmitida,
  HOLGURA_CM,
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
  empresaId: number | null;
  empresaNombre: string | null;
  acceso: "izquierda" | "derecha";
  posiciones: number;
  ocupadas: number;
};

type Nivel = {
  grupoId: number;
  nivel: number;
  alturaMaxCm: number | null;
  alcanzable: boolean;
  /** Bultos ubicados hoy en ese nivel, para avisar al apagar el alcance. */
  ocupadas: number;
};

type Empresa = { id: number; nombre: string; activa: boolean };

type Edicion = {
  id?: number;
  codigo: string;
  nombre: string;
  accesibilidad: TipoGrupo;
  ancho: string;
  niveles: string;
  profundidad: string;
  unidades: string;
  empresaId: number | null;
  acceso: "izquierda" | "derecha";
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
  empresaId: null,
  acceso: "derecha",
  activo: true,
};

export function Grupos({
  grupos,
  niveles,
  empresas,
}: {
  grupos: Grupo[];
  niveles: Nivel[];
  empresas: Empresa[];
}) {
  const [editando, setEditando] = useState<Edicion | null>(null);

  return (
    <div className="space-y-3">
      {editando && (
        <FormularioGrupo
          empresas={empresas}
          edicion={editando}
          cambiar={setEditando}
          cerrar={() => setEditando(null)}
        />
      )}

      {!editando && (
        <button
          type="button"
          className="boton-primario w-full"
          onClick={() =>
            setEditando({
              ...NUEVO,
              empresaId: empresas.length === 1 ? empresas[0].id : null,
            })
          }
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
                  {g.empresaNombre ? (
                    <span className="ml-2 chip bg-slate-100 text-slate-600">
                      {g.empresaNombre}
                    </span>
                  ) : (
                    <span className="ml-2 chip bg-amber-100 text-amber-900">
                      sin empresa
                    </span>
                  )}
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
                    empresaId: g.empresaId,
                    acceso: g.acceso,
                    activo: g.activo,
                  })
                }
              >
                Editar
              </button>
            </div>

            <Niveles
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
  empresas,
  edicion,
  cambiar,
  cerrar,
}: {
  empresas: Empresa[];
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
    edicion.empresaId != null &&
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
          empresaId: edicion.empresaId ?? 0,
          acceso: edicion.acceso,
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

      <SelectorEmpresa
        empresas={empresas}
        valor={edicion.empresaId}
        cambiar={(id) => cambiar({ ...edicion, empresaId: id })}
        ayuda="Un palet de la otra empresa se puede guardar acá igual, pero va a quedar marcado."
      />

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

      {!selectivo && (
        <div>
          <span className="etiqueta">El clark entra a las calles por la</span>
          <div className="grid grid-cols-2 gap-2">
            {(["izquierda", "derecha"] as const).map((lado) => (
              <button
                key={lado}
                type="button"
                onClick={() => cambiar({ ...edicion, acceso: lado })}
                className={`min-h-12 rounded-xl text-sm font-semibold ${
                  edicion.acceso === lado
                    ? "bg-slate-900 text-white"
                    : "bg-white text-slate-700 ring-1 ring-slate-300"
                }`}
              >
                {lado === "izquierda" ? "← Izquierda" : "Derecha →"}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Mirando el grupo desde el pasillo. Es para que la vista en
            perspectiva quede como se ve parado en el galpón.
          </p>
        </div>
      )}

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
 * Cada nivel del grupo: su altura libre y si el clark llega.
 *
 * Las dos cosas en la misma fila porque son la misma pregunta -¿qué entra
 * acá?- y se cargan con la cinta en la mano, parado frente al rack.
 *
 * Sin medir no se valida nada, y por eso el estado vacío se muestra: es la
 * diferencia entre "acá entra un optimizado" y "nadie lo midió todavía".
 */
function Niveles({ grupo, niveles }: { grupo: Grupo; niveles: Nivel[] }) {
  const router = useRouter();
  const { ejecutar, enviando, error } = useAccion();
  const [aviso, setAviso] = useState<string | null>(null);
  /**
   * El alcance cambia en la pantalla AL TOCAR, no cuando vuelve el servidor:
   * con la conexión del galpón, una casilla que tarda dos segundos en marcarse
   * se toca de nuevo, y el segundo toque la desmarca. Si el servidor rechaza,
   * vuelve a como estaba.
   */
  const [alcance, setAlcance] = useState<Record<number, boolean>>(
    Object.fromEntries(niveles.map((n) => [n.nivel, n.alcanzable])),
  );
  const [valores, setValores] = useState<Record<number, string>>(
    Object.fromEntries(
      niveles.map((n) => [n.nivel, n.alturaMaxCm != null ? String(n.alturaMaxCm) : ""]),
    ),
  );

  if (niveles.length === 0) return null;
  const llega = (n: Nivel) => alcance[n.nivel] ?? n.alcanzable;
  const sinAlcance = niveles.filter((n) => !llega(n)).length;

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <p className="mb-2 text-xs font-semibold text-slate-500">
        Niveles: altura libre en cm, y si el clark llega
      </p>
      {error && <Aviso>{error}</Aviso>}
      {aviso && <Aviso tono="advertencia">{aviso}</Aviso>}
      <ul className="space-y-1.5">
        {[...niveles]
          .sort((a, b) => b.nivel - a.nivel)
          .map((n) => (
            <li key={n.nivel} className="flex flex-wrap items-center gap-2">
              <span
                className={`w-24 text-sm ${llega(n) ? "text-slate-600" : "text-slate-400 line-through"}`}
              >
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
              <label className="flex items-center gap-1.5 text-xs text-slate-600">
                <input
                  type="checkbox"
                  className="h-5 w-5"
                  checked={llega(n)}
                  disabled={enviando}
                  onChange={(e) => {
                    const alcanzable = e.target.checked;
                    setAviso(null);
                    setAlcance((a) => ({ ...a, [n.nivel]: alcanzable }));
                    void ejecutar(
                      () => guardarAlcanceNivel(grupo.id, n.nivel, alcanzable),
                      (r) => {
                        if (r.bultosAdentro > 0) {
                          setAviso(
                            `En el nivel ${nombreDeNivel(n.nivel, grupo.niveles)} del grupo ${grupo.codigo} ` +
                              `quedan ${r.bultosAdentro} bulto${r.bultosAdentro === 1 ? "" : "s"}. ` +
                              `Se pueden seguir sacando, pero ya no entra nada nuevo.`,
                          );
                        }
                        router.refresh();
                      },
                    ).then((ok) => {
                      if (!ok) setAlcance((a) => ({ ...a, [n.nivel]: !alcanzable }));
                    });
                  }}
                  aria-label={`El clark llega al nivel ${n.nivel} del grupo ${grupo.codigo}`}
                />
                el clark llega
              </label>
              {valores[n.nivel] && (
                <span className="text-xs text-slate-400">
                  entran hasta{" "}
                  {(alturaAdmitida(Number(valores[n.nivel])) / 100)
                    .toFixed(2)
                    .replace(".", ",")}{" "}
                  m
                </span>
              )}
            </li>
          ))}
      </ul>
      <p className="mt-2 text-xs text-slate-500">
        La altura es la del hueco, de larguero a larguero. Al bulto se le exigen{" "}
        {HOLGURA_CM} cm de aire arriba para que el clark lo pueda levantar y
        entrar sin chocar.
      </p>
      {sinAlcance > 0 && (
        <p className="mt-2 text-xs text-slate-500">
          {sinAlcance === 1 ? "Un nivel" : `${sinAlcance} niveles`} sin alcance:
          no se ofrece{sinAlcance === 1 ? "" : "n"} como destino ni cuenta
          {sinAlcance === 1 ? "" : "n"} como lugar libre.
        </p>
      )}
    </div>
  );
}
