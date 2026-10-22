import Link from "next/link";
import { requerirRol } from "@/lib/auth";
import { gruposParaPlano, planoVigente } from "@/lib/plano-db";
import { Titulo } from "@/components/ui";
import { EditorPlano } from "./editor";

export const metadata = { title: "Editar plano · Racks" };
export const dynamic = "force-dynamic";

export default async function PantallaEditarPlano() {
  await requerirRol("admin");
  const [vigente, grupos] = await Promise.all([planoVigente(), gruposParaPlano()]);

  return (
    <>
      <Link href="/planta" className="mb-2 inline-block text-sm font-medium text-slate-500">
        ← Plano
      </Link>
      <Titulo
        detalle={
          vigente.version
            ? `Versión ${vigente.version}, guardada ${vigente.guardadoEn!.toLocaleString("es-AR", {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}${vigente.guardadoPor ? ` por ${vigente.guardadoPor}` : ""}. Cada guardado es una versión nueva: la anterior no se pierde.`
            : "Todavía no hay plano. Empezá por el espacio de trabajo y el límite de la fábrica."
        }
      >
        Editar plano
      </Titulo>
      <EditorPlano inicial={vigente.plano} version={vigente.version} grupos={grupos} />
    </>
  );
}
