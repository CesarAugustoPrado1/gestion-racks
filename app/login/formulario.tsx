"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { iniciarSesion } from "@/lib/acciones/sesion";
import { useAccion } from "@/components/usar-accion";
import { Aviso } from "@/components/ui";

const LARGO_MAXIMO = 8;

/**
 * Teclado numerico propio en vez del del sistema: se usa con una mano, arriba
 * del autoelevador, y el teclado de iOS tapa media pantalla.
 */
export function FormularioLogin({ volver }: { volver?: string }) {
  const router = useRouter();
  const { ejecutar, enviando, error, setError } = useAccion();
  const [usuario, setUsuario] = useState("");
  const [pin, setPin] = useState("");

  async function entrar(pinFinal = pin) {
    if (!usuario.trim()) return setError("Escribí tu usuario.");
    if (pinFinal.length < 4) return setError("El PIN son al menos 4 números.");

    const listo = await ejecutar(
      () => iniciarSesion({ usuario, pin: pinFinal }),
      (datos) => {
        router.replace(
          volver && volver.startsWith("/") ? volver : datos.destino,
        );
        router.refresh();
      },
    );
    // Si no entro, el PIN se limpia: reintentar sobre digitos viejos es como
    // se gastan los 5 intentos sin darse cuenta.
    if (!listo) setPin("");
  }

  function tecla(digito: string) {
    setError(null);
    setPin((actual) => (actual + digito).slice(0, LARGO_MAXIMO));
  }

  return (
    <div className="tarjeta space-y-5 p-6">
      <div>
        <label htmlFor="usuario" className="etiqueta">
          Usuario
        </label>
        <input
          id="usuario"
          className="campo"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="username"
          inputMode="text"
          value={usuario}
          onChange={(e) => {
            setUsuario(e.target.value);
            setError(null);
          }}
          placeholder="ej: jperez"
        />
      </div>

      <div>
        <span className="etiqueta">PIN</span>
        <div className="flex h-12 items-center justify-center gap-3 rounded-xl bg-slate-100 ring-1 ring-slate-200">
          {pin.length === 0 ? (
            <span className="text-sm text-slate-400">Tocá los números</span>
          ) : (
            Array.from({ length: pin.length }).map((_, i) => (
              <span key={i} className="h-3 w-3 rounded-full bg-slate-800" />
            ))
          )}
        </div>
      </div>

      {error && <Aviso>{error}</Aviso>}

      <div className="grid grid-cols-3 gap-2.5">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <TeclaNumero key={d} onClick={() => tecla(d)} disabled={enviando}>
            {d}
          </TeclaNumero>
        ))}
        <TeclaNumero
          onClick={() => {
            setPin((p) => p.slice(0, -1));
            setError(null);
          }}
          disabled={enviando}
          variante="suave"
          aria-label="Borrar un número"
        >
          ←
        </TeclaNumero>
        <TeclaNumero onClick={() => tecla("0")} disabled={enviando}>
          0
        </TeclaNumero>
        <TeclaNumero
          onClick={() => void entrar()}
          disabled={enviando || pin.length < 4}
          variante="acento"
          aria-label="Entrar"
        >
          {enviando ? "…" : "→"}
        </TeclaNumero>
      </div>
    </div>
  );
}

function TeclaNumero({
  children,
  variante = "normal",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: "normal" | "suave" | "acento";
}) {
  const estilos = {
    normal: "bg-white text-slate-900 ring-1 ring-slate-300 hover:bg-slate-50",
    suave: "bg-slate-200 text-slate-600 hover:bg-slate-300",
    acento: "bg-slate-900 text-white hover:bg-slate-800",
  }[variante];

  return (
    <button
      type="button"
      {...props}
      className={`h-14 rounded-xl text-xl font-semibold tabular-nums transition active:scale-95 disabled:opacity-40 ${estilos}`}
    >
      {children}
    </button>
  );
}
