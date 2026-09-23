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
  const p = `${celda.codigo}`;

  if (!celda.activa) {
    return {
      fondo: "bg-slate-100 ring-1 ring-slate-200",
      texto: "text-slate-300",
      letra: "—",
      titulo: `${p} · suspendida`,
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
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded text-[11px] font-bold tabular-nums transition hover:ring-2 hover:ring-slate-900 ${fondo} ${texto}`}
    >
      {letra}
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
