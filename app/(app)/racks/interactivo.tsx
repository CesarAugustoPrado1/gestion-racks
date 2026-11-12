"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { mover } from "@/lib/acciones/flujo";
import { useAccion } from "@/components/usar-accion";
import { Aviso } from "@/components/ui";
import { MapaDeGrupo, type Interaccion, type Vista } from "@/components/mapa";
import { PerspectivaDeGrupo } from "@/components/perspectiva";
import { confianza, etiquetaDeEstado } from "@/lib/confiabilidad";
import { ETIQUETA_PACKAGING, numero } from "@/lib/formato";
import { nombreDeNivel, nombreDeProfundidad } from "@/lib/posiciones";
import type { CeldaDelMapa, GrupoDelMapa } from "@/lib/consultas";

type Abierta = { grupoId: number; unidad: number; columna: number | null };

/**
 * Los racks para TOCAR, sin cambiar de pantalla.
 *
 * - Tocar una posición la marca y abre debajo del grupo la lista de su calle
 *   (penetrable) o su columna (selectivo). Tocarla de nuevo la desmarca.
 * - Quien mueve palets, si la posición tiene uno, lo deja ELEGIDO. Tocando
 *   después un lugar libre, ese es el destino, y abajo aparece "Mover … a …"
 *   para confirmar. Todo en la misma pantalla.
 * - Tocar el número de una calle o columna abre su lista sin elegir nada.
 */
export function RacksInteractivos({
  grupos,
  vista,
  dibujo,
  semivida,
  abrev,
  puedeMover,
  puedeChequear,
}: {
  grupos: GrupoDelMapa[];
  vista: Vista;
  dibujo: "3d" | "plano";
  semivida: number;
  abrev: Record<string, string>;
  puedeMover: boolean;
  puedeChequear: boolean;
}) {
  const router = useRouter();
  const { ejecutar, enviando, error, limpiar } = useAccion();
  const [marcada, setMarcada] = useState<number | null>(null);
  const [destino, setDestino] = useState<number | null>(null);
  const [abierta, setAbierta] = useState<Abierta | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);

  const celdaDe = (id: number | null) => {
    if (id == null) return null;
    for (const g of grupos) {
      const c = g.celdas.find((x) => x.posicionId === id);
      if (c) return { grupo: g, celda: c };
    }
    return null;
  };
  const elegida = celdaDe(marcada);
  const hacia = celdaDe(destino);
  /** El palet elegido para mover, si lo que está marcado es un palet y se puede mover. */
  const palet = puedeMover && elegida?.celda.bulto ? elegida : null;

  const libre = (g: GrupoDelMapa, c: CeldaDelMapa) =>
    c.activa && !c.bulto && !c.invasor && !c.fueraDeUso && !g.enCarga;

  function cancelar() {
    setMarcada(null);
    setDestino(null);
    setAviso(null);
    limpiar();
  }

  function tocar(g: GrupoDelMapa, c: CeldaDelMapa) {
    setHecho(null);
    setAviso(null);
    limpiar();
    setAbierta({ grupoId: g.id, unidad: c.unidad, columna: g.penetrable ? null : c.columna });
    // Otro toque sobre la elegida: se desmarca.
    if (marcada === c.posicionId) {
      setMarcada(null);
      setDestino(null);
      return;
    }
    // Con un palet elegido, un lugar libre es el destino.
    if (palet && !c.bulto) {
      if (libre(g, c)) setDestino(c.posicionId);
      else
        setAviso(
          `${g.codigo}-${c.codigo} no está libre${
            c.invasor ? `: la tapa ${c.invasor}, que sobresale desde abajo` : c.fueraDeUso ? `: ${c.fueraDeUso}` : g.enCarga ? ": el grupo está en carga inicial" : ""
          }.`,
        );
      return;
    }
    setMarcada(c.posicionId);
    setDestino(null);
  }

  function interaccionDe(g: GrupoDelMapa): Interaccion {
    return {
      marcada,
      destino,
      tocar: (c) => tocar(g, c),
      tocarUnidad: (unidad, columna) => {
        const misma = abierta?.grupoId === g.id && abierta.unidad === unidad && abierta.columna === columna;
        setAbierta(misma ? null : { grupoId: g.id, unidad, columna });
      },
    };
  }

  return (
    <>
      {hecho && (
        <div className="mb-3">
          <Aviso tono="exito">{hecho}</Aviso>
        </div>
      )}
      {puedeMover && !palet && (
        <p className="mb-2 px-1 text-xs text-slate-500">
          Para mover un palet: tocalo (queda elegido), y después tocá el lugar libre adonde va.
        </p>
      )}

      <div className="space-y-3">
        {grupos.map((g) => (
          <div key={g.id}>
            {dibujo === "3d" ? (
              <PerspectivaDeGrupo grupo={g} vista={vista} semivida={semivida} abrev={abrev} interaccion={interaccionDe(g)} />
            ) : (
              <MapaDeGrupo grupo={g} vista={vista} semivida={semivida} abrev={abrev} interaccion={interaccionDe(g)} />
            )}
            {abierta?.grupoId === g.id && (
              <ListaDeCalle
                grupo={g}
                abierta={abierta}
                semivida={semivida}
                marcada={marcada}
                destino={destino}
                puedeChequear={puedeChequear}
                tocar={(c) => tocar(g, c)}
                cerrar={() => setAbierta(null)}
              />
            )}
          </div>
        ))}
      </div>

      {/* Lugar para que la barra no tape lo último de la lista. */}
      {palet && <div className="h-40" aria-hidden />}

      {/* La barra de mover: fija abajo, encima de la navegación. */}
      {palet && (
        <div className="fixed inset-x-0 bottom-16 z-30 px-3 md:bottom-4 md:left-auto md:right-4 md:w-96">
          <div className="tarjeta space-y-2 p-3 shadow-xl ring-2 ring-slate-900">
            {error && <Aviso>{error}</Aviso>}
            {aviso && <Aviso tono="advertencia">{aviso}</Aviso>}
            {hacia ? (
              <p className="text-sm text-slate-800">
                Mover <strong className="codigo">{palet.celda.bulto!.codigo}</strong> de{" "}
                <strong className="codigo">
                  {palet.grupo.codigo}-{palet.celda.codigo}
                </strong>{" "}
                a{" "}
                <strong className="codigo text-medida">
                  {hacia.grupo.codigo}-{hacia.celda.codigo}
                </strong>
                ?
              </p>
            ) : (
              <p className="text-sm text-slate-800">
                <strong className="codigo">{palet.celda.bulto!.codigo}</strong> elegido ({palet.celda.bulto!.contenido}).{" "}
                <span className="text-slate-500">Tocá el lugar libre adonde va.</span>
              </p>
            )}
            <div className="flex gap-2">
              <button type="button" className="boton-secundario flex-1" disabled={enviando} onClick={cancelar}>
                Cancelar
              </button>
              {hacia ? (
                <button
                  type="button"
                  className="boton-primario flex-1"
                  disabled={enviando}
                  onClick={() => {
                    limpiar();
                    const codigo = palet.celda.bulto!.codigo;
                    const a = `${hacia.grupo.codigo}-${hacia.celda.codigo}`;
                    void ejecutar(
                      () => mover({ bultoId: palet.celda.bulto!.id, posicionId: hacia.celda.posicionId }),
                      (r) => {
                        setHecho(
                          `${codigo} quedó en ${a}.` +
                            (r.movidos.length > 0
                              ? ` Para llegar se bajaron ${r.movidos.join(", ")}: quedaron como movidos y control los va a ver primero.`
                              : ""),
                        );
                        setMarcada(null);
                        setDestino(null);
                        router.refresh();
                      },
                    );
                  }}
                >
                  {enviando ? "Moviendo…" : "Mover"}
                </button>
              ) : (
                <Link href={`/mover/bulto/${palet.celda.bulto!.id}`} className="boton-secundario flex flex-1 items-center justify-center">
                  Egreso u otro
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Lo que hay en una calle o una columna, de arriba hacia abajo y del pasillo al fondo. */
function ListaDeCalle({
  grupo,
  abierta,
  semivida,
  marcada,
  destino,
  puedeChequear,
  tocar,
  cerrar,
}: {
  grupo: GrupoDelMapa;
  abierta: Abierta;
  semivida: number;
  marcada: number | null;
  destino: number | null;
  puedeChequear: boolean;
  tocar: (c: CeldaDelMapa) => void;
  cerrar: () => void;
}) {
  const celdas = grupo.celdas
    .filter((c) => c.unidad === abierta.unidad && (abierta.columna == null || c.columna === abierta.columna))
    .sort((a, b) => b.nivel - a.nivel || (a.profundidad ?? 0) - (b.profundidad ?? 0));
  const numero2 = (n: number) => String(n).padStart(2, "0");
  const titulo = grupo.penetrable
    ? `Calle ${numero2(abierta.unidad)}`
    : `Columna ${numero2(abierta.columna ?? abierta.unidad)}`;
  const ocupadas = celdas.filter((c) => c.bulto).length;

  return (
    <section className="tarjeta mt-1 overflow-hidden border-t-4 border-slate-900">
      <header className="flex items-baseline justify-between gap-2 px-4 pt-3">
        <h3 className="text-sm font-bold text-slate-900">
          Grupo {grupo.codigo} · {titulo}
          <span className="ml-2 font-normal text-slate-500">
            {ocupadas} de {celdas.length} ocupadas
          </span>
        </h3>
        <button type="button" className="text-sm font-medium text-slate-500" onClick={cerrar}>
          Cerrar
        </button>
      </header>
      <ul className="mt-2 divide-y divide-slate-100">
        {celdas.map((c) => {
          const b = c.bulto;
          const donde = [
            nombreDeNivel(c.nivel, grupo.niveles),
            c.profundidad != null ? nombreDeProfundidad(c.profundidad, grupo.profundidad ?? 1) : null,
          ]
            .filter(Boolean)
            .join(", ");
          const esMarcada = marcada === c.posicionId;
          const esDestino = destino === c.posicionId;
          return (
            <li
              key={c.posicionId}
              className={`flex items-center gap-3 px-4 py-2.5 ${esMarcada ? "bg-slate-100" : esDestino ? "bg-medida/10" : ""}`}
            >
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => tocar(c)}>
                <span className="codigo text-sm text-slate-900">
                  {grupo.codigo}-{c.codigo}
                </span>{" "}
                <span className="text-xs text-slate-500">{donde}</span>
                {esMarcada && <span className="ml-2 chip bg-slate-900 text-white">elegido</span>}
                {esDestino && <span className="ml-2 chip bg-medida text-white">destino</span>}
                <span className="block truncate text-sm text-slate-700">
                  {b
                    ? b.contenido
                    : !c.activa
                      ? "Suspendida"
                      : c.invasor
                        ? `Tapada por ${c.invasor}, que sobresale desde abajo`
                        : c.fueraDeUso
                          ? `Libre · ${c.fueraDeUso}`
                          : "Libre"}
                </span>
                {b && (
                  <span className="block text-xs text-slate-400">
                    {ETIQUETA_PACKAGING[b.packaging]}
                    {!b.esObjeto && b.calidad === "segunda" && <strong className="text-orange-700"> · de segunda</strong>}
                    {" · "}
                    <span className="codigo">{b.codigo}</span> · {etiquetaDeEstado(b, confianza(b, semivida))}
                  </span>
                )}
              </button>
              {b && !b.esObjeto && (
                <span className="shrink-0 text-right">
                  <span className="cifra block text-base text-slate-900">{numero(b.cantidad)}</span>
                  <span className="block text-[11px] text-slate-500">{b.unidadPlural}</span>
                </span>
              )}
              <span className="flex shrink-0 flex-col items-end gap-1 text-xs">
                <Link href={`/racks/${c.posicionId}`} className="font-medium text-slate-500 underline">
                  historial
                </Link>
                {puedeChequear && (
                  <Link href={`/control/${c.posicionId}`} className="font-medium text-slate-500 underline">
                    chequear
                  </Link>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
