"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  cargarEnPosicion,
  cerrarCargaInicial,
  confirmarExistenteEnCarga,
  deshacerEnCarga,
  marcarVaciaEnCarga,
} from "@/lib/acciones/carga";
import { useAccion } from "@/components/usar-accion";
import { Aviso } from "@/components/ui";
import { SelectorPosicion } from "@/components/selector-posicion";
import { ElegirModelo } from "@/components/elegir-modelo";
import { validarComposicion, validarDescripcion } from "@/lib/bultos";
import { ETIQUETA_PACKAGING, PACKAGINGS } from "@/lib/formato";
import type { ModeloParaCargar, PosicionDeCarga } from "@/lib/consultas";
import type { Calidad, Packaging } from "@/lib/db/schema";
import { TildeSegunda } from "@/components/calidad";

const hoy = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });

/**
 * La carga inicial en el celular. Arriba el avance, después DÓNDE está parado
 * -grupo, calle o columna, altura, profundidad- y abajo QUÉ hay ahí.
 *
 * Cada posición arranca en blanco: no se arrastra lo cargado en la anterior.
 * Un formulario que viene lleno invita a tocar "Cargar" sin mirar, y en una
 * carga inicial eso es un bulto inventado en el lugar equivocado.
 */
export function Carga({
  grupo,
  grupos,
  posiciones,
  modelos,
}: {
  grupo: { id: number; codigo: string };
  grupos: Array<{ codigo: string; href: string; actual: boolean; detalle?: string }>;
  posiciones: PosicionDeCarga[];
  modelos: ModeloParaCargar[];
}) {
  const router = useRouter();
  const arriba = useRef<HTMLDivElement>(null);
  const primeraPendiente = posiciones.find((p) => !p.relevada)?.id ?? posiciones[0]?.id ?? null;
  const [elegidaId, setElegidaId] = useState<number | null>(primeraPendiente);
  const [avisos, setAvisos] = useState<{ codigo: string; textos: string[] } | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);

  const relevadas = posiciones.filter((p) => p.relevada).length;
  const elegida = posiciones.find((p) => p.id === elegidaId) ?? null;

  /** La siguiente pendiente DESPUÉS de esta, en el orden de la recorrida. */
  function siguiente(desdeId: number) {
    const i = posiciones.findIndex((p) => p.id === desdeId);
    const resto = [...posiciones.slice(i + 1), ...posiciones.slice(0, i)];
    return resto.find((p) => !p.relevada)?.id ?? desdeId;
  }

  function avanzar(desdeId: number, mensaje: string) {
    setHecho(mensaje);
    setElegidaId(siguiente(desdeId));
    router.refresh();
    arriba.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="space-y-4">
      <div ref={arriba} className="tarjeta scroll-mt-20 p-4">
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-semibold text-slate-800">
            {relevadas} de {posiciones.length} relevadas
          </span>
          <span className="text-slate-500">
            {posiciones.length - relevadas === 0 ? "¡Listo! Ya se puede cerrar." : `faltan ${posiciones.length - relevadas}`}
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-confiable transition-all"
            style={{ width: `${posiciones.length ? (relevadas / posiciones.length) * 100 : 0}%` }}
          />
        </div>
      </div>

      {hecho && <Aviso tono="exito">{hecho}</Aviso>}
      {avisos && (
        <Aviso tono="advertencia">
          <strong>{avisos.codigo}</strong> se cargó, pero hay algo para revisar: {avisos.textos.join(" ")}
        </Aviso>
      )}

      <div className="tarjeta p-5">
        <span className="etiqueta">Dónde estás</span>
        <SelectorPosicion
          posiciones={posiciones}
          valor={elegidaId}
          onCambio={(id) => {
            setElegidaId(id);
            setHecho(null);
            setAvisos(null);
          }}
          hecha={(p) => p.relevada}
          grupos={grupos}
        />
        <p className="mt-3 text-xs text-slate-500">
          En verde, lo ya relevado. Al cargar, pasa sola a la siguiente pendiente.
        </p>
      </div>

      {elegida ? (
        <Posicion
          key={elegida.id}
          p={elegida}
          modelos={modelos}
          alCargar={(codigo, textos) => {
            setAvisos(textos.length ? { codigo, textos } : null);
            avanzar(elegida.id, `${elegida.codigo}: cargado ${codigo}.`);
          }}
          alVaciar={() => {
            setAvisos(null);
            avanzar(elegida.id, `${elegida.codigo}: ${elegida.ocupante ? "confirmada" : "vacía"}.`);
          }}
          alDeshacer={() => {
            setAvisos(null);
            setHecho(`${elegida.codigo} volvió a pendiente.`);
            router.refresh();
          }}
        />
      ) : (
        <p className="text-center text-sm text-slate-500">Terminá de elegir la posición.</p>
      )}

      <Cerrar grupo={grupo} pendientes={posiciones.length - relevadas} />
    </div>
  );
}

function Posicion({
  p,
  modelos,
  alCargar,
  alVaciar,
  alDeshacer,
}: {
  p: PosicionDeCarga;
  modelos: ModeloParaCargar[];
  alCargar: (codigo: string, avisos: string[]) => void;
  alVaciar: () => void;
  alDeshacer: () => void;
}) {
  const { ejecutar, enviando, error, limpiar } = useAccion();

  // Ya relevada: se muestra lo que quedó y se puede deshacer.
  if (p.relevada) {
    return (
      <div className="tarjeta space-y-3 p-5">
        <div className="flex items-center justify-between">
          <h2 className="codigo text-xl text-slate-900">{p.codigo}</h2>
          <span className="chip bg-confiable-suave text-confiable">relevada</span>
        </div>
        {error && <Aviso>{error}</Aviso>}
        {p.ocupante ? (
          <div className="text-sm text-slate-700">
            <p className="font-semibold">{p.ocupante.contenido}</p>
            <p className="mt-0.5 text-xs text-slate-500">
              <span className="codigo">{p.ocupante.codigo}</span> · ingresó el{" "}
              {p.ocupante.creadoEn.toLocaleDateString("es-AR")}
            </p>
          </div>
        ) : (
          <p className="text-sm text-slate-700">{p.invasor ? `La tapa ${p.invasor} desde abajo.` : "Vacía."}</p>
        )}
        {(!p.ocupante || p.ocupante.deLaCarga) && (
          <button
            type="button"
            className="boton-secundario w-full"
            disabled={enviando}
            onClick={() => {
              limpiar();
              void ejecutar(() => deshacerEnCarga(p.id), alDeshacer);
            }}
          >
            {enviando ? "Deshaciendo…" : "Me equivoqué: deshacer"}
          </button>
        )}
      </div>
    );
  }

  // Tiene algo que ya estaba en el sistema antes de la carga, o la tapa uno de
  // abajo: no se carga encima, se confirma o se corrige como siempre.
  if (p.ocupante || p.invasor) {
    return (
      <div className="tarjeta space-y-3 p-5">
        <h2 className="codigo text-xl text-slate-900">{p.codigo}</h2>
        {error && <Aviso>{error}</Aviso>}
        {p.ocupante ? (
          <>
            <p className="text-sm text-slate-700">
              El sistema ya tiene acá <strong>{p.ocupante.contenido}</strong> (
              <span className="codigo">{p.ocupante.codigo}</span>), cargado antes de abrir la carga.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <a href={`/control/${p.id}`} className="boton-secundario flex items-center justify-center text-center">
                No coincide
              </a>
              <button
                type="button"
                className="boton-primario"
                disabled={enviando}
                onClick={() => {
                  limpiar();
                  void ejecutar(() => confirmarExistenteEnCarga(p.id), alVaciar);
                }}
              >
                {enviando ? "Guardando…" : "Está"}
              </button>
            </div>
            <p className="text-xs text-slate-500">Si no coincide, se corrige desde el chequeo de siempre.</p>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-700">
              La tapa <strong className="codigo">{p.invasor}</strong>, que sobresale desde abajo.
            </p>
            <button
              type="button"
              className="boton-primario w-full"
              disabled={enviando}
              onClick={() => {
                limpiar();
                void ejecutar(() => marcarVaciaEnCarga(p.id), alVaciar);
              }}
            >
              {enviando ? "Guardando…" : "Es así"}
            </button>
          </>
        )}
      </div>
    );
  }

  return <Formulario p={p} modelos={modelos} alCargar={alCargar} alVaciar={alVaciar} />;
}

/**
 * Lo que hay en una posición. Arranca SIEMPRE en blanco: producto, palet, de
 * primera, sin modelos y SIN FECHA. Nada se arrastra de la posición anterior: lo que viene
 * puesto se termina cargando sin mirar, y la fecha de ingreso de un palet no
 * dice nada de la del de al lado.
 */
function Formulario({
  p,
  modelos,
  alCargar,
  alVaciar,
}: {
  p: PosicionDeCarga;
  modelos: ModeloParaCargar[];
  alCargar: (codigo: string, avisos: string[]) => void;
  alVaciar: () => void;
}) {
  const { ejecutar, enviando, error, limpiar } = useAccion();
  const [objeto, setObjeto] = useState(false);
  const [packaging, setPackaging] = useState<Packaging>("palet");
  const [calidad, setCalidad] = useState<Calidad>("primera");
  const [lineas, setLineas] = useState<Array<{ modeloId: number; cantidad: string }>>([]);
  /** El modelo recién tocado: ahí salta el cursor si hay que escribir la cantidad. */
  const [recienTocado, setRecienTocado] = useState<number | null>(null);
  const [descripcion, setDescripcion] = useState("");
  const [nota, setNota] = useState("");
  /** Vacía a propósito: ni la de la posición anterior ni "hoy", que en una carga inicial nunca es. */
  const [fecha, setFecha] = useState("");

  /**
   * Al cambiar el packaging la cantidad sale de la norma del nuevo. El suelto
   * no tiene norma: la cantidad queda VACÍA para que se cuente, y no arrastra
   * la del palet, que en un suelto nunca es la que hay.
   */
  function cambiarPackaging(x: Packaging) {
    setPackaging(x);
    setLineas((ls) =>
      ls.map((l) => {
        const norma = modelos.find((m) => m.id === l.modeloId)?.normas[x];
        return { ...l, cantidad: norma != null ? String(norma) : "" };
      }),
    );
  }

  function agregar(m: ModeloParaCargar) {
    setRecienTocado(m.id);
    setLineas((ls) => [
      ...ls,
      { modeloId: m.id, cantidad: m.normas[packaging] != null ? String(m.normas[packaging]) : "" },
    ]);
  }

  const contenido = lineas
    .map((l) => ({ modeloId: l.modeloId, cantidad: Number(l.cantidad) }))
    .filter((l) => l.cantidad > 0);
  const faltaCantidad = !objeto && lineas.some((l) => !(Number(l.cantidad) > 0));
  const problema = objeto ? null : contenido.length > 0 ? validarComposicion(packaging, contenido) : null;
  const fechaValida = /^\d{4}-\d{2}-\d{2}$/.test(fecha) && fecha <= hoy();
  const completo =
    fechaValida &&
    (objeto ? validarDescripcion(descripcion) == null : contenido.length > 0 && !faltaCantidad && !problema);

  return (
    <div className="tarjeta space-y-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="codigo text-xl text-slate-900">{p.codigo}</h2>
        {p.fueraDeUso && <span className="text-xs text-slate-500">figura {p.fueraDeUso}</span>}
      </div>
      {error && <Aviso>{error}</Aviso>}

      <button
        type="button"
        className="min-h-14 w-full rounded-xl bg-slate-100 text-base font-semibold text-slate-800 ring-1 ring-slate-300"
        disabled={enviando}
        onClick={() => {
          limpiar();
          void ejecutar(() => marcarVaciaEnCarga(p.id), alVaciar);
        }}
      >
        Está vacía
      </button>

      <p className="text-center text-xs font-medium uppercase tracking-wide text-slate-400">o lo que hay</p>

      <div className="grid grid-cols-2 gap-2">
        {[
          { valor: false, texto: "Producto" },
          { valor: true, texto: "Objeto" },
        ].map((o) => (
          <button
            key={o.texto}
            type="button"
            onClick={() => setObjeto(o.valor)}
            className={`min-h-12 rounded-xl text-sm font-semibold ${
              objeto === o.valor ? "bg-slate-900 text-white" : "bg-white text-slate-700 ring-1 ring-slate-300"
            }`}
          >
            {o.texto}
          </button>
        ))}
      </div>

      {objeto ? (
        <input
          className="campo"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          placeholder="Qué hay: 6 sillas a reparar"
          maxLength={200}
        />
      ) : (
        <>
          <div>
            <span className="etiqueta">Packaging</span>
            <div className="grid grid-cols-3 gap-2">
              {PACKAGINGS.map((x) => (
                <button
                  key={x}
                  type="button"
                  onClick={() => cambiarPackaging(x)}
                  className={`min-h-12 rounded-xl text-sm font-semibold ${
                    packaging === x ? "bg-slate-900 text-white" : "bg-white text-slate-700 ring-1 ring-slate-300"
                  }`}
                >
                  {ETIQUETA_PACKAGING[x]}
                </button>
              ))}
            </div>
            <div className="mt-3">
              <TildeSegunda valor={calidad} onCambio={setCalidad} />
            </div>
          </div>

          <ElegirModelo modelos={modelos} yaElegidos={lineas.map((l) => l.modeloId)} alElegir={agregar} />

          {lineas.length > 0 && (
            <div>
              <span className="etiqueta">Qué lleva</span>
              <ul className="space-y-2">
                {lineas.map((l) => {
                  const m = modelos.find((x) => x.id === l.modeloId);
                  if (!m) return null;
                  return (
                    <li key={l.modeloId} className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">{m.nombre}</span>
                      <input
                        className={`campo w-24 text-right ${Number(l.cantidad) > 0 ? "" : "ring-2 ring-amber-400"}`}
                        inputMode="numeric"
                        placeholder="Cant."
                        autoFocus={recienTocado === l.modeloId && l.cantidad === ""}
                        value={l.cantidad}
                        onChange={(e) =>
                          setLineas((ls) =>
                            ls.map((x) =>
                              x.modeloId === l.modeloId ? { ...x, cantidad: e.target.value.replace(/\D/g, "") } : x,
                            ),
                          )
                        }
                        aria-label={`Cantidad de ${m.nombre}`}
                      />
                      <button
                        type="button"
                        className="px-2 text-lg text-slate-400"
                        onClick={() => setLineas((ls) => ls.filter((x) => x.modeloId !== l.modeloId))}
                        aria-label={`Quitar ${m.nombre}`}
                      >
                        ✕
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {faltaCantidad && (
            <Aviso tono="info">
              {packaging === "suelto"
                ? "Suelto no tiene cantidad fija: escribí cuántas hay de cada modelo."
                : "Escribí la cantidad de cada modelo."}
            </Aviso>
          )}
          {problema && <Aviso tono="info">{problema}</Aviso>}
        </>
      )}

      <label className="block">
        <span className="etiqueta">Desde cuándo está (aproximado)</span>
        <input
          type="date"
          className="campo"
          value={fecha}
          max={hoy()}
          onChange={(e) => setFecha(e.target.value)}
        />
        {!fechaValida && <span className="mt-1 block text-xs text-amber-700">Poné la fecha: con el mes alcanza.</span>}
      </label>

      <input className="campo" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota (opcional)" />

      <button
        type="button"
        className="boton-primario w-full"
        disabled={enviando || !completo}
        onClick={() => {
          limpiar();
          void ejecutar(
            () =>
              cargarEnPosicion({
                posicionId: p.id,
                packaging: objeto ? "objeto" : packaging,
                calidad: objeto ? "primera" : calidad,
                contenido: objeto ? [] : contenido,
                descripcion: objeto ? descripcion.trim() : undefined,
                fechaIngreso: fecha,
                nota: nota.trim() || undefined,
              }),
            (r) => alCargar(r.codigo, r.avisos),
          );
        }}
      >
        {enviando ? "Guardando…" : !objeto && calidad === "segunda" ? "Cargar de segunda" : "Cargar"}
      </button>
    </div>
  );
}

/** Al cerrar, la página se vuelve a pedir sola y muestra el resumen del cierre. */
function Cerrar({ grupo, pendientes }: { grupo: { id: number; codigo: string }; pendientes: number }) {
  const router = useRouter();
  const { ejecutar, enviando, error, limpiar } = useAccion();
  const [confirmando, setConfirmando] = useState(false);

  return (
    <div className="tarjeta space-y-3 p-5">
      {error && <Aviso>{error}</Aviso>}
      {!confirmando ? (
        <button type="button" className="boton-secundario w-full" onClick={() => setConfirmando(true)}>
          Cerrar carga inicial
        </button>
      ) : (
        <>
          <p className="text-sm text-slate-700">
            {pendientes > 0 ? (
              <>
                Faltan <strong>{pendientes}</strong> posiciones. Si cerrás igual, quedan sin chequear y aparecen en la
                recorrida normal.{" "}
              </>
            ) : (
              "Están todas relevadas. "
            )}
            Al cerrar, el grupo vuelve a recibir palets y lo que falte se carga como un ingreso común.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="boton-secundario" onClick={() => setConfirmando(false)}>
              Seguir cargando
            </button>
            <button
              type="button"
              className="boton-primario"
              disabled={enviando}
              onClick={() => {
                limpiar();
                void ejecutar(() => cerrarCargaInicial(grupo.id), () => router.refresh());
              }}
            >
              {enviando ? "Cerrando…" : "Cerrar"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
