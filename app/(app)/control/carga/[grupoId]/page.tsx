import Link from "next/link";
import { notFound } from "next/navigation";
import { requerirRol } from "@/lib/auth";
import { cargaDelGrupo, modelosParaCargar } from "@/lib/consultas";
import { Titulo } from "@/components/ui";
import { Carga } from "./carga";

export const metadata = { title: "Carga inicial · Racks" };
export const dynamic = "force-dynamic";

export default async function PantallaCarga({ params }: { params: Promise<{ grupoId: string }> }) {
  await requerirRol("control", "admin");
  const { grupoId } = await params;
  const [datos, modelos] = await Promise.all([cargaDelGrupo(Number(grupoId)), modelosParaCargar()]);
  if (!datos) notFound();
  const { grupo } = datos;
  const relevadas = datos.posiciones.filter((p) => p.relevada).length;
  const bultos = datos.posiciones.filter((p) => p.ocupante?.deLaCarga).length;

  return (
    <>
      <Link href="/control" className="mb-2 inline-block text-sm font-medium text-slate-500">
        ← Recorrida
      </Link>
      <Titulo detalle="Posición por posición: si está vacía o qué hay, y desde cuándo.">
        Carga inicial · {grupo.codigo}
        {grupo.nombre ? <span className="font-normal text-slate-500"> {grupo.nombre}</span> : null}
      </Titulo>

      {grupo.estado === "sin_iniciar" ? (
        <div className="tarjeta p-5 text-sm text-slate-600">
          La carga inicial de este grupo no está abierta. La abre el admin desde Administración → Grupos de racks.
        </div>
      ) : grupo.estado === "cerrada" ? (
        <div className="tarjeta space-y-3 p-5 text-sm text-slate-700">
          <p className="text-base font-bold text-slate-900">Carga inicial cerrada</p>
          <p>
            Se cerró el {grupo.cerradaEn?.toLocaleDateString("es-AR")}
            {grupo.cerradaPor ? ` (${grupo.cerradaPor})` : ""}, con{" "}
            <strong>{relevadas} de {datos.posiciones.length} posiciones relevadas</strong> y{" "}
            <strong>
              {bultos} bulto{bultos === 1 ? "" : "s"} cargado{bultos === 1 ? "" : "s"}
            </strong>
            .
          </p>
          {relevadas < datos.posiciones.length && (
            <p className="text-slate-500">
              Las que quedaron sin relevar entran a la recorrida normal como nunca chequeadas.
            </p>
          )}
          <p className="text-slate-500">
            Desde ahora el grupo se opera como cualquier otro: lo que falte se ingresa o se corrige desde la recorrida.
          </p>
          <Link href="/control" className="boton-primario flex items-center justify-center">
            Volver a la recorrida
          </Link>
        </div>
      ) : (
        <Carga grupo={{ id: grupo.id, codigo: grupo.codigo }} posiciones={datos.posiciones} modelos={modelos} />
      )}
    </>
  );
}
