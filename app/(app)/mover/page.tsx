import Link from "next/link";
import { requerirRol } from "@/lib/auth";
import {
  actividadDeHoy,
  buscarBultos,
  bultosSinUbicar,
  type BultoEnLista,
} from "@/lib/consultas";
import { ETIQUETA_PACKAGING, numero } from "@/lib/formato";
import { Titulo } from "@/components/ui";
import { Buscador } from "./buscador";

export const metadata = { title: "Mover · Racks" };
export const dynamic = "force-dynamic";

const ETIQUETA_TIPO: Record<string, string> = {
  meter: "Metió",
  sacar: "Sacó",
  mover: "Movió",
  ajuste: "Ajustó",
};

export default async function PantallaMover({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sesion = await requerirRol("autoelevador", "admin");
  const { q } = await searchParams;

  const [resultados, sinUbicar, actividad] = await Promise.all([
    q ? buscarBultos(q) : Promise.resolve([]),
    bultosSinUbicar(),
    actividadDeHoy(),
  ]);

  return (
    <>
      <Titulo detalle={`${sesion.nombre} · cada movimiento real, registrado acá`}>
        Mover
      </Titulo>

      <Link href="/mover/meter" className="boton-primario mb-4 w-full">
        + Meter al rack
      </Link>

      <Buscador inicial={q ?? ""} />

      {q && (
        <section className="mt-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-500">
            {resultados.length === 0
              ? `No hay ningún bulto que coincida con "${q}"`
              : `${resultados.length} resultado${resultados.length === 1 ? "" : "s"}`}
          </h2>
          <ul className="space-y-2">
            {resultados.map((b) => (
              <FilaBulto key={b.id} bulto={b} />
            ))}
          </ul>
        </section>
      )}

      {!q && sinUbicar.length > 0 && (
        <section className="mt-5">
          {/* La cola de trabajo va arriba y no en un reporte: una cola que no se
              ve no se vacía. */}
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-900">
            Sin ubicar
            <span className="chip bg-amber-100 text-amber-900">
              {sinUbicar.length}
            </span>
          </h2>
          <p className="mb-2 text-xs text-slate-500">
            Están en el sistema y se cuentan como stock, pero nadie sabe dónde
            están parados. No se pueden chequear hasta que tengan lugar.
          </p>
          <ul className="space-y-2">
            {sinUbicar.map((b) => (
              <FilaBulto key={b.id} bulto={b} />
            ))}
          </ul>
        </section>
      )}

      {!q && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-slate-500">Hoy</h2>
          {actividad.length === 0 ? (
            <p className="tarjeta p-4 text-sm text-slate-500">
              Todavía no se registró ningún movimiento hoy.
            </p>
          ) : (
            <ul className="tarjeta divide-y divide-slate-100">
              {actividad.map((m) => (
                <li key={m.id} className="flex items-baseline gap-2 px-4 py-2.5 text-sm">
                  <span className="w-12 shrink-0 text-xs text-slate-400">
                    {m.creadoEn.toLocaleTimeString("es-AR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span className="min-w-0 flex-1">
                    <strong className="font-semibold text-slate-700">
                      {ETIQUETA_TIPO[m.tipo] ?? m.tipo}
                    </strong>{" "}
                    <span className="codigo text-slate-900">{m.bultoCodigo}</span>
                    {m.desde && m.hasta && (
                      <>
                        {" "}
                        de <span className="codigo">{m.desde}</span> a{" "}
                        <span className="codigo">{m.hasta}</span>
                      </>
                    )}
                    {!m.desde && m.hasta && (
                      <>
                        {" "}
                        a <span className="codigo">{m.hasta}</span>
                      </>
                    )}
                    {m.tipo === "sacar" && (
                      <>
                        {" "}
                        · {numero(m.cantidadAntes - m.cantidad)} salieron
                        {m.motivo && ` · ${m.motivo}`}
                      </>
                    )}
                    <span className="block text-xs text-slate-400">
                      {m.usuario}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}

function FilaBulto({ bulto }: { bulto: BultoEnLista }) {
  return (
    <li>
      <Link
        href={`/mover/bulto/${bulto.id}`}
        className="tarjeta flex items-center gap-3 p-4 transition active:scale-[0.99] hover:ring-slate-300"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {bulto.ubicacion ? (
              <span className="codigo text-base text-slate-900">
                {bulto.ubicacion}
              </span>
            ) : (
              <span className="chip bg-amber-100 text-amber-900">Sin ubicar</span>
            )}
            <span className="chip bg-slate-100 text-slate-600">
              {ETIQUETA_PACKAGING[bulto.packaging]}
            </span>
          </div>
          <p className="mt-1 truncate text-sm text-slate-700">{bulto.contenido}</p>
          <p className="codigo text-xs text-slate-400">{bulto.codigo}</p>
        </div>
        <div className="text-right">
          <p className="cifra text-lg text-slate-900">{numero(bulto.cantidad)}</p>
          <p className="text-[11px] text-slate-500">{bulto.unidadPlural}</p>
        </div>
      </Link>
    </li>
  );
}
