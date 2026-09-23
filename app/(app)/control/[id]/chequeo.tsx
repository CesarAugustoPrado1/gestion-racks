"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  confirmar,
  corregirCantidades,
  marcarAusente,
  registrarEncontrado,
} from "@/lib/acciones/control";
import { useAccion } from "@/components/usar-accion";
import { Aviso } from "@/components/ui";
import { validarComposicion } from "@/lib/bultos";
import { ETIQUETA_PACKAGING, PACKAGINGS, numero } from "@/lib/formato";
import type { BultoEnPosicion, ModeloParaCargar } from "@/lib/consultas";
import type { Packaging } from "@/lib/db/schema";

type Modo = "mirando" | "cantidades" | "ausente" | "encontrado";

export function Chequeo({
  posicion,
  bultos,
  motivos,
  modelos,
}: {
  posicion: { id: number; codigo: string; bultos: number; invasor: string | null };
  bultos: BultoEnPosicion[];
  motivos: Array<{ id: number; nombre: string }>;
  modelos: ModeloParaCargar[];
}) {
  const router = useRouter();
  const { ejecutar, enviando, error, limpiar } = useAccion();
  const [modo, setModo] = useState<Modo>("mirando");
  const [elegido, setElegido] = useState<BultoEnPosicion | null>(null);

  function volverALaLista() {
    router.push("/control");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {error && <Aviso>{error}</Aviso>}

      <div className="tarjeta p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-500">
          El sistema dice que acá hay
        </h2>

        {bultos.length === 0 && posicion.invasor ? (
          /**
           * Tapada por un bulto alto de abajo. Decir "Nada. Vacía." acá sería
           * mentirle al operario en la pantalla donde justamente viene a
           * comparar con la realidad: si mira y ve el palet asomando, iba a
           * reportar una diferencia que no existe.
           */
          <>
            <p className="text-base font-semibold text-slate-700">
              Nada parado acá, pero el hueco está tomado.
            </p>
            <p className="mt-1 text-sm text-slate-600">
              El bulto <span className="codigo">{posicion.invasor}</span>, que
              está en la posición de abajo, es más alto que su nivel y sobresale
              hasta acá. Si lo ves así, está bien.
            </p>
          </>
        ) : bultos.length === 0 ? (
          <p className="text-base font-semibold text-slate-700">Nada. Vacía.</p>
        ) : (
          <ul className="space-y-3">
            {bultos.map((b) => (
              <li key={b.id} className="rounded-xl bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-slate-900">
                    {ETIQUETA_PACKAGING[b.packaging]}
                    {b.profundidad != null && (
                      <span className="ml-2 font-normal text-slate-500">
                        {b.profundidad === 1 ? "al frente" : `${b.profundidad}º`}
                      </span>
                    )}
                  </span>
                  <span className="codigo text-xs text-slate-400">{b.codigo}</span>
                </div>
                <ul className="mt-1">
                  {b.contenido.map((c) => (
                    <li
                      key={c.modeloId}
                      className="flex justify-between text-sm text-slate-700"
                    >
                      <span>{c.nombre}</span>
                      <span className="cifra">{numero(c.cantidad)}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>

      {modo === "mirando" && (
        <>
          {/**
           * El caso típico —está todo bien— sale en UN TOQUE y sin
           * confirmación. Es lo que va a pasar en la enorme mayoría de las
           * posiciones, y si pide confirmar, el operario aprende a tocar dos
           * veces sin leer y el chequeo deja de significar algo.
           */}
          <button
            type="button"
            className="boton-primario w-full py-5 text-lg"
            disabled={enviando}
            onClick={() => {
              limpiar();
              void ejecutar(() => confirmar(posicion.id), volverALaLista);
            }}
          >
            {enviando ? "Guardando…" : "Está bien"}
          </button>

          <div className="tarjeta space-y-2 p-5">
            <h2 className="text-sm font-semibold text-slate-500">
              Hay una diferencia
            </h2>
            {/* Cada par de botones dice de QUÉ bulto es. Con tres bultos en
                la posición, tres pares idénticos no le sirven a nadie: es el
                mismo error que dos filas que dicen C-3 y no se distinguen. */}
            {bultos.map((b) => (
              <div key={b.id} className="rounded-xl bg-slate-50 p-3">
                <p className="mb-2 text-sm font-semibold text-slate-700">
                  {ETIQUETA_PACKAGING[b.packaging]}
                  {b.profundidad != null && (
                    <span className="font-normal text-slate-500">
                      {" "}
                      {b.profundidad === 1 ? "al frente" : `${b.profundidad}º`}
                    </span>
                  )}
                  <span className="codigo ml-2 text-xs font-normal text-slate-400">
                    {b.codigo}
                  </span>
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className="boton-secundario text-sm"
                    onClick={() => {
                      setElegido(b);
                      setModo("cantidades");
                    }}
                  >
                    Otra cantidad
                  </button>
                  <button
                    type="button"
                    className="boton-secundario text-sm"
                    onClick={() => {
                      setElegido(b);
                      setModo("ausente");
                    }}
                  >
                    No está acá
                  </button>
                </div>
              </div>
            ))}
            <button
              type="button"
              className="boton-secundario w-full text-sm"
              onClick={() => setModo("encontrado")}
            >
              Hay algo que el sistema no tiene
            </button>
          </div>
        </>
      )}

      {modo === "cantidades" && elegido && (
        <Cantidades
          posicionId={posicion.id}
          bulto={elegido}
          motivos={motivos}
          cancelar={() => setModo("mirando")}
          listo={volverALaLista}
        />
      )}

      {modo === "ausente" && elegido && (
        <Ausente
          posicionId={posicion.id}
          bulto={elegido}
          motivos={motivos}
          cancelar={() => setModo("mirando")}
          listo={volverALaLista}
        />
      )}

      {modo === "encontrado" && (
        <Encontrado
          posicionId={posicion.id}
          modelos={modelos}
          motivos={motivos}
          cancelar={() => setModo("mirando")}
          listo={volverALaLista}
        />
      )}
    </div>
  );
}

function SelectorMotivo({
  motivos,
  elegido,
  elegir,
}: {
  motivos: Array<{ id: number; nombre: string }>;
  elegido: number | null;
  elegir: (id: number) => void;
}) {
  return (
    <div>
      <span className="etiqueta">Qué pasó</span>
      <div className="grid gap-2">
        {motivos.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => elegir(m.id)}
            className={`min-h-12 rounded-xl px-4 text-left text-sm font-semibold ${
              elegido === m.id
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-700 ring-1 ring-slate-300"
            }`}
          >
            {m.nombre}
          </button>
        ))}
      </div>
    </div>
  );
}

function Cantidades({
  posicionId,
  bulto,
  motivos,
  cancelar,
  listo,
}: {
  posicionId: number;
  bulto: BultoEnPosicion;
  motivos: Array<{ id: number; nombre: string }>;
  cancelar: () => void;
  listo: () => void;
}) {
  const { ejecutar, enviando, error, limpiar } = useAccion();
  const [valores, setValores] = useState<Record<number, string>>(
    Object.fromEntries(bulto.contenido.map((c) => [c.modeloId, String(c.cantidad)])),
  );
  const [motivoId, setMotivoId] = useState<number | null>(null);
  const [nota, setNota] = useState("");

  const cantidades = bulto.contenido.map((c) => ({
    modeloId: c.modeloId,
    cantidad: Number(valores[c.modeloId] || 0),
  }));
  const nuevo = cantidades.reduce((s, c) => s + c.cantidad, 0);
  const diferencia = nuevo - bulto.cantidad;

  return (
    <div className="tarjeta space-y-4 p-5">
      <h2 className="text-base font-bold text-slate-900">
        Cuánto hay de verdad
      </h2>
      {error && <Aviso>{error}</Aviso>}

      <ul className="space-y-2">
        {bulto.contenido.map((c) => (
          <li key={c.modeloId} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">
              {c.nombre}
              <span className="ml-1 font-normal text-slate-400">
                decía {numero(c.cantidad)}
              </span>
            </span>
            <input
              className="campo w-24 text-right"
              inputMode="numeric"
              value={valores[c.modeloId] ?? ""}
              onChange={(e) =>
                setValores((v) => ({
                  ...v,
                  [c.modeloId]: e.target.value.replace(/\D/g, ""),
                }))
              }
              aria-label={`Cantidad real de ${c.nombre}`}
            />
          </li>
        ))}
      </ul>

      {diferencia !== 0 && (
        <Aviso tono="info">
          {/* El error se dice con el número, no con un adjetivo: es lo que
              después se va a medir. */}
          Diferencia de <strong>{diferencia > 0 ? "+" : ""}{numero(diferencia)}</strong>{" "}
          {bulto.unidadPlural}. Queda registrada.
        </Aviso>
      )}

      <SelectorMotivo motivos={motivos} elegido={motivoId} elegir={setMotivoId} />

      <input
        className="campo"
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        placeholder="Nota (opcional)"
      />

      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="boton-secundario" onClick={cancelar}>
          Cancelar
        </button>
        <button
          type="button"
          className="boton-primario"
          disabled={enviando || motivoId == null || diferencia === 0}
          onClick={() => {
            limpiar();
            void ejecutar(
              () =>
                corregirCantidades({
                  posicionId,
                  bultoId: bulto.id,
                  cantidades,
                  motivoId: motivoId!,
                  nota: nota.trim() || undefined,
                }),
              listo,
            );
          }}
        >
          {enviando ? "Corrigiendo…" : "Corregir"}
        </button>
      </div>
    </div>
  );
}

function Ausente({
  posicionId,
  bulto,
  motivos,
  cancelar,
  listo,
}: {
  posicionId: number;
  bulto: BultoEnPosicion;
  motivos: Array<{ id: number; nombre: string }>;
  cancelar: () => void;
  listo: () => void;
}) {
  const { ejecutar, enviando, error, limpiar } = useAccion();
  const [motivoId, setMotivoId] = useState<number | null>(null);
  const [nota, setNota] = useState("");

  return (
    <div className="tarjeta space-y-4 p-5">
      <h2 className="text-base font-bold text-slate-900">
        {bulto.codigo} no está acá
      </h2>
      <Aviso tono="info">
        Pasa a <strong>sin ubicar</strong>, no se da de baja: el producto existe,
        lo que se perdió es saber dónde está. Va a aparecer en la lista de lo que
        el autoelevador tiene que ir a encontrar.
      </Aviso>
      {error && <Aviso>{error}</Aviso>}

      <SelectorMotivo motivos={motivos} elegido={motivoId} elegir={setMotivoId} />

      <input
        className="campo"
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        placeholder="Nota (opcional): dónde creés que está"
      />

      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="boton-secundario" onClick={cancelar}>
          Cancelar
        </button>
        <button
          type="button"
          className="boton-primario"
          disabled={enviando || motivoId == null}
          onClick={() => {
            limpiar();
            void ejecutar(
              () =>
                marcarAusente({
                  posicionId,
                  bultoId: bulto.id,
                  motivoId: motivoId!,
                  nota: nota.trim() || undefined,
                }),
              listo,
            );
          }}
        >
          {enviando ? "Guardando…" : "No está acá"}
        </button>
      </div>
    </div>
  );
}

function Encontrado({
  posicionId,
  modelos,
  motivos,
  cancelar,
  listo,
}: {
  posicionId: number;
  modelos: ModeloParaCargar[];
  motivos: Array<{ id: number; nombre: string }>;
  cancelar: () => void;
  listo: () => void;
}) {
  const { ejecutar, enviando, error, limpiar } = useAccion();
  const [packaging, setPackaging] = useState<Packaging>("palet");
  const [lineas, setLineas] = useState<Array<{ modeloId: number; cantidad: string }>>([]);
  const [motivoId, setMotivoId] = useState<number | null>(null);
  const [nota, setNota] = useState("");

  const contenido = lineas
    .map((l) => ({ modeloId: l.modeloId, cantidad: Number(l.cantidad) }))
    .filter((l) => l.cantidad > 0);
  const problema =
    contenido.length > 0 ? validarComposicion(packaging, contenido) : null;

  return (
    <div className="tarjeta space-y-4 p-5">
      <h2 className="text-base font-bold text-slate-900">
        Hay algo que el sistema no tiene
      </h2>
      {error && <Aviso>{error}</Aviso>}

      <div>
        <span className="etiqueta">Packaging</span>
        <div className="grid grid-cols-3 gap-2">
          {PACKAGINGS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPackaging(p)}
              className={`min-h-12 rounded-xl text-sm font-semibold ${
                packaging === p
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-700 ring-1 ring-slate-300"
              }`}
            >
              {ETIQUETA_PACKAGING[p]}
            </button>
          ))}
        </div>
      </div>

      <ul className="space-y-2">
        {lineas.map((l) => {
          const m = modelos.find((x) => x.id === l.modeloId)!;
          return (
            <li key={l.modeloId} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">
                {m.nombre}
              </span>
              <input
                className="campo w-24 text-right"
                inputMode="numeric"
                value={l.cantidad}
                onChange={(e) =>
                  setLineas((ls) =>
                    ls.map((x) =>
                      x.modeloId === l.modeloId
                        ? { ...x, cantidad: e.target.value.replace(/\D/g, "") }
                        : x,
                    ),
                  )
                }
                aria-label={`Cantidad de ${m.nombre}`}
              />
              <button
                type="button"
                className="px-2 text-lg text-slate-400"
                onClick={() =>
                  setLineas((ls) => ls.filter((x) => x.modeloId !== l.modeloId))
                }
                aria-label={`Quitar ${m.nombre}`}
              >
                ✕
              </button>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap gap-1.5">
        {modelos.map((m) => (
          <button
            key={m.id}
            type="button"
            disabled={lineas.some((l) => l.modeloId === m.id)}
            onClick={() =>
              setLineas((l) => [
                ...l,
                {
                  modeloId: m.id,
                  cantidad: m.normas[packaging] != null ? String(m.normas[packaging]) : "",
                },
              ])
            }
            className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-40"
          >
            {m.nombre}
          </button>
        ))}
      </div>

      {problema && <Aviso tono="info">{problema}</Aviso>}

      <SelectorMotivo motivos={motivos} elegido={motivoId} elegir={setMotivoId} />

      <input
        className="campo"
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        placeholder="Nota (opcional)"
      />

      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="boton-secundario" onClick={cancelar}>
          Cancelar
        </button>
        <button
          type="button"
          className="boton-primario"
          disabled={enviando || motivoId == null || contenido.length === 0 || !!problema}
          onClick={() => {
            limpiar();
            void ejecutar(
              () =>
                registrarEncontrado({
                  posicionId,
                  contenido,
                  packaging,
                  motivoId: motivoId!,
                  nota: nota.trim() || undefined,
                }),
              listo,
            );
          }}
        >
          {enviando ? "Guardando…" : "Registrar"}
        </button>
      </div>
    </div>
  );
}
