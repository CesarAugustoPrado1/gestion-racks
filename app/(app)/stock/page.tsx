import Link from "next/link";
import { requerirRol } from "@/lib/auth";
import { stockPorLinea } from "@/lib/consultas";
import { PACKAGINGS, m2, numero, resumenPackaging } from "@/lib/formato";
import { Titulo } from "@/components/ui";
import { distingueSegunda, sumaSegunda } from "@/lib/segunda";
import { vistaSegunda } from "@/lib/segunda-servidor";

export const metadata = { title: "Stock · Racks" };
export const dynamic = "force-dynamic";

export default async function PantallaStock() {
  await requerirRol("comercial", "admin", "auditor", "control");
  // Si la segunda suma y si se dice aparte lo deciden los tildes del encabezado.
  const vista = await vistaSegunda();
  const lineas = await stockPorLinea(sumaSegunda(vista));

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
                        {m.bultos === 0 && <span>Sin stock</span>}
                        {distingueSegunda(vista) && m.segunda > 0 && (
                          <span className="font-semibold text-orange-700">de eso, {numero(m.segunda)} de segunda</span>
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
