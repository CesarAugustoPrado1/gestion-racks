"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAccion } from "@/components/usar-accion";
import { Aviso } from "@/components/ui";
import type { Resultado } from "@/lib/acciones/comun";

/**
 * Las piezas compartidas del ABM.
 *
 * El patrón es el mismo en las cinco pantallas: una lista, un formulario que se
 * abre para crear o editar, y un botón que guarda. Repetirlo cinco veces con
 * variaciones sería cinco lugares donde arreglar el mismo bug.
 */

export function Campo({
  etiqueta,
  children,
  ayuda,
}: {
  etiqueta: string;
  children: ReactNode;
  ayuda?: string;
}) {
  return (
    <label className="block">
      <span className="etiqueta">{etiqueta}</span>
      {children}
      {ayuda && <span className="mt-1 block text-xs text-slate-500">{ayuda}</span>}
    </label>
  );
}

export function Interruptor({
  valor,
  cambiar,
  etiqueta,
  ayuda,
}: {
  valor: boolean;
  cambiar: (v: boolean) => void;
  etiqueta: string;
  ayuda?: string;
}) {
  return (
    <label className="flex items-start gap-2.5 text-sm text-slate-700">
      <input
        type="checkbox"
        className="mt-0.5 h-5 w-5"
        checked={valor}
        onChange={(e) => cambiar(e.target.checked)}
      />
      <span>
        <strong>{etiqueta}</strong>
        {ayuda && <span className="block text-xs text-slate-500">{ayuda}</span>}
      </span>
    </label>
  );
}

/**
 * Envuelve un formulario del ABM: maneja el envío, el error y el refresco.
 *
 * `alGuardar` recibe nada y devuelve la promesa de la action, para que cada
 * pantalla arme sus datos como le convenga.
 */
export function Formulario({
  titulo,
  children,
  puedeGuardar,
  alGuardar,
  cerrar,
  textoBoton = "Guardar",
}: {
  titulo: string;
  children: ReactNode;
  puedeGuardar: boolean;
  alGuardar: () => Promise<Resultado<unknown>>;
  cerrar: () => void;
  textoBoton?: string;
}) {
  const router = useRouter();
  const { ejecutar, enviando, error, limpiar } = useAccion();

  return (
    <div className="tarjeta space-y-4 p-5">
      <h2 className="text-base font-bold text-slate-900">{titulo}</h2>
      {error && <Aviso>{error}</Aviso>}
      {children}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="boton-secundario" onClick={cerrar}>
          Cancelar
        </button>
        <button
          type="button"
          className="boton-primario"
          disabled={!puedeGuardar || enviando}
          onClick={() => {
            limpiar();
            void ejecutar(alGuardar, () => {
              cerrar();
              router.refresh();
            });
          }}
        >
          {enviando ? "Guardando…" : textoBoton}
        </button>
      </div>
    </div>
  );
}

/** Un botón que dispara una action sin formulario: suspender, destrabar. */
export function BotonAccion({
  children,
  accion,
  clase = "boton-secundario",
  confirmar,
}: {
  children: ReactNode;
  accion: () => Promise<Resultado<unknown>>;
  clase?: string;
  confirmar?: string;
}) {
  const router = useRouter();
  const { ejecutar, enviando, error, limpiar } = useAccion();
  const [pidiendo, setPidiendo] = useState(false);

  if (error) {
    return (
      <div className="space-y-2">
        <Aviso>{error}</Aviso>
        <button type="button" className="boton-secundario text-sm" onClick={limpiar}>
          Entendido
        </button>
      </div>
    );
  }

  if (confirmar && pidiendo) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-600">{confirmar}</span>
        <button
          type="button"
          className="boton-secundario text-sm"
          onClick={() => setPidiendo(false)}
        >
          No
        </button>
        <button
          type="button"
          className="boton-peligro text-sm"
          disabled={enviando}
          onClick={() => {
            limpiar();
            void ejecutar(accion, () => {
              setPidiendo(false);
              router.refresh();
            });
          }}
        >
          Sí
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`${clase} text-sm`}
      disabled={enviando}
      onClick={() => {
        if (confirmar) return setPidiendo(true);
        limpiar();
        void ejecutar(accion, () => router.refresh());
      }}
    >
      {enviando ? "…" : children}
    </button>
  );
}
