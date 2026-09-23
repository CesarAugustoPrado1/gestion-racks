import Link from "next/link";
import { requerirRol } from "@/lib/auth";
import {
  historial,
  opcionesDeHistorial,
  type FiltrosHistorial,
} from "@/lib/consultas";
import { ETIQUETA_PACKAGING, numero } from "@/lib/formato";
import { Titulo } from "@/components/ui";
import { Filtros } from "./filtros";

export const metadata = { title: "Movimientos · Racks" };
export const dynamic = "force-dynamic";

const ETIQUETA_TIPO: Record<string, string> = {
  meter: "Metió",
  sacar: "Sacó",
  mover: "Movió",
  ajuste: "Ajustó",
};

/** Un tono por tipo, para poder barrer la lista con el ojo. */
const COLOR_TIPO: Record<string, string> = {
  meter: "bg-confiable-suave text-confiable",
  sacar: "bg-vencido-suave text-vencido",
  mover: "bg-slate-100 text-slate-600",
  ajuste: "bg-dudoso-suave text-yellow-800",
};

type Busqueda = {
  desde?: string;
  hasta?: string;
  tipo?: string;
  modelo?: string;
  usuario?: string;
  q?: string;
  anulados?: string;
  pagina?: string;
};

export function leerFiltros(s: Busqueda): FiltrosHistorial {
  return {
    desde: s.desde || null,
    hasta: s.hasta || null,
    tipo: s.tipo || null,
    modeloId: s.modelo ? Number(s.modelo) : null,
    usuarioId: s.usuario ? Number(s.usuario) : null,
    texto: s.q || null,
    incluirAnulados: s.anulados === "si",
  };
}

export default async function PantallaMovimientos({
  searchParams,
}: {
  searchParams: Promise<Busqueda>;
}) {
  await requerirRol("admin", "auditor", "comercial", "control");
  const s = await searchParams;
  const filtros = leerFiltros(s);
  const pagina = Math.max(0, Number(s.pagina ?? 0) || 0);

  const [{ movimientos, total }, opciones] = await Promise.all([
    historial(filtros, pagina),
    opcionesDeHistorial(),
  ]);

  const query = new URLSearchParams(
    Object.entries(s).filter(([k, v]) => v && k !== "pagina") as [string, string][],
  ).toString();

  return (
    <>
      <Titulo detalle="Todo lo que pasó, con quién lo hizo y cuándo.">
        Movimientos
      </Titulo>

      <Filtros actual={s} opciones={opciones} />

      <div className="mt-3 mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">
          <strong className="cifra text-slate-900">{numero(total)}</strong>{" "}
          movimiento{total === 1 ? "" : "s"}
          {total > 50 && (
            <>
              {" "}
              · mostrando {pagina * 50 + 1} a{" "}
              {Math.min((pagina + 1) * 50, total)}
            </>
          )}
        </p>
        {total > 0 && (
          <a
            href={`/movimientos/exportar?${query}`}
            className="boton-secundario text-sm"
          >
            Descargar CSV
          </a>
        )}
      </div>

      {movimientos.length === 0 ? (
        <div className="tarjeta p-6 text-sm text-slate-600">
          No hay movimientos que coincidan con estos filtros.
        </div>
      ) : (
        <ul className="space-y-2">
          {movimientos.map((m) => {
            const delta = m.cantidad - m.cantidadAntes;
            return (
              <li
                key={m.id}
                className={`tarjeta p-4 ${m.anulado ? "opacity-60" : ""}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`chip ${COLOR_TIPO[m.tipo] ?? "bg-slate-100"}`}>
                    {ETIQUETA_TIPO[m.tipo] ?? m.tipo}
                  </span>
                  <span className="codigo text-sm text-slate-900">
                    {m.bultoCodigo}
                  </span>
                  <span className="chip bg-slate-100 text-slate-600">
                    {m.packagingAntes && m.packagingAntes !== m.packaging
                      ? `${ETIQUETA_PACKAGING[m.packagingAntes]} → ${ETIQUETA_PACKAGING[m.packaging]}`
                      : ETIQUETA_PACKAGING[m.packaging]}
                  </span>
                  {m.anulado && (
                    <span className="chip bg-red-100 text-red-800">anulado</span>
                  )}
                </div>

                <p className="mt-1.5 text-sm text-slate-700">
                  {m.lineas.map((l, i) => (
                    <span key={l.modelo}>
                      {i > 0 && " · "}
                      {l.modelo}{" "}
                      <span className="cifra text-slate-900">
                        {l.antes} → {l.despues}
                      </span>
                    </span>
                  ))}
                </p>

                <p className="mt-1 text-xs text-slate-500">
                  {m.desde && m.hasta && m.desde === m.hasta ? (
                    // Una salida parcial deja el bulto donde estaba, asi que
                    // guarda la misma posicion en desde y en hasta. Escribir
                    // "de A-02-1-1 a A-02-1-1" seria ruido: no se movio nada.
                    <>
                      en <span className="codigo">{m.desde}</span>
                    </>
                  ) : m.desde && m.hasta ? (
                    <>
                      de <span className="codigo">{m.desde}</span> a{" "}
                      <span className="codigo">{m.hasta}</span>
                    </>
                  ) : m.hasta ? (
                    <>
                      a <span className="codigo">{m.hasta}</span>
                    </>
                  ) : m.desde ? (
                    <>
                      de <span className="codigo">{m.desde}</span>
                    </>
                  ) : (
                    "sin ubicación"
                  )}
                  {" · "}
                  <span
                    className={
                      delta > 0
                        ? "font-semibold text-confiable"
                        : delta < 0
                          ? "font-semibold text-vencido"
                          : ""
                    }
                  >
                    {delta > 0 ? "+" : ""}
                    {numero(delta)}
                  </span>
                  {m.motivo && ` · ${m.motivo}`}
                </p>

                {m.nota && (
                  <p className="mt-1 text-xs text-slate-500 italic">{m.nota}</p>
                )}
                {m.anulado && m.motivoAnulacion && (
                  <p className="mt-1 text-xs text-red-700">
                    Anulado: {m.motivoAnulacion}
                  </p>
                )}

                <p className="mt-1 text-xs text-slate-400">
                  {m.usuario} ·{" "}
                  {m.creadoEn.toLocaleString("es-AR", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      {total > 50 && (
        <nav className="mt-4 flex items-center justify-between gap-2">
          {pagina > 0 ? (
            <Link
              href={`/movimientos?${query}&pagina=${pagina - 1}`}
              className="boton-secundario"
            >
              ← Anteriores
            </Link>
          ) : (
            <span />
          )}
          {(pagina + 1) * 50 < total && (
            <Link
              href={`/movimientos?${query}&pagina=${pagina + 1}`}
              className="boton-secundario"
            >
              Siguientes →
            </Link>
          )}
        </nav>
      )}
    </>
  );
}
