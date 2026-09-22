import Link from "next/link";
import { sql } from "drizzle-orm";
import { requerirRol } from "@/lib/auth";
import { db } from "@/lib/db";
import { enModoPrueba } from "@/lib/configuracion";
import { Aviso, Titulo } from "@/components/ui";
import { PanelPrueba } from "./panel";

export const metadata = { title: "Datos de prueba · Racks" };
export const dynamic = "force-dynamic";

/** Lo que hay cargado ahora mismo, para no borrar a ciegas. */
async function contar() {
  const filas = (await db.execute(sql`
    select
      (select count(*) from lineas)::int      as lineas,
      (select count(*) from modelos)::int     as modelos,
      (select count(*) from racks)::int       as racks,
      (select count(*) from posiciones)::int  as posiciones,
      (select count(*) from bultos)::int      as bultos,
      (select count(*) from movimientos)::int as movimientos,
      (select count(*) from chequeos)::int    as chequeos
  `)) as unknown as Array<Record<string, number>>;
  return filas[0];
}

export default async function PantallaDatosPrueba() {
  await requerirRol("admin");
  const [prueba, conteo] = await Promise.all([enModoPrueba(), contar()]);
  const hayDatos = Object.values(conteo).some((n) => n > 0);

  return (
    <>
      <Titulo detalle="Cargar datos inventados, mirar cómo se ve, borrar y volver a empezar.">
        Datos de prueba
      </Titulo>

      <div className="tarjeta mb-4 p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-500">
          Qué hay cargado ahora
        </h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
          {Object.entries(conteo).map(([que, cuantos]) => (
            <div key={que}>
              <dt className="text-xs text-slate-500 capitalize">{que}</dt>
              <dd className="cifra text-lg text-slate-900">{cuantos}</dd>
            </div>
          ))}
        </dl>
      </div>

      {prueba ? (
        <PanelPrueba hayDatos={hayDatos} />
      ) : (
        <div className="tarjeta space-y-3 p-5">
          <Aviso tono="info">
            Esta instalación ya está trabajando en serio: la etapa de prueba
            terminó y el borrado masivo no existe más.
          </Aviso>
          <p className="text-sm text-slate-600">
            Es a propósito y no se puede deshacer desde acá. Si de verdad hiciera
            falta volver a habilitarla, se hace desde la base de datos con una
            línea de SQL, y que cueste eso es la diferencia entre un error de un
            clic y un acto deliberado.
          </p>
        </div>
      )}

      <Link href="/admin" className="boton-secundario mt-4">
        Volver
      </Link>
    </>
  );
}
