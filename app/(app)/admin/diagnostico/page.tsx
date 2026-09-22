import Link from "next/link";
import { requerirRol } from "@/lib/auth";
import { correrDiagnostico } from "@/lib/diagnostico";
import { Aviso, Titulo } from "@/components/ui";

export const metadata = { title: "Diagnóstico · Racks" };

/** Se mide en cada visita: una medición cacheada no es una medición. */
export const dynamic = "force-dynamic";

export default async function PantallaDiagnostico() {
  await requerirRol("admin");
  const { host, mediciones, problema } = await correrDiagnostico();

  return (
    <>
      <Titulo detalle="Cómo se porta la base desde acá, que es desde donde importa.">
        Diagnóstico de base
      </Titulo>

      <div className="tarjeta space-y-4 p-5">
        <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="font-medium text-slate-500">Base</dt>
          <dd className="codigo text-xs break-all text-slate-900">{host}</dd>
          <dt className="font-medium text-slate-500">Commit</dt>
          <dd className="codigo text-xs text-slate-900">
            {(process.env.VERCEL_GIT_COMMIT_SHA ?? "local").slice(0, 7)}
          </dd>
        </dl>

        <ul className="divide-y divide-slate-100">
          {mediciones.map((m) => (
            <li key={m.nombre} className="flex items-start gap-3 py-3">
              <span
                className={`mt-0.5 text-lg leading-none ${m.ok ? "text-emerald-600" : "text-red-600"}`}
                aria-label={m.ok ? "bien" : "falló"}
              >
                {m.ok ? "✓" : "✗"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">
                  {m.nombre}
                  <span className="codigo ml-2 text-slate-500">{m.ms} ms</span>
                </p>
                <p
                  className={`text-xs ${m.ok ? "text-slate-500" : "text-red-700"}`}
                >
                  {m.detalle}
                </p>
              </div>
            </li>
          ))}
        </ul>

        {problema ? (
          <Aviso>{problema}</Aviso>
        ) : (
          <Aviso tono="exito">
            El pooler de Neon aguanta consultas concurrentes y transacciones con
            bloqueo. Se puede construir sobre esto.
          </Aviso>
        )}

        <p className="text-xs text-slate-500">
          La primera consulta puede dar más de un segundo si Neon tenía la base
          suspendida por inactividad: es el compute despertando, y el primer
          movimiento de la mañana lo paga igual. Recargá para medir de nuevo.
        </p>
      </div>

      <Link href="/admin" className="boton-secundario mt-4">
        Volver
      </Link>
    </>
  );
}
