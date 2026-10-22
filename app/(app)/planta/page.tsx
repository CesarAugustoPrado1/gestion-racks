import Link from "next/link";
import { requerirSesion } from "@/lib/auth";
import { gruposParaPlano, planoVigente } from "@/lib/plano-db";
import { DibujoElemento, Escala, margenDe, ordenarParaDibujar } from "@/components/plano-dibujo";
import { puedeVer } from "@/lib/permisos";
import { ETIQUETA_TIPO, TIPOS, estiloDelTipo } from "@/lib/plano";
import { Muestra } from "@/components/plano-estilos";
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
  const margen = margenDe(plano);

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

          {/* La leyenda sale de los estilos del plano: si se cambia cómo se ve
              un tipo, la leyenda cambia con él. Solo los tipos que hay. */}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-slate-600">
            {TIPOS.filter((t) => plano.elementos.some((e) => e.tipo === t)).map((t) => (
              <span key={t} className="flex items-center gap-1.5">
                <Muestra tipo={t} estilo={estiloDelTipo(t, plano)} />
                {ETIQUETA_TIPO[t]}
                {t === "rack" && estiloDelTipo(t, plano).relleno === "ocupacion" && " (más intenso, más lleno)"}
              </span>
            ))}
          </div>
        </>
      )}
    </>
  );
}
