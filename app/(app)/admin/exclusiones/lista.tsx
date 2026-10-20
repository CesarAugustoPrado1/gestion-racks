"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { crearExclusion, levantarExclusion } from "@/lib/acciones/admin";
import { BotonAccion, Campo } from "@/components/admin";
import { useAccion } from "@/components/usar-accion";
import { Aviso } from "@/components/ui";
import { nombreDeNivel } from "@/lib/posiciones";
import {
  describirAlcance,
  ETIQUETA_MOTIVO_EXCLUSION,
  MOTIVOS_EXCLUSION,
  type AlcanceExclusion,
  type MotivoExclusion,
} from "@/lib/uso";

export type GrupoParaExcluir = {
  id: number;
  codigo: string;
  nombre: string | null;
  penetrable: boolean;
  niveles: number;
  unidades: number;
  posiciones: Array<{ id: number; codigo: string }>;
};

export type ExclusionEnLista = {
  id: number;
  grupoCodigo: string;
  penetrable: boolean;
  niveles: number;
  unidad: number | null;
  nivel: number | null;
  posicionId: number | null;
  posicionCodigo: string | null;
  motivo: MotivoExclusion;
  nota: string | null;
  creadaEn: Date;
  creadaPor: string | null;
  levantadaEn: Date | null;
  levantadaPor: string | null;
  bultosAdentro: number;
};

const fecha = (d: Date) =>
  d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" });

export function Exclusiones({
  grupos,
  exclusiones,
  posicionesFuera,
  inicial,
}: {
  grupos: GrupoParaExcluir[];
  exclusiones: ExclusionEnLista[];
  posicionesFuera: number;
  inicial: { grupoId: number | null; posicionId: number | null };
}) {
  // Si se llega desde la ficha de una posición, el formulario ya viene abierto
  // con esa posición elegida: es el camino de "esta no se usa, sacala".
  const [abierto, setAbierto] = useState(inicial.grupoId != null);
  const vigentes = exclusiones.filter((e) => e.levantadaEn == null);
  const levantadas = exclusiones.filter((e) => e.levantadaEn != null);

  return (
    <div className="space-y-3">
      {abierto ? (
        <FormularioExclusion
          grupos={grupos}
          inicial={inicial}
          cerrar={() => setAbierto(false)}
        />
      ) : (
        <button
          type="button"
          className="boton-primario w-full"
          onClick={() => setAbierto(true)}
          disabled={grupos.length === 0}
        >
          + Dejar un lugar fuera de uso
        </button>
      )}

      <p className="px-1 text-sm text-slate-600">
        {vigentes.length === 0 ? (
          "No hay nada fuera de uso: todas las posiciones están disponibles."
        ) : (
          <>
            <strong className="cifra text-slate-900">{posicionesFuera}</strong>{" "}
            posicion{posicionesFuera === 1 ? "" : "es"} fuera de uso, en{" "}
            {vigentes.length} renglón{vigentes.length === 1 ? "" : "es"} de la lista.
          </>
        )}
      </p>

      {vigentes.length > 0 && (
        <ul className="space-y-2">
          {vigentes.map((e) => (
            <li key={e.id} className="tarjeta p-4">
              <Renglon e={e} />
              <div className="mt-3">
                <BotonAccion
                  accion={() => levantarExclusion(e.id)}
                  confirmar="¿Volver a habilitarlo?"
                >
                  Volver a habilitar
                </BotonAccion>
              </div>
            </li>
          ))}
        </ul>
      )}

      {levantadas.length > 0 && (
        <>
          <h2 className="mt-6 mb-2 text-sm font-semibold text-slate-500">
            Habilitados hace poco
          </h2>
          <ul className="tarjeta divide-y divide-slate-100">
            {levantadas.map((e) => (
              <li key={e.id} className="px-4 py-3 opacity-70">
                <Renglon e={e} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Renglon({ e }: { e: ExclusionEnLista }) {
  return (
    <>
      <p className="text-base font-bold text-slate-900">
        Grupo {e.grupoCodigo} ·{" "}
        {describirAlcance(e, { penetrable: e.penetrable, niveles: e.niveles }, e.posicionCodigo)}
      </p>
      <p className="text-sm text-slate-600">
        {ETIQUETA_MOTIVO_EXCLUSION[e.motivo]}
        {e.nota ? ` · ${e.nota}` : ""}
      </p>
      <p className="mt-0.5 text-xs text-slate-400">
        desde el {fecha(e.creadaEn)}
        {e.creadaPor ? `, por ${e.creadaPor}` : ""}
        {e.levantadaEn &&
          ` · habilitado el ${fecha(e.levantadaEn)}${e.levantadaPor ? ` por ${e.levantadaPor}` : ""}`}
      </p>
      {e.levantadaEn == null && e.bultosAdentro > 0 && (
        <p className="mt-2 text-xs font-medium text-amber-800">
          Todavía {e.bultosAdentro === 1 ? "queda 1 bulto" : `quedan ${e.bultosAdentro} bultos`}{" "}
          adentro. Se pueden sacar, pero no entra nada nuevo.
        </p>
      )}
    </>
  );
}

const ALCANCES: Array<{ id: AlcanceExclusion; etiqueta: (penetrable: boolean) => string }> = [
  { id: "posicion", etiqueta: () => "Una posición" },
  { id: "unidad", etiqueta: (p) => (p ? "Una calle entera" : "Un módulo entero") },
  { id: "unidad_nivel", etiqueta: (p) => (p ? "Un nivel de una calle" : "Un nivel de un módulo") },
  { id: "nivel", etiqueta: () => "Un nivel en todo el grupo" },
  { id: "grupo", etiqueta: () => "Todo el grupo" },
];

function FormularioExclusion({
  grupos,
  inicial,
  cerrar,
}: {
  grupos: GrupoParaExcluir[];
  inicial: { grupoId: number | null; posicionId: number | null };
  cerrar: () => void;
}) {
  const router = useRouter();
  const { ejecutar, enviando, error, limpiar } = useAccion();
  const [grupoId, setGrupoId] = useState<number | null>(
    inicial.grupoId ?? (grupos.length === 1 ? grupos[0].id : null),
  );
  const [alcance, setAlcance] = useState<AlcanceExclusion>(
    inicial.posicionId != null ? "posicion" : "unidad",
  );
  const [unidad, setUnidad] = useState<number | null>(null);
  const [nivel, setNivel] = useState<number | null>(null);
  const [posicionId, setPosicionId] = useState<number | null>(inicial.posicionId);
  const [motivo, setMotivo] = useState<MotivoExclusion | null>(null);
  const [nota, setNota] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);

  const g = grupos.find((x) => x.id === grupoId) ?? null;
  const pideUnidad = alcance === "unidad" || alcance === "unidad_nivel";
  const pideNivel = alcance === "nivel" || alcance === "unidad_nivel";
  const nombreUnidad = g?.penetrable ? "Calle" : "Módulo";

  const listo =
    g != null &&
    motivo != null &&
    (!pideUnidad || unidad != null) &&
    (!pideNivel || nivel != null) &&
    (alcance !== "posicion" || posicionId != null) &&
    (motivo !== "otro" || nota.trim().length > 0);

  function guardar() {
    if (!g || !motivo) return;
    limpiar();
    setAviso(null);
    void ejecutar(
      () =>
        crearExclusion({
          grupoId: g.id,
          alcance,
          unidad: pideUnidad ? unidad : null,
          nivel: pideNivel ? nivel : null,
          posicionId: alcance === "posicion" ? posicionId : null,
          motivo,
          nota: nota.trim() || undefined,
        }),
      (r) => {
        if (r.bultosAdentro > 0) {
          // Se queda abierto para que el aviso se lea: si se cerrara, el
          // operario de oficina no se entera de que quedó un palet adentro.
          setAviso(
            `Guardado. Adentro ${r.bultosAdentro === 1 ? "queda 1 bulto" : `quedan ${r.bultosAdentro} bultos`}: ` +
              `se pueden sacar, pero ya no entra nada nuevo.`,
          );
          setMotivo(null);
          setNota("");
        } else {
          cerrar();
        }
        router.refresh();
      },
    );
  }

  return (
    <div className="tarjeta space-y-4 p-5">
      <h2 className="text-base font-bold text-slate-900">Dejar fuera de uso</h2>
      {error && <Aviso>{error}</Aviso>}
      {aviso && <Aviso tono="advertencia">{aviso}</Aviso>}

      <Campo etiqueta="Grupo">
        <select
          className="campo"
          value={grupoId ?? ""}
          onChange={(e) => {
            setGrupoId(e.target.value ? Number(e.target.value) : null);
            setUnidad(null);
            setNivel(null);
            setPosicionId(null);
          }}
        >
          <option value="">Elegí el grupo…</option>
          {grupos.map((x) => (
            <option key={x.id} value={x.id}>
              {x.codigo}
              {x.nombre ? ` · ${x.nombre}` : ""}
            </option>
          ))}
        </select>
      </Campo>

      {g && (
        <>
          <div>
            <span className="etiqueta">Qué queda fuera de uso</span>
            <div className="grid grid-cols-2 gap-2">
              {ALCANCES.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setAlcance(a.id)}
                  className={`min-h-12 rounded-xl px-2 text-sm font-semibold ${
                    alcance === a.id
                      ? "bg-slate-900 text-white"
                      : "bg-white text-slate-700 ring-1 ring-slate-300"
                  }`}
                >
                  {a.etiqueta(g.penetrable)}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {pideUnidad && (
              <Campo etiqueta={nombreUnidad}>
                <select
                  className="campo"
                  value={unidad ?? ""}
                  onChange={(e) => setUnidad(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">Elegí…</option>
                  {Array.from({ length: g.unidades }, (_, i) => i + 1).map((u) => (
                    <option key={u} value={u}>
                      {nombreUnidad} {u}
                    </option>
                  ))}
                </select>
              </Campo>
            )}
            {pideNivel && (
              <Campo etiqueta="Nivel">
                <select
                  className="campo"
                  value={nivel ?? ""}
                  onChange={(e) => setNivel(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">Elegí…</option>
                  {Array.from({ length: g.niveles }, (_, i) => g.niveles - i).map((n) => (
                    <option key={n} value={n}>
                      {nombreDeNivel(n, g.niveles)}
                    </option>
                  ))}
                </select>
              </Campo>
            )}
          </div>

          {alcance === "posicion" && (
            <Campo etiqueta="Posición">
              <select
                className="campo"
                value={posicionId ?? ""}
                onChange={(e) => setPosicionId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Elegí la posición…</option>
                {g.posiciones.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.codigo}
                  </option>
                ))}
              </select>
            </Campo>
          )}

          <div>
            <span className="etiqueta">Por qué</span>
            <div className="grid grid-cols-3 gap-2">
              {MOTIVOS_EXCLUSION.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMotivo(m)}
                  className={`min-h-12 rounded-xl px-2 text-sm font-semibold ${
                    motivo === m
                      ? "bg-slate-900 text-white"
                      : "bg-white text-slate-700 ring-1 ring-slate-300"
                  }`}
                >
                  {ETIQUETA_MOTIVO_EXCLUSION[m]}
                </button>
              ))}
            </div>
          </div>

          <Campo
            etiqueta={motivo === "otro" ? "Nota" : "Nota (opcional)"}
            ayuda="Lo que alguien va a necesitar saber para volver a habilitarlo."
          >
            <input
              className="campo"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Larguero doblado, reservado para muestras…"
            />
          </Campo>
        </>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="boton-secundario" onClick={cerrar}>
          {aviso ? "Cerrar" : "Cancelar"}
        </button>
        <button
          type="button"
          className="boton-primario"
          disabled={!listo || enviando}
          onClick={guardar}
        >
          {enviando ? "Guardando…" : "Dejar fuera de uso"}
        </button>
      </div>
    </div>
  );
}
