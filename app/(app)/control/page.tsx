import Link from "next/link";
import { requerirRol } from "@/lib/auth";
import { posicionesParaChequear } from "@/lib/consultas";
import { semividaDias } from "@/lib/configuracion";
import { confianza, hace, indice, nivel } from "@/lib/confiabilidad";
import { Indice } from "@/components/confiabilidad";
import { numero } from "@/lib/formato";
import { describirPosicion } from "@/lib/posiciones";
import { Titulo } from "@/components/ui";

export const metadata = { title: "Control · Racks" };
export const dynamic = "force-dynamic";

export default async function PantallaControl() {
  const sesion = await requerirRol("control", "admin");
  const [posiciones, semivida] = await Promise.all([
    posicionesParaChequear(),
    semividaDias(),
  ]);

  const conDatos = posiciones.map((p) => {
    const c = confianza(p, semivida);
    return {
      ...p,
      confianza: c,
      /**
       * La urgencia: lo que hace más que no se mira Y más producto tiene.
       *
       * Es lo que convierte el índice en el plan del día. Una posición vacía
       * cuenta como 1 para que no desaparezca del final de la lista:
       * confirmar un vacío también es información.
       */
      urgencia: (1 - (c?.valor ?? 0)) * Math.max(p.unidades, 1),
    };
  });

  conDatos.sort((a, b) => b.urgencia - a.urgencia);
  const resumen = indice(conDatos.map((p) => p.confianza));

  return (
    <>
      <Titulo detalle={`${sesion.nombre} · primero lo que hace más que no se mira`}>
        Recorrida
      </Titulo>

      <div className="tarjeta mb-4 p-5">
        <Indice {...resumen} />
        <p className="mt-2 text-xs text-slate-500">
          Un chequeo vale la mitad a los {semivida} días. Tocá una posición para
          chequearla.
        </p>
      </div>

      <ul className="space-y-2">
        {conDatos.map((p) => (
          <li key={p.id}>
            <Link
              href={`/control/${p.id}`}
              className="tarjeta flex items-center gap-3 p-4 transition active:scale-[0.99] hover:ring-slate-300"
            >
              <span
                className={`h-10 w-1.5 shrink-0 rounded-full ${
                  {
                    alta: "bg-confiable",
                    media: "bg-dudoso",
                    baja: "bg-vencido",
                    sin_datos: "bg-sin-datos",
                  }[nivel(p.confianza)]
                }`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="codigo text-base text-slate-900">
                    {p.codigo}
                  </span>
                  <span className="text-xs text-slate-500">
                    {describirPosicion(p).split(" · ")[1]}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-sm text-slate-600">
                  {p.contenido ?? "El sistema dice que está vacía"}
                </p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {p.confianza
                    ? `Chequeada ${hace(p.confianza.diasDesdeElChequeo)}`
                    : "Nunca chequeada"}
                </p>
              </div>
              {p.unidades > 0 && (
                <div className="text-right">
                  <p className="cifra text-lg text-slate-900">
                    {numero(p.unidades)}
                  </p>
                  <p className="text-[11px] text-slate-500">{p.unidadPlural}</p>
                </div>
              )}
            </Link>
          </li>
        ))}
      </ul>

      {conDatos.length === 0 && (
        <div className="tarjeta p-6 text-sm text-slate-600">
          No hay posiciones cargadas todavía.
        </div>
      )}
    </>
  );
}
