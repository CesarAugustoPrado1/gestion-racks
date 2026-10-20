import Link from "next/link";
import { confianza, hace, nivel as nivelDeConfianza } from "@/lib/confiabilidad";
import { nombreDeNivel, nombreDeProfundidad } from "@/lib/posiciones";
import { ETIQUETA_PACKAGING, numero } from "@/lib/formato";
import type { CeldaDelMapa, GrupoDelMapa } from "@/lib/consultas";

export type Vista = "contenido" | "confiabilidad";

/**
 * El color de una celda y lo que dice adentro.
 *
 * Nunca color solo: cada celda ocupada lleva SIEMPRE un texto -la abreviatura de
 * la línea, o los días desde el chequeo-. El color ordena de un vistazo; el
 * texto es el que dice qué es. Es lo que hace que el tablero se lea igual para
 * alguien que no distingue el verde del rojo, y en una pantalla al sol.
 */
export function pintarCelda(
  celda: CeldaDelMapa,
  vista: Vista,
  semivida: number,
  abrev: Record<string, string>,
): { fondo: string; texto: string; letra: string; titulo: string } {
  const pintada = pintarBase(celda, vista, semivida, abrev);
  /**
   * Lo que no se usa y lo que es de otra empresa se suman al título de
   * cualquier celda ocupada: es el texto que se lee al apoyar el dedo, y el que
   * lee un lector de pantalla.
   */
  const extras = [
    celda.bulto && celda.fueraDeUso ? celda.fueraDeUso : null,
    celda.bulto?.ajeno ? `es de ${celda.bulto.empresas}, en un rack de otra empresa` : null,
  ].filter(Boolean);
  return extras.length > 0 && celda.bulto
    ? { ...pintada, titulo: `${pintada.titulo} · ${extras.join(" · ")}` }
    : pintada;
}

function pintarBase(
  celda: CeldaDelMapa,
  vista: Vista,
  semivida: number,
  abrev: Record<string, string>,
): { fondo: string; texto: string; letra: string; titulo: string } {
  const p = `${celda.codigo}`;

  if (!celda.activa) {
    return {
      fondo: "bg-slate-100 ring-1 ring-slate-200",
      texto: "text-slate-300",
      letra: "—",
      titulo: `${p} · suspendida`,
    };
  }

  /**
   * Tapada por un bulto alto de abajo: no hay nada parado acá, pero tampoco
   * entra nada. Se dibuja distinto del vacío Y distinto del lleno, porque no es
   * ninguno de los dos, y la flecha hacia abajo dice de dónde viene.
   */
  if (!celda.bulto && celda.invasor) {
    return {
      fondo: "bg-slate-200 ring-1 ring-slate-300",
      texto: "text-slate-500",
      letra: "↓",
      titulo: `${p} · la ocupa ${celda.invasor}, que sobresale desde abajo`,
    };
  }

  /**
   * Vacía y fuera de uso: el clark no llega o está en la lista de exclusión.
   * Rayada, para que no se confunda ni con libre ni con suspendida: existe, no
   * tiene nada, y no se puede usar.
   */
  if (!celda.bulto && celda.fueraDeUso) {
    return {
      fondo: "fuera-de-uso ring-1 ring-slate-300",
      texto: "text-slate-400",
      letra: celda.exclusion ? "✕" : "↑",
      titulo: `${p} · ${celda.fueraDeUso}`,
    };
  }

  if (!celda.bulto) {
    // El vacío no es un estado malo: es lugar disponible. Va en el fondo de la
    // página, sin color, para que lo lleno salte solo.
    return {
      fondo: "bg-white ring-1 ring-slate-200",
      texto: "text-slate-300",
      letra: "",
      titulo: `${p} · libre`,
    };
  }

  const b = celda.bulto;
  const base = `${p} · ${b.contenido} · ${ETIQUETA_PACKAGING[b.packaging]} · ${b.codigo}`;

  if (vista === "confiabilidad") {
    const c = confianza(b, semivida);
    const n = nivelDeConfianza(c);
    const fondos = {
      alta: "bg-confiable-suave ring-1 ring-confiable/40",
      media: "bg-dudoso-suave ring-1 ring-dudoso/50",
      baja: "bg-vencido-suave ring-1 ring-vencido/40",
      sin_datos: "bg-sin-datos-suave ring-1 ring-slate-200",
    }[n];
    const textos = {
      alta: "text-confiable",
      media: "text-yellow-800",
      baja: "text-vencido",
      sin_datos: "text-slate-400",
    }[n];
    return {
      fondo: fondos,
      texto: textos,
      // El dato, no un símbolo: los días desde el último chequeo.
      letra: c ? String(c.diasDesdeElChequeo) : "?",
      titulo: `${base} · ${c ? `chequeado ${hace(c.diasDesdeElChequeo)}` : "nunca chequeado"}`,
    };
  }

  const fondos = [
    "bg-linea-1/15 ring-1 ring-linea-1/40",
    "bg-linea-2/15 ring-1 ring-linea-2/40",
    "bg-linea-3/15 ring-1 ring-linea-3/40",
  ];
  const textos = ["text-linea-1", "text-linea-2", "text-linea-3"];
  const i = b.lineaOrden;
  return {
    fondo: i < 3 ? fondos[i] : "bg-slate-100 ring-1 ring-slate-300",
    texto: i < 3 ? textos[i] : "text-slate-500",
    letra: abrev[b.lineaNombre] ?? "··",
    titulo: `${base} · ${numero(b.cantidad)} ${b.unidadPlural}`,
  };
}

function Celda({
  celda,
  vista,
  semivida,
  abrev,
}: {
  celda: CeldaDelMapa;
  vista: Vista;
  semivida: number;
  abrev: Record<string, string>;
}) {
  const { fondo, texto, letra, titulo } = pintarCelda(celda, vista, semivida, abrev);
  return (
    <Link
      href={`/racks/${celda.posicionId}`}
      title={titulo}
      aria-label={titulo}
      className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded text-[11px] font-bold tabular-nums transition hover:ring-2 hover:ring-slate-900 ${fondo} ${texto}`}
    >
      {letra}
      {/* De otra empresa: un "!" en la esquina, y no un color de fondo, porque
          el fondo ya dice la línea o la confiabilidad y no puede decir dos
          cosas a la vez. */}
      {celda.bulto?.ajeno && (
        <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500 text-[9px] leading-none text-white">
          !
        </span>
      )}
      {/* Ocupada en un lugar fuera de uso: el contenido manda, la raya avisa. */}
      {celda.bulto && celda.fueraDeUso && (
        <span className="absolute inset-x-0 bottom-0 h-1 rounded-b fuera-de-uso" />
      )}
    </Link>
  );
}

/**
 * Un grupo dibujado como está parado en la planta: el nivel de arriba arriba y
 * el piso abajo. Mirar el tablero y mirar el rack tienen que dar la misma
 * imagen, o el tablero obliga a traducir.
 */
export function MapaDeGrupo({
  grupo,
  vista,
  semivida,
  abrev,
}: {
  grupo: GrupoDelMapa;
  vista: Vista;
  semivida: number;
  abrev: Record<string, string>;
}) {
  const niveles = [...new Set(grupo.celdas.map((c) => c.nivel))].sort(
    (a, b) => b - a,
  );
  const unidades = [...new Set(grupo.celdas.map((c) => c.unidad))].sort(
    (a, b) => a - b,
  );

  return (
    <section className="tarjeta overflow-hidden">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 pt-4">
        <h2 className="text-base font-bold text-slate-900">
          Grupo {grupo.codigo}
          {grupo.empresa && (
            <span className="ml-2 chip bg-slate-100 align-middle text-slate-600">
              {grupo.empresa}
            </span>
          )}
        </h2>
        <p className="text-xs text-slate-500">
          {grupo.nombre ? `${grupo.nombre} · ` : ""}
          {grupo.penetrable
            ? `${grupo.unidades} calles de ${grupo.niveles} × ${grupo.profundidad}`
            : `${grupo.unidades} módulos de ${grupo.ancho} × ${grupo.niveles}`}
        </p>
      </header>

      <div className="flex gap-2 overflow-x-auto p-4">
        {/* Las etiquetas de nivel quedan fijas: con veinte calles la grilla se
            va de la pantalla y sin esto no se sabe qué fila se está mirando. */}
        <div className="sticky left-0 z-10 shrink-0 bg-white pr-1">
          <div className="h-4" />
          {niveles.map((n) => (
            <div
              key={n}
              className="flex h-9 items-center text-[11px] whitespace-nowrap text-slate-500"
              style={{ marginBottom: 2 }}
            >
              {nombreDeNivel(n, grupo.niveles)}
              {grupo.celdas.some((c) => c.nivel === n && !c.alcanzable) && (
                <span className="ml-1 text-slate-400" title="El clark no llega a este nivel">
                  ↑✕
                </span>
              )}
            </div>
          ))}
        </div>

        <div>
          <div className="flex gap-2">
            {unidades.map((u) => (
              <div
                key={u}
                className="text-center text-[10px] text-slate-400 tabular-nums"
                style={{
                  width: grupo.penetrable
                    ? (grupo.profundidad ?? 1) * 36 + ((grupo.profundidad ?? 1) - 1) * 2
                    : (grupo.ancho ?? 1) * 36 + ((grupo.ancho ?? 1) - 1) * 2,
                }}
              >
                {u}
              </div>
            ))}
          </div>

          {niveles.map((n) => (
            <div key={n} className="flex gap-2" style={{ marginBottom: 2 }}>
              {unidades.map((u) => (
                <div key={u} className="flex gap-0.5">
                  {grupo.celdas
                    .filter((c) => c.nivel === n && c.unidad === u)
                    .sort(
                      (a, b) =>
                        (a.profundidad ?? a.columna ?? 0) -
                        (b.profundidad ?? b.columna ?? 0),
                    )
                    .map((c) => (
                      <Celda
                        key={c.posicionId}
                        celda={c}
                        vista={vista}
                        semivida={semivida}
                        abrev={abrev}
                      />
                    ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {grupo.penetrable && (
        <p className="px-4 pb-4 text-[11px] text-slate-400">
          En cada calle, el de la izquierda es el del{" "}
          {nombreDeProfundidad(1, grupo.profundidad ?? 2)} y el de la derecha el
          de la {nombreDeProfundidad(grupo.profundidad ?? 2, grupo.profundidad ?? 2)}.
        </p>
      )}
    </section>
  );
}
