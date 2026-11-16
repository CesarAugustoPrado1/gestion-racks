"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { guardarModelo, pasarNoNormalizadosASuelto, suspenderModelo } from "@/lib/acciones/admin";
import { useAccion } from "@/components/usar-accion";
import { Aviso } from "@/components/ui";
import { ETIQUETA_PACKAGING } from "@/lib/formato";
import {
  BotonAccion,
  Campo,
  Formulario,
  Interruptor,
  SelectorEmpresa,
} from "@/components/admin";
import { leerDecimal, numero } from "@/lib/formato";

type Modelo = {
  id: number;
  nombre: string;
  activo: boolean;
  lineaId: number;
  lineaNombre: string;
  empresaId: number | null;
  empresaNombre: string | null;
  unidadPlural: string;
  unidadSingular: string;
  m2: number | null;
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
  m2: string;
  palet: string;
  optimizado: string;
  altoPalet: string;
  altoOptimizado: string;
};

/** Un palet u optimizado cargado con una cantidad que no es la normalizada. */
export type NoNormalizado = {
  id: number;
  codigo: string;
  packaging: string;
  cantidad: number;
  modelo: string;
  norma: number | null;
  posicion: string | null;
};

export function Modelos({
  modelos,
  lineas,
  empresas,
  noNormalizados,
}: {
  noNormalizados: NoNormalizado[];
  modelos: Modelo[];
  lineas: Array<{ id: number; nombre: string }>;
  empresas: Array<{ id: number; nombre: string; activa: boolean }>;
}) {
  const [editando, setEditando] = useState<Edicion | null>(null);
  /**
   * Las cantidades con las que ya se avisó que hay bultos que pasan a suelto.
   * Guardar de nuevo SIN tocarlas es la confirmación; si las cambia, se vuelve
   * a preguntar con el número nuevo.
   */
  const [avisado, setAvisado] = useState<string | null>(null);
  const cantidades = editando ? `${editando.id}|${editando.palet}|${editando.optimizado}` : null;

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
            editando.nombre.trim().length > 0 &&
            editando.empresaId != null &&
            (editando.m2.trim() === "" || (leerDecimal(editando.m2) ?? 0) > 0)
          }
          alGuardar={async () => {
            const r = await guardarModelo(
              {
                id: editando.id,
                lineaId: editando.lineaId,
                empresaId: editando.empresaId ?? 0,
                nombre: editando.nombre,
                activo: editando.activo,
                m2PorUnidad: leerDecimal(editando.m2),
                normas: {
                  palet: {
                    cantidad: editando.palet ? Number(editando.palet) : null,
                    alturaCm: editando.altoPalet ? Number(editando.altoPalet) : null,
                  },
                  optimizado: {
                    cantidad: editando.optimizado ? Number(editando.optimizado) : null,
                    alturaCm: editando.altoOptimizado ? Number(editando.altoOptimizado) : null,
                  },
                },
              },
              avisado === cantidades,
            );
            if (r.ok && r.datos.porConfirmar > 0) {
              const n = r.datos.porConfirmar;
              setAvisado(cantidades);
              return {
                ok: false as const,
                error:
                  `TODAVÍA NO SE GUARDÓ. Hay ${n} bulto${n === 1 ? "" : "s"} de este modelo cargado${n === 1 ? "" : "s"} como palet u optimizado ` +
                  `que con estas cantidades deja${n === 1 ? "" : "n"} de ser normalizado${n === 1 ? "" : "s"}: ` +
                  `pasa${n === 1 ? "" : "n"} a suelto, con la cantidad y el lugar que tiene${n === 1 ? "" : "n"}. ` +
                  `Si es lo que querés, tocá Guardar otra vez.`,
              };
            }
            return r;
          }}
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

          <Campo etiqueta="m² por unidad">
            <input
              className="campo"
              inputMode="decimal"
              value={editando.m2}
              onChange={(e) => setEditando({ ...editando, m2: e.target.value.replace(/[^\d.,]/g, "") })}
              placeholder="2,88"
            />
            <p className="mt-1 text-xs text-slate-500">
              Cuántos m² cubre una unidad: una placa de 1,20 × 2,40 son 2,88. Con esto el stock se ve también en m²,
              que sí se suman entre líneas. Vacío = sin medir: el modelo queda afuera de las cuentas de m².
            </p>
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
              Es fija: quien carga un palet no la puede cambiar, y lo que tenga
              otra cantidad se carga como suelto. Dejalo vacío si este modelo
              no se arma en ese packaging: no se va a poder cargar así.
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
              mover, más el aire que pida cada grupo (se configura en Racks).
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

      {!editando && <FueraDeNorma bultos={noNormalizados} />}

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
              m2: "",
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
                      {m.m2 != null ? (
                        <>
                          {String(m.m2).replace(".", ",")} m² por {m.unidadSingular}
                        </>
                      ) : (
                        <span className="text-amber-700">sin m² por unidad: no entra en las cuentas de m²</span>
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
                          m2: m.m2 != null ? String(m.m2).replace(".", ",") : "",
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

/**
 * Lo que se cargó como palet u optimizado con otra cantidad, antes de que la
 * app lo impidiera. No puede quedar así: o se corrige la cantidad normalizada
 * del modelo (si era ese el dato mal cargado), o pasan a suelto.
 */
function FueraDeNorma({ bultos }: { bultos: NoNormalizado[] }) {
  const router = useRouter();
  const { ejecutar, enviando, error, limpiar } = useAccion();
  const [confirmando, setConfirmando] = useState(false);
  if (bultos.length === 0) return null;
  const n = bultos.length;

  return (
    <div className="tarjeta space-y-3 border-2 border-amber-400 p-5">
      <h2 className="text-base font-bold text-slate-900">
        {n} bulto{n === 1 ? "" : "s"} con cantidad no normalizada
      </h2>
      <p className="text-sm text-slate-700">
        Está{n === 1 ? "" : "n"} cargado{n === 1 ? "" : "s"} como palet u optimizado pero con otra cantidad. Eso ya
        no se puede cargar: lo que no tiene la cantidad normalizada es suelto. Si el dato equivocado es la cantidad
        del modelo, corregila abajo; si no, pasalos a suelto.
      </p>
      {error && <Aviso>{error}</Aviso>}
      <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto text-sm">
        {bultos.map((b) => (
          <li key={b.id} className="flex flex-wrap items-baseline gap-x-3 py-1.5">
            <span className="codigo font-semibold text-slate-900">{b.codigo}</span>
            <span className="text-slate-700">
              {ETIQUETA_PACKAGING[b.packaging] ?? b.packaging} de {b.modelo}: tiene{" "}
              <strong>{numero(b.cantidad)}</strong>
              {b.norma != null ? <> y lleva {numero(b.norma)}</> : <>, y el modelo no tiene cantidad configurada</>}
            </span>
            <span className="codigo text-xs text-slate-500">{b.posicion ?? "sin ubicar"}</span>
          </li>
        ))}
      </ul>
      {!confirmando ? (
        <button type="button" className="boton-secundario w-full" onClick={() => setConfirmando(true)}>
          Pasar {n === 1 ? "ese bulto" : `los ${n}`} a suelto
        </button>
      ) : (
        <>
          <p className="text-sm text-slate-700">
            {n === 1 ? "Queda" : "Quedan"} como suelto, con la misma cantidad y en el mismo lugar. Se registra en el
            historial a tu nombre.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="boton-secundario" onClick={() => setConfirmando(false)}>
              Cancelar
            </button>
            <button
              type="button"
              className="boton-primario"
              disabled={enviando}
              onClick={() => {
                limpiar();
                void ejecutar(pasarNoNormalizadosASuelto, () => {
                  setConfirmando(false);
                  router.refresh();
                });
              }}
            >
              {enviando ? "Pasando…" : "Sí, pasar a suelto"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
