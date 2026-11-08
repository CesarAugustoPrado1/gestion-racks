"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { mover, pasarCategoria, sacar } from "@/lib/acciones/flujo";
import { useAccion } from "@/components/usar-accion";
import { Aviso } from "@/components/ui";
import { ETIQUETA_PACKAGING, numero } from "@/lib/formato";
import { SelectorPosicion } from "@/components/selector-posicion";
import { avisoAjeno, esAjeno } from "@/lib/uso";
import type { MotivoOpcion, PosicionLibre } from "@/lib/consultas";
import type { Calidad, Packaging } from "@/lib/db/schema";

type Bulto = {
  id: number;
  codigo: string;
  packaging: Packaging;
  calidad: Calidad;
  cantidad: number;
  ubicacion: string | null;
  unidadPlural: string;
  empresas: string | null;
  empresasIds: number[];
  esObjeto: boolean;
};

export function AccionesBulto({
  bulto,
  contenido,
  motivos,
  posiciones,
}: {
  bulto: Bulto;
  contenido: Array<{ modeloId: number; nombre: string; cantidad: number }>;
  motivos: MotivoOpcion[];
  posiciones: PosicionLibre[];
}) {
  const [modo, setModo] = useState<"nada" | "sacar" | "mover" | "categoria">("nada");

  return (
    <div className="space-y-3">
      {modo === "nada" && (
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            className="boton-peligro"
            onClick={() => setModo("sacar")}
          >
            Egreso
          </button>
          <button
            type="button"
            className="boton-secundario"
            onClick={() => setModo("mover")}
          >
            Reubicar
          </button>
          {!bulto.esObjeto && (
            <button
              type="button"
              className="boton-secundario col-span-2"
              onClick={() => setModo("categoria")}
            >
              Cambiar a {bulto.calidad === "primera" ? "segunda" : "primera"}
            </button>
          )}
        </div>
      )}

      {modo === "sacar" && (
        <Sacar
          bulto={bulto}
          contenido={contenido}
          motivos={motivos}
          cancelar={() => setModo("nada")}
        />
      )}

      {modo === "mover" && (
        <Mover
          bulto={bulto}
          posiciones={posiciones}
          cancelar={() => setModo("nada")}
        />
      )}

      {modo === "categoria" && <CambiarCategoria bulto={bulto} cancelar={() => setModo("nada")} />}
    </div>
  );
}

/**
 * PASAJE de categoría: se detectó después que el bulto es de la otra.
 *
 * El porqué es obligatorio y la pantalla dice en grande de qué a qué pasa:
 * es un cambio que después se audita, y tiene que quedar hecho a conciencia.
 */
function CambiarCategoria({ bulto, cancelar }: { bulto: Bulto; cancelar: () => void }) {
  const router = useRouter();
  const { ejecutar, enviando, error, limpiar } = useAccion();
  const [nota, setNota] = useState("");
  const nueva: Calidad = bulto.calidad === "primera" ? "segunda" : "primera";
  const notaValida = nota.trim().length >= 5;

  return (
    <div className="tarjeta space-y-4 p-5">
      <h2 className="text-base font-bold text-slate-900">Pasaje de categoría</h2>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center">
        <span className="rounded-xl bg-slate-100 py-3 text-sm font-bold uppercase text-slate-700">
          {bulto.calidad}
        </span>
        <span className="text-xl text-slate-400">→</span>
        <span
          className={`rounded-xl py-3 text-sm font-bold uppercase ${
            nueva === "segunda" ? "bg-orange-100 text-orange-900" : "bg-confiable-suave text-confiable"
          }`}
        >
          {nueva}
        </span>
      </div>
      <p className="text-sm text-slate-500">
        No cambia la cantidad ni el lugar. Queda en el historial con tu nombre, la hora y el porqué.
      </p>
      {error && <Aviso>{error}</Aviso>}
      <label className="block">
        <span className="etiqueta">Por qué (obligatorio)</span>
        <input
          className="campo"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder={nueva === "segunda" ? "Placas con manchas en una esquina" : "Revisado: está bien"}
          maxLength={300}
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="boton-secundario" onClick={cancelar}>
          Cancelar
        </button>
        <button
          type="button"
          className="boton-primario"
          disabled={enviando || !notaValida}
          onClick={() => {
            limpiar();
            void ejecutar(
              () => pasarCategoria({ bultoId: bulto.id, calidad: nueva, nota: nota.trim() }),
              () => {
                router.push(`/mover?q=${encodeURIComponent(bulto.codigo)}`);
                router.refresh();
              },
            );
          }}
        >
          {enviando ? "Guardando…" : `Pasar a ${nueva}`}
        </button>
      </div>
    </div>
  );
}

function Sacar({
  bulto,
  contenido,
  motivos,
  cancelar,
}: {
  bulto: Bulto;
  contenido: Array<{ modeloId: number; nombre: string; cantidad: number }>;
  motivos: MotivoOpcion[];
  cancelar: () => void;
}) {
  const router = useRouter();
  const { ejecutar, enviando, error, limpiar } = useAccion();
  const [todo, setTodo] = useState(true);
  const [cantidades, setCantidades] = useState<Record<number, string>>(
    Object.fromEntries(contenido.map((c) => [c.modeloId, String(c.cantidad)])),
  );
  const [motivoId, setMotivoId] = useState<number | null>(null);
  const [nota, setNota] = useState("");

  const parcial = contenido
    .map((c) => ({ modeloId: c.modeloId, cantidad: Number(cantidades[c.modeloId] || 0) }))
    .filter((l) => l.cantidad > 0);

  const salen = todo ? bulto.cantidad : parcial.reduce((s, l) => s + l.cantidad, 0);
  const quedan = bulto.cantidad - salen;
  /**
   * La conversión a suelto no se le pregunta al operario: es una consecuencia
   * de la regla comercial, no una decisión de piso. Se le avisa, nada más.
   */
  const seConvierte = quedan > 0 && bulto.packaging !== "suelto";
  const excedido = contenido.some(
    (c) => Number(cantidades[c.modeloId] || 0) > c.cantidad,
  );
  const motivo = motivos.find((m) => m.id === motivoId) ?? null;
  const faltaNota = motivo?.pideNota === true && nota.trim() === "";
  const listo = motivoId != null && salen > 0 && !excedido && !faltaNota;
  /**
   * Los motivos en tres grupos, porque son tres cosas distintas: lo que se va
   * de la fábrica (una venta, una muestra), lo que se PIERDE en el depósito
   * (la merma) y lo que vuelve al rack (un rearmado).
   */
  const grupos = [
    { titulo: "Sale de la fábrica", motivos: motivos.filter((m) => !m.esMerma && m.esEgreso) },
    { titulo: "Merma: se perdió o se arruinó en el depósito", motivos: motivos.filter((m) => m.esMerma) },
    { titulo: "Vuelve al rack", motivos: motivos.filter((m) => !m.esMerma && !m.esEgreso) },
  ].filter((g) => g.motivos.length > 0);

  /**
   * Un objeto sale entero y sin motivo: no es stock, así que no hay venta ni
   * rotura que medir. Lo que haga falta decir va en la nota del movimiento.
   */
  if (bulto.esObjeto) {
    return (
      <div className="tarjeta space-y-4 p-5">
        <h2 className="text-base font-bold text-slate-900">Egreso del objeto</h2>
        {error && <Aviso>{error}</Aviso>}
        <input
          className="campo"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Nota (opcional): a dónde va, quién lo llevó…"
        />
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="boton-secundario" onClick={cancelar}>
            Cancelar
          </button>
          <button
            type="button"
            className="boton-peligro"
            disabled={enviando}
            onClick={() => {
              limpiar();
              void ejecutar(
                () => sacar({ bultoId: bulto.id, nota: nota.trim() || undefined }),
                () => {
                  router.push("/mover");
                  router.refresh();
                },
              );
            }}
          >
            {enviando ? "Guardando…" : "Registrar egreso"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="tarjeta space-y-4 p-5">
      <h2 className="text-base font-bold text-slate-900">Egreso del rack</h2>
      {error && <Aviso>{error}</Aviso>}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setTodo(true)}
          className={`min-h-12 rounded-xl text-sm font-semibold ${todo ? "bg-slate-900 text-white" : "bg-white text-slate-700 ring-1 ring-slate-300"}`}
        >
          Todo el bulto
        </button>
        <button
          type="button"
          onClick={() => setTodo(false)}
          className={`min-h-12 rounded-xl text-sm font-semibold ${!todo ? "bg-slate-900 text-white" : "bg-white text-slate-700 ring-1 ring-slate-300"}`}
        >
          Una parte
        </button>
      </div>

      {!todo && (
        <ul className="space-y-2">
          {contenido.map((c) => (
            <li key={c.modeloId} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">
                {c.nombre}
                <span className="ml-1 font-normal text-slate-400">
                  de {numero(c.cantidad)}
                </span>
              </span>
              <input
                className="campo w-24 text-right"
                inputMode="numeric"
                value={cantidades[c.modeloId] ?? ""}
                onChange={(e) =>
                  setCantidades((v) => ({
                    ...v,
                    [c.modeloId]: e.target.value.replace(/\D/g, ""),
                  }))
                }
                aria-label={`Cuánto sale de ${c.nombre}`}
              />
            </li>
          ))}
        </ul>
      )}

      {excedido && <Aviso>No podés sacar más de lo que hay en el bulto.</Aviso>}

      <div>
        <span className="etiqueta">Por qué sale</span>
        <div className="space-y-3">
          {grupos.map((g) => (
            <div key={g.titulo}>
              <p className="mb-1.5 text-xs font-semibold text-slate-500">{g.titulo}</p>
              <div className="grid gap-2">
                {g.motivos.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMotivoId(m.id)}
                    className={`min-h-12 rounded-xl px-4 text-left text-sm font-semibold ${
                      motivoId === m.id
                        ? m.esMerma
                          ? "bg-red-700 text-white"
                          : "bg-slate-900 text-white"
                        : "bg-white text-slate-700 ring-1 ring-slate-300"
                    }`}
                  >
                    {m.nombre}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <label className="block">
        {motivo?.pideNota && <span className="etiqueta">Qué pasó (obligatorio)</span>}
        <input
          className={`campo ${faltaNota ? "ring-2 ring-amber-400" : ""}`}
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder={
            motivo?.esMerma
              ? motivo.pideNota
                ? "Contá qué pasó"
                : "Nota (opcional): cómo pasó, dónde estaba…"
              : "Nota (opcional): remito, cliente…"
          }
        />
      </label>

      {motivo?.esMerma && (
        <Aviso tono="advertencia">
          Se registra como <strong>merma</strong>: producto perdido en el depósito. Resta del stock y se cuenta
          aparte, no como una salida de la fábrica.
        </Aviso>
      )}

      {seConvierte && (
        <Aviso tono="info">
          Sacar una parte deja {numero(quedan)} {bulto.unidadPlural}, que ya no
          son un {ETIQUETA_PACKAGING[bulto.packaging].toLowerCase()}: el bulto
          pasa a <strong>suelto</strong>.
        </Aviso>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="boton-secundario" onClick={cancelar}>
          Cancelar
        </button>
        <button
          type="button"
          className="boton-peligro"
          disabled={!listo || enviando}
          onClick={() => {
            limpiar();
            void ejecutar(
              () =>
                sacar({
                  bultoId: bulto.id,
                  motivoId: motivoId!,
                  parcial: todo ? undefined : parcial,
                  nota: nota.trim() || undefined,
                }),
              () => {
                router.push("/mover");
                router.refresh();
              },
            );
          }}
        >
          {enviando ? "Guardando…" : `${motivo?.esMerma ? "Merma" : "Egreso"} de ${numero(salen)}`}
        </button>
      </div>
    </div>
  );
}

function Mover({
  bulto,
  posiciones,
  cancelar,
}: {
  bulto: Bulto;
  posiciones: PosicionLibre[];
  cancelar: () => void;
}) {
  const router = useRouter();
  const { ejecutar, enviando, error, limpiar } = useAccion();
  const [posicionId, setPosicionId] = useState<number | null>(null);
  const [alLimbo, setAlLimbo] = useState(false);

  const listo = alLimbo || posicionId != null;
  const destino = !alLimbo ? posiciones.find((p) => p.id === posicionId) : undefined;
  const ajeno =
    !bulto.esObjeto && destino != null && esAjeno(destino.empresaId, bulto.empresasIds);

  return (
    <div className="tarjeta space-y-4 p-5">
      <h2 className="text-base font-bold text-slate-900">Reubicación</h2>
      <p className="text-sm text-slate-500">
        No suma ni resta: el bulto sigue en el rack y sigue disponible.
      </p>
      {error && <Aviso>{error}</Aviso>}

      {posiciones.length === 0 ? (
        <Aviso tono="info">No hay ninguna posición con lugar.</Aviso>
      ) : (
        <SelectorPosicion
          posiciones={posiciones}
          valor={posicionId}
          onCambio={setPosicionId}
          deshabilitado={alLimbo}
        />
      )}

      {ajeno && destino && (
        <Aviso tono="advertencia">
          {avisoAjeno(bulto, { codigo: destino.rack, empresa: destino.empresa }, "Este palet")}{" "}
          Se puede mover igual, pero va a quedar marcado en el tablero.
        </Aviso>
      )}

      {bulto.ubicacion && (
        <label className="flex items-start gap-2.5 text-sm text-slate-700">
          <input
            type="checkbox"
            className="mt-0.5 h-5 w-5"
            checked={alLimbo}
            onChange={(e) => setAlLimbo(e.target.checked)}
          />
          <span>
            Dejarlo <strong>sin ubicar</strong> — lo bajo del rack pero sigue
            siendo stock.
          </span>
        </label>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="boton-secundario" onClick={cancelar}>
          Cancelar
        </button>
        <button
          type="button"
          className="boton-primario"
          disabled={!listo || enviando}
          onClick={() => {
            limpiar();
            void ejecutar(
              () =>
                mover({
                  bultoId: bulto.id,
                  posicionId: alLimbo ? null : posicionId,
                }),
              () => {
                router.push("/mover");
                router.refresh();
              },
            );
          }}
        >
          {enviando ? "Guardando…" : "Reubicar"}
        </button>
      </div>
    </div>
  );
}
