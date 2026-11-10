import Link from "next/link";
import { requerirRol } from "@/lib/auth";
import { stockPorLinea } from "@/lib/consultas";
import { PACKAGINGS, m2, numero, resumenPackaging } from "@/lib/formato";
import { Titulo } from "@/components/ui";

export const metadata = { title: "Stock · Racks" };
export const dynamic = "force-dynamic";

export default async function PantallaStock({ searchParams }: { searchParams: Promise<{ segunda?: string }> }) {
  await requerirRol("comercial", "admin", "auditor", "control");
  // Por defecto suma la segunda: es stock igual. El tilde la saca de las cuentas.
  const conSegunda = (await searchParams).segunda !== "no";
  const lineas = await stockPorLinea(conSegunda);

  if (lineas.length === 0) {
    return (
      <>
        <Titulo>Stock</Titulo>
        <div className="tarjeta p-6 text-sm text-slate-600">
          Todavía no hay líneas ni modelos cargados. Se cargan desde
          Administración.
        </div>
      </>
    );
  }

  return (
    <>
      <Titulo detalle="Cuánto hay de cada modelo. Tocá un modelo para abrirlo por packaging.">
        Stock
      </Titulo>

      {/* Un link y no un formulario: el tilde queda en la dirección, y la pantalla se puede compartir así. */}
      <Link
        href={conSegunda ? "/stock?segunda=no" : "/stock"}
        role="checkbox"
        aria-checked={conSegunda}
        replace
        scroll={false}
        className="tarjeta mb-5 flex items-center gap-3 p-4"
      >
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 text-sm font-bold ${
            conSegunda ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-transparent"
          }`}
          aria-hidden
        >
          ✓
        </span>
        <span className="text-sm">
          <span className="font-semibold text-slate-800">Incluye producto de segunda</span>
          <span className="block text-xs text-slate-500">
            {conSegunda
              ? "Los totales suman primera y segunda. Tocá para ver solo primera."
              : "Los totales son solo de primera. Tocá para sumar la segunda."}
          </span>
        </span>
      </Link>

      <div className="space-y-5">
        {lineas.map((linea) => (
          <section key={linea.id}>
            <h2 className="mb-2 text-sm font-semibold text-slate-500">
              {linea.nombre}
              <span className="ml-2 font-normal">
                · se cuenta en {linea.unidadPlural}
              </span>
            </h2>

            <ul className="space-y-2">
              {linea.modelos.map((m) => (
                <li key={m.id}>
                  <Link
                    href={`/stock/${m.id}`}
                    className="tarjeta flex items-center gap-4 p-4 transition active:scale-[0.99] hover:ring-slate-300"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-bold text-slate-900">
                        {m.nombre}
                      </p>
                      <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-500">
                        {/* Cada packaging con SU unidad: el suelto en
                            paquetes o placas, el palet y el optimizado en
                            palets. Un "3" y un "20" acá no son la misma clase
                            de número, y la línea lo tiene que decir. */}
                        {PACKAGINGS.map((p) => {
                          const t = m.porPackaging[p];
                          if (!t) return null;
                          return (
                            <span key={p}>
                              {resumenPackaging(
                                p,
                                t,
                                m.unidadSingular,
                                m.unidadPlural,
                              )}
                            </span>
                          );
                        })}
                        {m.bultos === 0 && <span>{m.segunda > 0 ? "Sin stock de primera" : "Sin stock"}</span>}
                        {m.segunda > 0 && (
                          <span className="font-semibold text-orange-700">
                            {numero(m.segunda)} de segunda{conSegunda ? "" : " (no sumadas)"}
                          </span>
                        )}
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="cifra text-xl leading-tight text-slate-900">
                        {numero(m.unidades)}{" "}
                        <span className="text-[11px] font-normal text-slate-500">{linea.unidadPlural}</span>
                      </p>
                      <p className="cifra text-base leading-tight text-slate-700">
                        {m.m2 != null ? (
                          m2(m.m2)
                        ) : (
                          <span className="text-[11px] font-normal text-slate-400">m² sin cargar</span>
                        )}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}

              {linea.modelos.length === 0 && (
                <li className="tarjeta p-4 text-sm text-slate-500">
                  Esta línea todavía no tiene modelos cargados.
                </li>
              )}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
