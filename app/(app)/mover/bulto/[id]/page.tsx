import Link from "next/link";
import { notFound } from "next/navigation";
import { requerirRol } from "@/lib/auth";
import {
  bultoPorId,
  contenidoDeBulto,
  motivosDeSalida,
  posicionesLibres,
} from "@/lib/consultas";
import { semividaDias } from "@/lib/configuracion";
import { confianza } from "@/lib/confiabilidad";
import { ChipConfianza } from "@/components/confiabilidad";
import { ETIQUETA_PACKAGING, numero } from "@/lib/formato";
import { Aviso, Titulo } from "@/components/ui";
import { avisoAjeno } from "@/lib/uso";
import { AccionesBulto } from "./acciones";

export const dynamic = "force-dynamic";

export default async function PantallaBulto({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requerirRol("autoelevador", "admin");
  const { id } = await params;
  const bulto = await bultoPorId(Number(id));
  if (!bulto) notFound();

  const [contenido, motivos, posiciones, semivida] = await Promise.all([
    contenidoDeBulto(bulto.id),
    motivosDeSalida(),
    posicionesLibres(),
    semividaDias(),
  ]);

  return (
    <>
      <Link href="/mover" className="mb-2 inline-block text-sm font-medium text-slate-500">
        ← Mover
      </Link>

      <Titulo
        detalle={
          <>
            {ETIQUETA_PACKAGING[bulto.packaging]} ·{" "}
            <span className="codigo">{bulto.codigo}</span>
          </>
        }
      >
        {bulto.ubicacion ?? "Sin ubicar"}
      </Titulo>

      {bulto.ajeno && bulto.grupo && (
        <div className="mb-3">
          <Aviso tono="advertencia">{avisoAjeno(bulto, bulto.grupo)}</Aviso>
        </div>
      )}

      <div className="tarjeta mb-4 p-5">
        {bulto.esObjeto && (
          <>
            <p className="text-lg font-bold text-slate-900">{bulto.contenido}</p>
            <p className="mt-1 text-sm text-slate-500">
              Objeto: ocupa la posición pero no es producto ni cuenta en el stock.
            </p>
          </>
        )}
        <ul className="divide-y divide-slate-100">
          {contenido.map((c) => (
            <li key={c.modeloId} className="flex items-baseline justify-between py-2">
              <span className="text-sm font-semibold text-slate-800">
                {c.nombre}
              </span>
              <span className="cifra text-lg text-slate-900">
                {numero(c.cantidad)}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
          <span className="text-sm text-slate-500">
            {bulto.esObjeto ? "" : `Total: ${numero(bulto.cantidad)} ${bulto.unidadPlural}`}
          </span>
          <ChipConfianza confianza={confianza(bulto, semivida)} fila={bulto} compacto />
        </div>
      </div>

      <AccionesBulto
        bulto={{
          id: bulto.id,
          codigo: bulto.codigo,
          packaging: bulto.packaging,
          cantidad: bulto.cantidad,
          ubicacion: bulto.ubicacion,
          unidadPlural: bulto.unidadPlural,
          empresas: bulto.empresas,
          empresasIds: bulto.empresasIds,
          esObjeto: bulto.esObjeto,
        }}
        contenido={contenido}
        motivos={motivos}
        posiciones={posiciones}
      />
    </>
  );
}
