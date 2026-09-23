import Link from "next/link";
import { notFound } from "next/navigation";
import { requerirSesion } from "@/lib/auth";
import { fichaDePosicion } from "@/lib/consultas";
import { semividaDias } from "@/lib/configuracion";
import { confianza } from "@/lib/confiabilidad";
import { ChipConfianza } from "@/components/confiabilidad";
import { nombreDeNivel, nombreDeProfundidad } from "@/lib/posiciones";
import { ETIQUETA_PACKAGING, numero } from "@/lib/formato";
import { Titulo } from "@/components/ui";
import { puedeVer } from "@/lib/permisos";

export const dynamic = "force-dynamic";

const ETIQUETA_TIPO: Record<string, string> = {
  meter: "Metió",
  sacar: "Sacó",
  mover: "Movió",
  ajuste: "Ajustó",
};

export default async function FichaDePosicion({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const sesion = await requerirSesion();
  const { id } = await params;
  const ficha = await fichaDePosicion(Number(id));
  if (!ficha) notFound();

  const { grupo, celda, movimientos } = ficha;
  const semivida = await semividaDias();
  const donde = [
    nombreDeNivel(celda.nivel, grupo.niveles),
    celda.profundidad != null
      ? nombreDeProfundidad(celda.profundidad, grupo.profundidad ?? 1)
      : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <>
      <Link href="/racks" className="mb-2 inline-block text-sm font-medium text-slate-500">
        ← Racks
      </Link>

      <Titulo
        detalle={`${grupo.penetrable ? "Calle" : "Módulo"} ${celda.unidad} · ${donde}`}
      >
        {grupo.codigo}-{celda.codigo}
      </Titulo>

      <div className="tarjeta mb-4 p-5">
        {!celda.activa ? (
          <p className="text-base font-semibold text-slate-500">
            Posición suspendida.
          </p>
        ) : celda.bulto ? (
          <>
            <p className="text-lg font-bold text-slate-900">
              {celda.bulto.contenido}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              {ETIQUETA_PACKAGING[celda.bulto.packaging]} ·{" "}
              {numero(celda.bulto.cantidad)} {celda.bulto.unidadPlural} ·{" "}
              <span className="codigo">{celda.bulto.codigo}</span>
            </p>
            <div className="mt-3">
              <ChipConfianza
                confianza={confianza(celda.bulto, semivida)}
                fila={celda.bulto}
              />
            </div>
          </>
        ) : (
          <p className="text-base font-semibold text-slate-500">
            Libre. El sistema dice que acá no hay nada.
          </p>
        )}
      </div>

      {/* Cada rol llega a su herramienta desde acá: el tablero es la puerta. */}
      <div className="mb-4 flex flex-wrap gap-2">
        {puedeVer(sesion.rol, "/control") && (
          <Link href={`/control/${celda.posicionId}`} className="boton-secundario">
            Chequear
          </Link>
        )}
        {celda.bulto && puedeVer(sesion.rol, "/mover") && (
          <Link
            href={`/mover/bulto/${celda.bulto.id}`}
            className="boton-secundario"
          >
            Mover o sacar
          </Link>
        )}
      </div>

      <h2 className="mb-2 text-sm font-semibold text-slate-500">
        Lo último que pasó acá
      </h2>
      {movimientos.length === 0 ? (
        <p className="tarjeta p-4 text-sm text-slate-500">
          Ningún movimiento registrado en esta posición.
        </p>
      ) : (
        <ul className="tarjeta divide-y divide-slate-100">
          {movimientos.map((m) => (
            <li key={m.id} className="px-4 py-2.5 text-sm">
              <span className="font-semibold text-slate-700">
                {ETIQUETA_TIPO[m.tipo] ?? m.tipo}
              </span>{" "}
              <span className="codigo text-slate-900">{m.bultoCodigo}</span>
              {m.tipo === "sacar" && (
                <> · {numero(m.cantidadAntes - m.cantidad)} salieron</>
              )}
              {m.motivo && ` · ${m.motivo}`}
              <span className="block text-xs text-slate-400">
                {m.usuario} ·{" "}
                {m.creadoEn.toLocaleString("es-AR", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
