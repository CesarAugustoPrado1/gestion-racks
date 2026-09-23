import Link from "next/link";
import { requerirRol } from "@/lib/auth";
import { correrDiagnostico } from "@/lib/diagnostico";
import { cuadraElStock, estadoDelEsquema } from "@/lib/esquema";
import { Aviso, Titulo } from "@/components/ui";

export const metadata = { title: "Diagnóstico · Racks" };

/** Se mide en cada visita: una medición cacheada no es una medición. */
export const dynamic = "force-dynamic";

export default async function PantallaDiagnostico() {
  await requerirRol("admin");
  const [{ host, mediciones, problema }, esquema, stock] = await Promise.all([
    correrDiagnostico(),
    estadoDelEsquema(),
    cuadraElStock(),
  ]);

  return (
    <>
      <Titulo detalle="Cómo se porta la base desde acá, que es desde donde importa.">
        Diagnóstico de base
      </Titulo>

      <div className="tarjeta mb-4 space-y-3 p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-semibold text-slate-900">Esquema</h2>
          <span
            className={`chip ${
              esquema.veredicto === "al_dia"
                ? "bg-confiable-suave text-confiable"
                : "bg-vencido-suave text-vencido"
            }`}
          >
            {esquema.veredicto === "al_dia"
              ? "al día"
              : esquema.veredicto === "sin_migrar"
                ? "sin migrar"
                : "incompleto"}
          </span>
        </div>

        <ul className="flex flex-wrap gap-1.5">
          {esquema.contabilidad.map((m) => (
            <li
              key={m.tag}
              className={`codigo rounded-lg px-2 py-1 text-xs ${
                m.aplicada
                  ? "bg-confiable-suave text-confiable"
                  : "bg-slate-100 text-slate-500"
              }`}
            >
              {m.aplicada ? "✓" : "·"} {m.tag}
            </li>
          ))}
        </ul>

        {esquema.veredicto === "al_dia" ? (
          <Aviso tono="exito">
            Las {esquema.contabilidad.length} migraciones están anotadas y la base
            tiene todo lo que el código espera: se verificaron{" "}
            {esquema.exigencias.length} tablas y columnas, una por cada cosa que
            cada migración tenía que dejar.
          </Aviso>
        ) : (
          <>
            <Aviso>
              La base no tiene todo lo que el código espera. Mientras esto diga
              esto, hay pantallas que van a fallar al abrirse.
            </Aviso>
            <ul className="space-y-1.5 text-sm">
              {esquema.faltantes.map((e) => (
                <li key={e.objeto} className="text-red-700">
                  <span className="codigo text-xs">{e.objeto}</span> — falta{" "}
                  {e.que}{" "}
                  <span className="text-slate-500">({e.migracion})</span>
                </li>
              ))}
              {esquema.sobrantes.map((e) => (
                <li key={e.objeto} className="text-yellow-800">
                  <span className="codigo text-xs">{e.objeto}</span> — todavía
                  está {e.que}{" "}
                  <span className="text-slate-500">({e.migracion})</span>
                </li>
              ))}
            </ul>
          </>
        )}

        {/* El esquema puede estar perfecto y los datos igual mal: pasó con la
            0003, donde las salidas viejas seguían sumando en vez de restar. */}
        <div className="flex items-start gap-3 border-t border-slate-100 pt-3">
          <span
            className={`mt-0.5 text-lg leading-none ${stock.ok ? "text-emerald-600" : "text-red-600"}`}
            aria-label={stock.ok ? "bien" : "falló"}
          >
            {stock.ok ? "✓" : "✗"}
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-900">
              El stock cuadra con el historial
            </p>
            <p
              className={`text-xs ${stock.ok ? "text-slate-500" : "text-red-700"}`}
            >
              {stock.detalle}
            </p>
          </div>
        </div>
      </div>

      <div className="tarjeta space-y-4 p-5">
        <h2 className="font-semibold text-slate-900">Velocidad de la base</h2>
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
