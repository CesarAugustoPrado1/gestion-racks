import Link from "next/link";
import { requerirRol } from "@/lib/auth";
import { enModoPrueba } from "@/lib/configuracion";
import { EnConstruccion, Titulo } from "@/components/ui";

export const metadata = { title: "Administración · Racks" };
export const dynamic = "force-dynamic";

export default async function PantallaAdmin() {
  await requerirRol("admin");
  const prueba = await enModoPrueba();

  return (
    <>
      <Titulo detalle="Los datos que definen cómo mide el sistema.">
        Administración
      </Titulo>

      {prueba && (
        <div className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm ring-1 ring-amber-200">
          <p className="font-semibold text-amber-900">
            Esta instalación está en etapa de prueba.
          </p>
          <p className="mt-0.5 text-amber-800">
            Lo que cargues es descartable, y el borrado masivo está habilitado.
            Cuando termines, la pantalla de datos de prueba lo apaga para
            siempre.
          </p>
        </div>
      )}

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
        <h2 className="text-base font-bold text-slate-900">Datos de prueba</h2>
        <p className="mt-1 mb-3 text-sm text-slate-600">
          Cargar un juego de datos inventados para ver la app con contenido,
          borrarlo, y cuando llegue el momento, terminar la etapa de prueba.
        </p>
        <Link href="/admin/datos-prueba" className="boton-secundario">
          {prueba ? "Cargar o borrar datos" : "Ver estado"}
        </Link>
      </div>

      <div className="tarjeta mt-4 p-5">
        <h2 className="text-base font-bold text-slate-900">
          Diagnóstico de base
        </h2>
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
