"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { guardarOlvido, guardarSemivida } from "@/lib/acciones/admin";
import {
  COLOR_NIVEL,
  ETIQUETA_NIVEL,
  confianza,
  nivel,
} from "@/lib/confiabilidad";
import { useAccion } from "@/components/usar-accion";
import { Aviso } from "@/components/ui";

/** Los hitos de la vista previa: una semana, dos, un mes, dos meses. */
const HITOS = [7, 14, 30, 60];

/**
 * El ajuste del índice, con vista previa en vivo.
 *
 * La vista previa no es adorno. "Semivida 30" no le dice nada a nadie: lo que
 * se quiere saber es de qué color va a estar el tablero, y eso recién se ve
 * cuando el número se traduce a "a los 30 días: A chequear". Sin esto, calibrar
 * el índice es probar un número, desplegarlo, mirar el tablero y volver.
 *
 * Y se calcula con la MISMA función que usa el servidor, no con una fórmula
 * copiada: si alguna vez cambia la cuenta, la vista previa cambia con ella o no
 * compila. Una vista previa que puede mentir es peor que no tenerla.
 */
export function AjusteSemivida({ actual }: { actual: number }) {
  const router = useRouter();
  const { ejecutar, enviando, error, limpiar } = useAccion();
  const [dias, setDias] = useState(String(actual));
  const [guardado, setGuardado] = useState(false);

  const n = Number(dias);
  const valido = Number.isInteger(n) && n >= 5 && n <= 365;
  const cambio = n !== actual;

  const ahora = new Date();
  /**
   * Se previsualiza una posición que SIEMPRE dio bien, que es el mejor caso.
   * Si hasta la que nunca falló se pone amarilla a los X días, ese es el techo
   * del indicador con ese ajuste.
   */
  const comoEnvejece = HITOS.map((d) => {
    const c = confianza(
      {
        chequeadoEn: new Date(ahora.getTime() - d * 86400000),
        chequeosOk: 5,
        chequeosTotal: 5,
      },
      valido ? n : actual,
      ahora,
    )!;
    return { dias: d, c };
  });

  return (
    <div className="tarjeta mt-4 p-5">
      <h2 className="text-base font-bold text-slate-900">
        Vencimiento de los chequeos
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        A los cuántos días un chequeo vale la mitad. No es cada cuánto se
        recorre: es cuánto tarda en envejecer lo que ya se miró.
      </p>
      <p className="mt-1 text-sm text-slate-600">
        La referencia útil es <strong>el ciclo real de la recorrida</strong>. Si
        control cubre todo el galpón en tres semanas, poné 21: una posición
        recién chequeada queda en verde, y una que se saltó una vuelta entera se
        pone amarilla, que es lo que hace falta ver.
      </p>

      {error && <Aviso>{error}</Aviso>}
      {guardado && !cambio && (
        <div className="mt-3">
          <Aviso tono="exito">
            Guardado. El tablero y la recorrida ya usan {actual} días.
          </Aviso>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="etiqueta">Días</span>
          <input
            className="campo w-28 text-right"
            inputMode="numeric"
            value={dias}
            onChange={(e) => {
              setDias(e.target.value);
              setGuardado(false);
              limpiar();
            }}
            aria-label="Días de semivida"
          />
        </label>
        <button
          type="button"
          className="boton-primario"
          disabled={!valido || !cambio || enviando}
          onClick={() => {
            limpiar();
            void ejecutar(
              () => guardarSemivida({ dias: n }),
              () => {
                setGuardado(true);
                router.refresh();
              },
            );
          }}
        >
          {enviando ? "Guardando…" : "Guardar"}
        </button>
        {!valido && dias !== "" && (
          <p className="text-sm text-red-700">Poné un número entre 5 y 365.</p>
        )}
      </div>

      <div className="mt-4 border-t border-slate-100 pt-3">
        <p className="text-xs font-medium text-slate-500">
          Con {valido ? n : actual} días, una posición que nunca falló se ve así
          {cambio && valido && " (todavía sin guardar)"}:
        </p>
        <ul className="mt-2 space-y-1">
          {comoEnvejece.map(({ dias: d, c }) => (
            <li key={d} className="flex items-center gap-2 text-sm">
              <span className="w-28 shrink-0 text-slate-600">
                a los {d} días
              </span>
              <span className={`chip ${COLOR_NIVEL[nivel(c)]}`}>
                {ETIQUETA_NIVEL[nivel(c)]}
              </span>
              <span className="cifra text-xs text-slate-400">
                {c.valor.toFixed(2)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}


/**
 * El piso de olvido, al lado de la semivida porque se leen juntos: uno dice
 * cuándo algo se ve viejo, el otro cuándo deja de poder esperar.
 */
export function AjusteOlvido({ actual }: { actual: number }) {
  const router = useRouter();
  const { ejecutar, enviando, error, limpiar } = useAccion();
  const [dias, setDias] = useState(String(actual));
  const [guardado, setGuardado] = useState(false);

  const n = Number(dias);
  const valido = Number.isInteger(n) && (n === 0 || (n >= 7 && n <= 730));
  const cambio = n !== actual;

  return (
    <div className="tarjeta mt-4 p-5">
      <h2 className="text-base font-bold text-slate-900">
        Piso de la recorrida
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        A los cuántos días sin mirarla, una posición con producto sube al tope
        de la recorrida <strong>por más chica que sea</strong>.
      </p>
      <p className="mt-1 text-sm text-slate-600">
        Existe porque la recorrida ordena por cantidad, y eso solo dejaría a las
        posiciones chicas abajo para siempre: una de 4 unidades nunca alcanza a
        una de 90, por años que pasen. Con el piso, lo olvidado sube igual.
      </p>

      {error && <Aviso>{error}</Aviso>}
      {guardado && !cambio && (
        <div className="mt-3">
          <Aviso tono="exito">
            {actual === 0
              ? "Guardado. El piso quedó desactivado."
              : `Guardado. Lo que nadie mira hace ${actual} días sube al tope.`}
          </Aviso>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="etiqueta">Días</span>
          <input
            className="campo w-28 text-right"
            inputMode="numeric"
            value={dias}
            onChange={(e) => {
              setDias(e.target.value);
              setGuardado(false);
              limpiar();
            }}
            aria-label="Días del piso de la recorrida"
          />
        </label>
        <button
          type="button"
          className="boton-primario"
          disabled={!valido || !cambio || enviando}
          onClick={() => {
            limpiar();
            void ejecutar(
              () => guardarOlvido({ dias: n }),
              () => {
                setGuardado(true);
                router.refresh();
              },
            );
          }}
        >
          {enviando ? "Guardando…" : "Guardar"}
        </button>
        {!valido && dias !== "" && (
          <p className="text-sm text-red-700">
            Poné 0 para desactivarlo, o entre 7 y 730 días.
          </p>
        )}
      </div>

      <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
        {valido && n === 0
          ? "Desactivado: la recorrida vuelve a ordenarse solo por urgencia, y una posición chica puede no salir nunca."
          : `Con ${valido ? n : actual} días: lo que nadie miró en ese plazo va primero, y adentro de ese grupo sigue mandando la cantidad. Las posiciones que el sistema cree vacías no entran, para que el tope no se llene de confirmaciones de vacío.`}
      </p>
    </div>
  );
}
