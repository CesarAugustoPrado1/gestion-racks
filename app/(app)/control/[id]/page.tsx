import Link from "next/link";
import { notFound } from "next/navigation";
import { requerirRol } from "@/lib/auth";
import {
  modelosParaCargar,
  motivosDeAjuste,
  posicionConBultos,
} from "@/lib/consultas";
import { semividaDias } from "@/lib/configuracion";
import { confianza } from "@/lib/confiabilidad";
import { ChipConfianza } from "@/components/confiabilidad";
import { Titulo } from "@/components/ui";
import { Chequeo } from "./chequeo";

export const dynamic = "force-dynamic";

export default async function PantallaChequeo({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requerirRol("control", "admin");
  const { id } = await params;
  const datos = await posicionConBultos(Number(id));
  if (!datos) notFound();

  const [motivos, modelos, semivida] = await Promise.all([
    motivosDeAjuste(),
    modelosParaCargar(),
    semividaDias(),
  ]);

  return (
    <>
      <Link href="/control" className="mb-2 inline-block text-sm font-medium text-slate-500">
        ← Recorrida
      </Link>

      <Titulo detalle="Mirá la posición y decí si coincide con esto.">
        {datos.posicion.codigo}
      </Titulo>

      <div className="mb-4">
        <ChipConfianza confianza={confianza(datos.posicion, semivida)} />
      </div>

      <Chequeo
        posicion={{
          id: datos.posicion.id,
          codigo: datos.posicion.codigo,
          bultos: datos.posicion.bultos,
        }}
        bultos={datos.bultos}
        motivos={motivos}
        modelos={modelos}
      />
    </>
  );
}
