"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  borrarTodo,
  cargarEjemplo,
  terminarEtapaDePrueba,
} from "@/lib/acciones/prueba";
import { useAccion } from "@/components/usar-accion";
import { Aviso } from "@/components/ui";

export function PanelPrueba({ hayDatos }: { hayDatos: boolean }) {
  const router = useRouter();
  const { ejecutar, enviando, error, limpiar } = useAccion();
  const [hecho, setHecho] = useState<string | null>(null);

  // Cada operación destructiva tiene su propio cuadro de texto: un solo campo
  // compartido deja escrita la confirmación de la anterior.
  const [paraBorrar, setParaBorrar] = useState("");
  const [paraTerminar, setParaTerminar] = useState("");

  function despues(mensaje: string | null) {
    setHecho(mensaje);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {error && <Aviso>{error}</Aviso>}
      {hecho && <Aviso tono="exito">{hecho}</Aviso>}


      <div className="tarjeta space-y-3 p-5">
        <h2 className="text-base font-bold text-slate-900">
          Cargar datos de ejemplo
        </h2>
        <p className="text-sm text-slate-600">
          Tres líneas con sus modelos —placas, piedras, y pisos flotantes apagada
          para probar que se enciende sin tocar código—, tres racks (dos
          selectivos y uno penetrable), bultos en los tres packagings, algunos
          fuera de norma, y chequeos de ayer, de hace un mes y de hace dos, más
          posiciones nunca chequeadas.
        </p>
        <p className="text-sm text-slate-600">
          <strong>Las cantidades son inventadas.</strong> Los modelos son los de
          la fábrica para que se reconozcan, pero las normas no son las reales:
          están para que las pantallas tengan algo que mostrar.
        </p>
        <button
          type="button"
          className="boton-primario"
          disabled={enviando || hayDatos}
          onClick={() => {
            limpiar();
            void ejecutar(cargarEjemplo, (datos) =>
              despues(
                `Listo: ${datos.bultos} bultos en ${datos.posiciones} posiciones, ` +
                  `con ${datos.movimientos} movimientos y ${datos.chequeos} chequeos.`,
              ),
            );
          }}
        >
          {enviando ? "Cargando…" : "Cargar ejemplo"}
        </button>
        {hayDatos && (
          <p className="text-xs text-slate-500">
            Ya hay datos cargados. Borralos primero: cargar el ejemplo encima
            duplicaría modelos y racks.
          </p>
        )}
      </div>

      <div className="tarjeta space-y-3 p-5">
        <h2 className="text-base font-bold text-slate-900">Borrar todo</h2>
        <p className="text-sm text-slate-600">
          Vacía líneas, modelos, normas, racks, posiciones, bultos, movimientos y
          chequeos, y hace que el próximo bulto vuelva a ser el P-00001.{" "}
          <strong>Los usuarios no se tocan</strong>, así no te quedás afuera de tu
          propia app.
        </p>
        <label className="etiqueta" htmlFor="conf-borrar">
          Para confirmar, escribí <code className="codigo">BORRAR TODO</code>
        </label>
        <input
          id="conf-borrar"
          className="campo"
          value={paraBorrar}
          autoCapitalize="characters"
          autoCorrect="off"
          onChange={(e) => setParaBorrar(e.target.value)}
          placeholder="BORRAR TODO"
        />
        <button
          type="button"
          className="boton-peligro"
          disabled={enviando || paraBorrar.trim().toUpperCase() !== "BORRAR TODO"}
          onClick={() => {
            limpiar();
            void ejecutar(
              () => borrarTodo(paraBorrar),
              () => {
                setParaBorrar("");
                despues("Se borró todo. Podés volver a cargar el ejemplo.");
              },
            );
          }}
        >
          {enviando ? "Borrando…" : "Borrar todo"}
        </button>
      </div>

      <div className="tarjeta space-y-3 border-2 border-slate-900 p-5">
        <h2 className="text-base font-bold text-slate-900">
          Terminar la etapa de prueba
        </h2>
        <p className="text-sm text-slate-600">
          Borra todo <em>y</em> apaga el modo prueba para siempre: después de
          esto, esta pantalla ya no ofrece borrar nada. Es el momento de empezar a
          cargar los datos reales.
        </p>
        <p className="text-sm text-slate-600">
          Es una sola operación y no dos botones porque es una sola decisión. Y{" "}
          <strong>no se deshace desde la app</strong>: volver a encenderlo
          requiere entrar a la base.
        </p>
        <label className="etiqueta" htmlFor="conf-terminar">
          Para confirmar, escribí <code className="codigo">EMPEZAR EN SERIO</code>
        </label>
        <input
          id="conf-terminar"
          className="campo"
          value={paraTerminar}
          autoCapitalize="characters"
          autoCorrect="off"
          onChange={(e) => setParaTerminar(e.target.value)}
          placeholder="EMPEZAR EN SERIO"
        />
        <button
          type="button"
          className="boton-primario"
          disabled={
            enviando || paraTerminar.trim().toUpperCase() !== "EMPEZAR EN SERIO"
          }
          onClick={() => {
            limpiar();
            void ejecutar(
              () => terminarEtapaDePrueba(paraTerminar),
              () => {
                setParaTerminar("");
                despues(
                  "Listo. La base quedó vacía y el modo prueba está apagado.",
                );
              },
            );
          }}
        >
          {enviando ? "Terminando…" : "Terminar la etapa de prueba"}
        </button>
      </div>
    </div>
  );
}
