"use client";

import { useCallback, useState } from "react";
import type { Resultado } from "@/lib/acciones/comun";

const REINTENTOS = 3;
const ESPERA_MS = [600, 1800];

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Envuelve el llamado a una server action.
 *
 * La conexion arriba del autoelevador se corta, asi que un fallo de RED se
 * reintenta hasta tres veces. Un `{ ok: false }` en cambio es un rechazo de
 * negocio -la posicion ya esta ocupada, el bulto lo movio otro- y reintentarlo
 * daria siempre lo mismo: se muestra de una.
 *
 * Cuando se agotan los reintentos el mensaje dice explicitamente que el
 * movimiento NO se guardo, que es lo unico que el operario necesita saber para
 * decidir si vuelve a intentar o avisa.
 */
export function useAccion() {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sinConexion, setSinConexion] = useState(false);

  const limpiar = useCallback(() => {
    setError(null);
    setSinConexion(false);
  }, []);

  const ejecutar = useCallback(
    async <T>(
      accion: () => Promise<Resultado<T>>,
      alTerminar?: (datos: T) => void,
    ): Promise<boolean> => {
      setEnviando(true);
      setError(null);
      setSinConexion(false);

      try {
        for (let intento = 0; intento < REINTENTOS; intento++) {
          try {
            const resultado = await accion();
            if (resultado.ok) {
              alTerminar?.(resultado.datos);
              return true;
            }
            setError(resultado.error);
            return false;
          } catch (e) {
            const ultimo = intento === REINTENTOS - 1;
            if (ultimo) {
              console.error("[accion cliente]", e);
              setSinConexion(true);
              setError(
                typeof navigator !== "undefined" && !navigator.onLine
                  ? "Estás sin conexión. El movimiento NO se guardó."
                  : "No se pudo contactar al servidor. El movimiento NO se guardó.",
              );
              return false;
            }
            await dormir(ESPERA_MS[intento]);
          }
        }
        return false;
      } finally {
        setEnviando(false);
      }
    },
    [],
  );

  return { ejecutar, enviando, error, sinConexion, limpiar, setError };
}
