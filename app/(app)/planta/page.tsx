import Link from "next/link";
import { requerirSesion } from "@/lib/auth";
import { gruposParaPlano, planoVigente } from "@/lib/plano-db";
import { DibujoElemento, Escala, escalaDe, ordenarParaDibujar } from "@/components/plano-dibujo";
import { puedeVer } from "@/lib/permisos";
import { Titulo } from "@/components/ui";

export const metadata = { title: "Plano · Racks" };
export const dynamic = "force-dynamic";

/**
 * El plano de la planta, para mirar. Cada rack es un link a su grupo en el
 * mapa, y su color dice cuánto está ocupado: más intenso, más lleno.
 */
export default async function PantallaPlano() {
  const sesion = await requerirSesion();
  const [vigente, grupos] = await Promise.all([planoVigente(), gruposParaPlano()]);
  const { plano } = vigente;
  const info = new Map(grupos.map((g) => [g.id, g.info]));
  const esAdmin = puedeVer(sesion.rol, "/admin");
  const s = escalaDe(plano);
  const margen = s * 6;

  return (
    <>
      <Titulo detalle="La fábrica vista desde arriba. Tocá un rack para ir a su grupo.">Plano</Titulo>

      {esAdmin && (
        <Link href="/admin/planta" className="boton-secundario mb-3">
          {vigente.version ? "Editar el plano" : "Dibujar el plano"}
        </Link>
      )}

      {plano.elementos.length === 0 ? (
        <div className="tarjeta p-6 text-sm text-slate-600">
          Todavía no hay plano dibujado.
          {esAdmin ? " Se dibuja con el botón de arriba." : " Lo dibuja un administrador."}
        </div>
      ) : (
        <>
          <div className="tarjeta overflow-auto">
            <svg
              viewBox={`${-margen} ${-margen} ${plano.ancho + margen * 2} ${plano.largo + margen * 2}`}
              className="block w-full min-w-[640px]"
              role="img"
              aria-label="Plano de la planta"
            >
              <rect x={0} y={0} width={plano.ancho} height={plano.largo} fill="#fff" />
              {ordenarParaDibujar(plano.elementos).map((e) =>
                e.tipo === "rack" && e.grupoId != null && info.has(e.grupoId) ? (
                  <a key={e.id} href={`/racks#grupo-${info.get(e.grupoId)!.codigo}`}>
                    <DibujoElemento e={e} plano={plano} grupos={info} />
                  </a>
                ) : (
                  <DibujoElemento key={e.id} e={e} plano={plano} grupos={info} />
                ),
              )}
              <Escala plano={plano} />
            </svg>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-slate-600">
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-5 rounded-sm bg-medida/20 ring-1 ring-medida" /> rack poco ocupado
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-5 rounded-sm bg-medida/70 ring-1 ring-medida" /> rack lleno
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-5 rounded-sm bg-slate-300" /> calle de tránsito
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1 w-5 rounded-sm bg-emerald-600" /> acceso
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-5 rounded-sm border border-dashed border-slate-400 bg-slate-100" /> techado
            </span>
          </div>
        </>
      )}
    </>
  );
}
