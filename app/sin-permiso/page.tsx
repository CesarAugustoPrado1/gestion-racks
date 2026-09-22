import Link from "next/link";
import { sesionActual } from "@/lib/auth";
import { rutaInicial } from "@/lib/permisos";

export default async function SinPermiso() {
  const sesion = await sesionActual();

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
      <span className="text-4xl">🔒</span>
      <div>
        <h1 className="text-xl font-bold text-slate-900">
          No tenés acceso a esta pantalla
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Tu rol no incluye esta sección. Si creés que es un error, avisale al
          administrador.
        </p>
      </div>
      <Link
        href={sesion ? rutaInicial(sesion.rol) : "/login"}
        className="boton-primario"
      >
        Volver a mi pantalla
      </Link>
    </main>
  );
}
