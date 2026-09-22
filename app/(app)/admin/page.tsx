import Link from "next/link";
import { requerirRol } from "@/lib/auth";
import { EnConstruccion, Titulo } from "@/components/ui";

export const metadata = { title: "Administración · Racks" };

export default async function PantallaAdmin() {
  await requerirRol("admin");

  return (
    <>
      <Titulo detalle="Los datos que definen cómo mide el sistema.">
        Administración
      </Titulo>
      <EnConstruccion fase="Fase 1">
        <p>
          Acá va el ABM de líneas, modelos, <strong>normas</strong> (modelo ×
          packaging → cantidad), racks, posiciones y usuarios.
        </p>
        <p>
          Nada se borra: los modelos, racks y posiciones se suspenden, porque el
          historial tiene que seguir leyéndose.
        </p>
      </EnConstruccion>

      <div className="tarjeta mt-4 p-5">
        <h2 className="text-base font-bold text-slate-900">Diagnóstico de base</h2>
        <p className="mt-1 mb-3 text-sm text-slate-600">
          Mide la latencia, las consultas en paralelo y una transacción con
          bloqueo, desde el mismo lugar donde corre la app. Es lo primero que hay
          que mirar cuando desde la planta dicen que está lenta.
        </p>
        <Link href="/admin/diagnostico" className="boton-secundario">
          Medir ahora
        </Link>
      </div>
    </>
  );
}
