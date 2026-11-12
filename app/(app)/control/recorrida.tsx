"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { confirmar, datosParaChequear } from "@/lib/acciones/control";
import { useAccion } from "@/components/usar-accion";
import { Aviso } from "@/components/ui";
import { numero } from "@/lib/formato";
import type { BultoEnPosicion, ModeloParaCargar, MotivoOpcion } from "@/lib/consultas";
import { Chequeo } from "./[id]/chequeo";

export type FilaDeRecorrida = {
  id: number;
  codigo: string;
  rack: string;
  /** "medio, pasillo": la parte hablada de la posición. */
  donde: string;
  contenido: string;
  unidades: number;
  unidadPlural: string | null;
  estado: string;
  nivel: "alta" | "media" | "baja" | "sin_datos";
  olvidada: boolean;
  fueraDeUso: string | null;
};

type Estado = "pendiente" | "ok" | "corregida";

/**
 * La recorrida de control, renglón por renglón.
 *
 * Cada renglón dice lo que el sistema cree que hay. Si coincide, "OK" y listo:
 * el renglón se achica y el siguiente sube solo, sin cambiar de pantalla. Si
 * no, "Corregir" abre la corrección ahí abajo, en el mismo renglón.
 *
 * La lista se congela al entrar: lo que se va chequeando NO se reordena
 * mientras se recorre. Si cada OK reacomodara la lista, el renglón que uno iba
 * a tocar se movería bajo el dedo.
 */
export function Recorrida({
  filas: iniciales,
  motivos,
  modelos,
}: {
  filas: FilaDeRecorrida[];
  motivos: MotivoOpcion[];
  modelos: ModeloParaCargar[];
}) {
  const [filas] = useState(iniciales);
  const [estados, setEstados] = useState<Record<number, Estado>>({});
  const [abierta, setAbierta] = useState<number | null>(null);

  const hechas = Object.keys(estados).length;
  const marcar = (id: number, e: Estado) => setEstados((x) => ({ ...x, [id]: e }));

  return (
    <>
      {hechas > 0 && (
        <p className="mb-2 px-1 text-sm text-slate-600">
          <strong className="text-slate-900">{hechas}</strong> de {filas.length} chequeadas en esta vuelta
          {Object.values(estados).filter((e) => e === "corregida").length > 0 &&
            ` · ${Object.values(estados).filter((e) => e === "corregida").length} con corrección`}
          .
        </p>
      )}
      <ul className="space-y-2">
        {filas.map((p) => (
          <Renglon
            key={p.id}
            fila={p}
            estado={estados[p.id] ?? "pendiente"}
            abierta={abierta === p.id}
            abrir={() => setAbierta(p.id)}
            cerrar={() => setAbierta(null)}
            alConfirmar={() => {
              marcar(p.id, "ok");
              if (abierta === p.id) setAbierta(null);
            }}
            alCorregir={() => {
              marcar(p.id, "corregida");
              setAbierta(null);
            }}
            motivos={motivos}
            modelos={modelos}
          />
        ))}
      </ul>
    </>
  );
}

const COLOR: Record<FilaDeRecorrida["nivel"], string> = {
  alta: "bg-confiable",
  media: "bg-dudoso",
  baja: "bg-vencido",
  sin_datos: "bg-sin-datos",
};

function Renglon({
  fila: p,
  estado,
  abierta,
  abrir,
  cerrar,
  alConfirmar,
  alCorregir,
  motivos,
  modelos,
}: {
  fila: FilaDeRecorrida;
  estado: Estado;
  abierta: boolean;
  abrir: () => void;
  cerrar: () => void;
  alConfirmar: () => void;
  alCorregir: () => void;
  motivos: MotivoOpcion[];
  modelos: ModeloParaCargar[];
}) {
  const { ejecutar, enviando, error, limpiar } = useAccion();
  const renglon = useRef<HTMLLIElement>(null);
  const [detalle, setDetalle] = useState<{
    posicion: { id: number; codigo: string; bultos: number; invasor: string | null };
    bultos: BultoEnPosicion[];
  } | null>(null);

  // Ya hecha: un renglón finito, para que el siguiente quede a mano.
  if (estado !== "pendiente") {
    return (
      <li
        className={`flex items-center gap-3 rounded-xl px-4 py-2 text-sm ${
          estado === "ok" ? "bg-confiable-suave text-confiable" : "bg-amber-50 text-amber-900"
        }`}
      >
        <span className="font-bold">{estado === "ok" ? "✓" : "✎"}</span>
        <span className="codigo">{p.codigo}</span>
        <span className="min-w-0 flex-1 truncate text-xs opacity-80">
          {estado === "ok" ? "coincide" : "corregida"}
        </span>
      </li>
    );
  }

  return (
    <li ref={renglon} className={`tarjeta scroll-mt-20 overflow-hidden ${abierta ? "ring-2 ring-slate-900" : ""}`}>
      <div className="flex items-stretch gap-3 p-3 pl-4">
        <span className={`w-1.5 shrink-0 rounded-full ${COLOR[p.nivel]}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2">
            <Link href={`/control/${p.id}`} className="codigo text-base text-slate-900">
              {p.codigo}
            </Link>
            <span className="text-xs text-slate-500">{p.donde}</span>
            {p.olvidada && <span className="chip bg-vencido-suave text-vencido">olvidada</span>}
            {p.fueraDeUso && (
              <span className="chip bg-slate-100 text-slate-500" title={p.fueraDeUso}>
                fuera de uso
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-slate-700">{p.contenido}</p>
          <p className="mt-0.5 text-xs text-slate-400">
            {p.unidades > 0 && (
              <span className="cifra text-slate-600">
                {numero(p.unidades)} {p.unidadPlural} ·{" "}
              </span>
            )}
            {p.estado}
          </p>
        </div>
        {!abierta && (
          <div className="flex shrink-0 flex-col gap-1.5">
            <button
              type="button"
              className="boton-primario min-h-11 px-5 text-base"
              disabled={enviando}
              onClick={() => {
                limpiar();
                void ejecutar(() => confirmar(p.id), alConfirmar);
              }}
            >
              {enviando ? "…" : "OK"}
            </button>
            <button
              type="button"
              className="boton-secundario min-h-9 px-3 text-xs"
              disabled={enviando}
              onClick={() => {
                limpiar();
                abrir();
                // Que la corrección quede a la vista, empezando por el renglón.
                setTimeout(() => renglon.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
                if (!detalle) void ejecutar(() => datosParaChequear(p.id), setDetalle);
              }}
            >
              Corregir
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="px-4 pb-3">
          <Aviso>{error}</Aviso>
        </div>
      )}

      {abierta && (
        <div className="border-t border-slate-100 bg-slate-50/60 p-3">
          {detalle ? (
            <Chequeo
              key={p.id}
              enLinea
              posicion={detalle.posicion}
              bultos={detalle.bultos}
              motivos={motivos}
              modelos={modelos}
              alTerminar={alCorregir}
            />
          ) : (
            <p className="p-2 text-sm text-slate-500">{enviando ? "Cargando lo que hay…" : ""}</p>
          )}
          <button type="button" className="mt-3 w-full text-sm font-medium text-slate-500" onClick={cerrar}>
            Cerrar sin corregir
          </button>
        </div>
      )}
    </li>
  );
}
