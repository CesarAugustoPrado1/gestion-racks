import Link from "next/link";
import { requerirRol } from "@/lib/auth";
import { modelosParaCargar, posicionesLibres } from "@/lib/consultas";
import { Titulo } from "@/components/ui";
import { FormularioMeter } from "./formulario";

export const metadata = { title: "Meter al rack · Racks" };
export const dynamic = "force-dynamic";

export default async function PantallaMeter() {
  await requerirRol("autoelevador", "admin");
  const [modelos, posiciones] = await Promise.all([
    modelosParaCargar(),
    posicionesLibres(),
  ]);

  return (
    <>
      <Link href="/mover" className="mb-2 inline-block text-sm font-medium text-slate-500">
        ← Mover
      </Link>
      <Titulo detalle="El bulto nace cuando entra al rack.">Meter al rack</Titulo>

      {modelos.length === 0 ? (
        <div className="tarjeta p-6 text-sm text-slate-600">
          No hay modelos cargados todavía. Se cargan desde Administración.
        </div>
      ) : (
        <FormularioMeter modelos={modelos} posiciones={posiciones} />
      )}
    </>
  );
}
