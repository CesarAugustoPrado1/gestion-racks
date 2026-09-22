import Link from "next/link";
import { sql } from "drizzle-orm";
import { requerirRol } from "@/lib/auth";
import { db } from "@/lib/db";
import { enModoPrueba } from "@/lib/configuracion";
import { Titulo } from "@/components/ui";

export const metadata = { title: "Administración · Racks" };
export const dynamic = "force-dynamic";

/**
 * El índice muestra CUÁNTOS hay de cada cosa, no solo el link.
 *
 * Un "0 modelos" al lado del link es lo que hace que alguien que abre la app
 * por primera vez sepa por dónde empezar, sin tener que entrar a cada pantalla
 * a mirar si está vacía.
 */
async function conteos() {
  const filas = (await db.execute(sql`
    select
      (select count(*) from lineas where activa)::int     as lineas,
      (select count(*) from modelos where activo)::int    as modelos,
      (select count(*) from normas)::int                  as normas,
      (select count(*) from racks where activo)::int      as racks,
      (select count(*) from posiciones where activa)::int as posiciones,
      (select count(*) from motivos where activo)::int    as motivos,
      (select count(*) from usuarios where activo)::int   as usuarios
  `)) as unknown as Array<Record<string, number>>;
  return filas[0];
}

export default async function PantallaAdmin() {
  await requerirRol("admin");
  const [prueba, n] = await Promise.all([enModoPrueba(), conteos()]);

  const secciones = [
    {
      href: "/admin/lineas",
      titulo: "Líneas",
      detalle: `${n.lineas} activa${n.lineas === 1 ? "" : "s"}`,
      ayuda: "La unidad en que se cuenta cada una: placas, paquetes, cajas.",
      falta: n.lineas === 0,
    },
    {
      href: "/admin/modelos",
      titulo: "Modelos y normas",
      detalle: `${n.modelos} modelo${n.modelos === 1 ? "" : "s"} · ${n.normas} norma${n.normas === 1 ? "" : "s"}`,
      ayuda: "Cuántas unidades lleva un palet y un optimizado de cada modelo.",
      falta: n.modelos === 0,
    },
    {
      href: "/admin/racks",
      titulo: "Racks y posiciones",
      detalle: `${n.racks} rack${n.racks === 1 ? "" : "s"} · ${n.posiciones} posicion${n.posiciones === 1 ? "" : "es"}`,
      ayuda: "Selectivo o penetrable, y las posiciones se generan por rango.",
      falta: n.racks === 0,
    },
    {
      href: "/admin/motivos",
      titulo: "Motivos",
      detalle: `${n.motivos} activo${n.motivos === 1 ? "" : "s"}`,
      ayuda: "Por qué sale algo del rack. Sin motivos no se puede sacar nada.",
      falta: n.motivos === 0,
    },
    {
      href: "/admin/usuarios",
      titulo: "Usuarios",
      detalle: `${n.usuarios} activo${n.usuarios === 1 ? "" : "s"}`,
      ayuda: "Quién entra y a qué pantalla.",
      falta: false,
    },
  ];

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
          </p>
        </div>
      )}

      <ul className="space-y-2">
        {secciones.map((s) => (
          <li key={s.href}>
            <Link
              href={s.href}
              className="tarjeta flex items-center gap-3 p-4 transition active:scale-[0.99] hover:ring-slate-300"
            >
              <div className="min-w-0 flex-1">
                <p className="text-base font-bold text-slate-900">
                  {s.titulo}
                  {s.falta && (
                    <span className="ml-2 chip bg-amber-100 text-amber-900">
                      falta cargar
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-500">{s.ayuda}</p>
              </div>
              <span className="shrink-0 text-xs text-slate-400">{s.detalle}</span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="tarjeta mt-5 p-5">
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
        <h2 className="text-base font-bold text-slate-900">Diagnóstico de base</h2>
        <p className="mt-1 mb-3 text-sm text-slate-600">
          Mide la latencia, las consultas en paralelo y una transacción con
          bloqueo, desde el mismo lugar donde corre la app.
        </p>
        <Link href="/admin/diagnostico" className="boton-secundario">
          Medir ahora
        </Link>
      </div>
    </>
  );
}
