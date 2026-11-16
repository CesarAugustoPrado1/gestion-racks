"use client";

import { usePathname, useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { elegirVistaSegunda } from "@/lib/acciones/segunda";
import { aplicaVistaSegunda, type VistaSegunda } from "@/lib/segunda";

/**
 * Los dos tildes del encabezado: si el producto de segunda se MUESTRA y, si se
 * muestra, si va JUNTO con el resto o DISCRIMINADO. Ver lib/segunda.ts.
 *
 * El segundo tilde solo existe cuando el primero dice "mostrar": con la
 * segunda oculta no hay nada que juntar ni que discriminar.
 *
 * La franja aparece solo en las pantallas donde cambia algo. En las de operar
 * no está, para que nadie crea que un palet de segunda dejó de ocupar su lugar.
 */
export function TildesSegunda({ vista }: { vista: VistaSegunda }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [actual, ponerOptimista] = useOptimistic(vista);
  const ruta = usePathname();

  const elegir = (v: VistaSegunda) => {
    if (v === actual) return;
    iniciar(async () => {
      ponerOptimista(v);
      await elegirVistaSegunda(v);
      router.refresh();
    });
  };

  const mostrar = actual !== "oculta";

  if (!aplicaVistaSegunda(ruta)) return null;

  return (
    <div className="border-t border-slate-100 bg-slate-50/80">
      <div
        className={`mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-1.5 text-xs text-slate-600 ${pendiente ? "opacity-70" : ""}`}
        aria-busy={pendiente}
      >
        <Par
          titulo="Producto de segunda"
          opciones={[
            { texto: "Mostrar", activa: mostrar, alTocar: () => elegir(actual === "oculta" ? "discriminada" : actual) },
            { texto: "Ocultar", activa: !mostrar, alTocar: () => elegir("oculta") },
          ]}
        />
        {mostrar && (
          <Par
            titulo="Se ve"
            oculto
            opciones={[
              { texto: "Junto", activa: actual === "junta", alTocar: () => elegir("junta") },
              { texto: "Discriminado", activa: actual === "discriminada", alTocar: () => elegir("discriminada") },
            ]}
          />
        )}
      </div>
    </div>
  );
}

function Par({
  titulo,
  opciones,
  oculto = false,
}: {
  /** El título queda solo para el lector de pantalla: los botones ya dicen qué son. */
  oculto?: boolean;
  titulo: string;
  opciones: Array<{ texto: string; activa: boolean; alTocar: () => void }>;
}) {
  return (
    <div className="flex items-center gap-2" role="radiogroup" aria-label={titulo}>
      {!oculto && <span className="font-semibold text-slate-700">{titulo}</span>}
      <span className="inline-flex overflow-hidden rounded-lg ring-1 ring-slate-300">
        {opciones.map((o) => (
          <button
            key={o.texto}
            type="button"
            role="radio"
            aria-checked={o.activa}
            onClick={o.alTocar}
            className={`flex min-h-8 items-center gap-1 px-2 font-semibold transition ${
              o.activa ? "bg-slate-900 text-white" : "bg-white text-slate-500 hover:bg-slate-100"
            }`}
          >
            {o.activa && <span aria-hidden>✓</span>}
            {o.texto}
          </button>
        ))}
      </span>
    </div>
  );
}
