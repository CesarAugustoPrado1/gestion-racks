import { requerirSesion } from "@/lib/auth";
import { cerrarSesion } from "@/lib/acciones/sesion";
import { ETIQUETA_ROL, navParaRol } from "@/lib/permisos";
import { NavInferior, NavLateral } from "@/components/navegacion";
import { Marca } from "@/components/marca";

export default async function LayoutApp({
  children,
}: {
  children: React.ReactNode;
}) {
  const sesion = await requerirSesion();
  const items = navParaRol(sesion.rol);

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <Marca clase="h-5 w-5 text-slate-900" />
            <span className="truncate text-sm font-bold text-slate-900">
              Racks
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="min-w-0 text-right">
              <p className="truncate text-sm font-semibold text-slate-900">
                {sesion.nombre}
              </p>
              <p className="truncate text-[11px] text-slate-500">
                {ETIQUETA_ROL[sesion.rol]}
              </p>
            </div>
            <form action={cerrarSesion}>
              <button
                type="submit"
                className="rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-500 ring-1 ring-slate-300 hover:bg-slate-100"
              >
                Salir
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-6 px-4 py-5">
        <NavLateral items={items} />
        {/* El padding inferior deja lugar a la barra de navegacion del celular. */}
        <main className="min-w-0 flex-1 pb-24 md:pb-4">{children}</main>
      </div>

      <NavInferior items={items} />
    </div>
  );
}
