"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { ItemNav } from "@/lib/permisos";

const ICONOS: Record<string, string> = {
  autoelevador: "🚜",
  control: "✅",
  grid: "🗄",
  pallet: "📦",
  lista: "☰",
  config: "⚙",
};

/** Mas de esto y los textos se encimaban en la pantalla del celular. */
const MAXIMO_EN_BARRA = 4;

function estaActivo(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Barra inferior fija: es la navegacion del celular en planta.
 *
 * Cada operario ve una o dos secciones y entra de un toque. El admin ve todas,
 * y si no entran las primeras cuatro quedan en la barra y el resto pasa a una
 * hoja que se abre con "Más".
 */
export function NavInferior({ items }: { items: ItemNav[] }) {
  const pathname = usePathname();
  const [abierto, setAbierto] = useState(false);

  // Al navegar, la hoja se cierra sola.
  useEffect(() => setAbierto(false), [pathname]);

  if (items.length < 2) return null;

  const hayDesborde = items.length > MAXIMO_EN_BARRA;
  const enBarra = hayDesborde ? items.slice(0, MAXIMO_EN_BARRA) : items;
  const enHoja = hayDesborde ? items.slice(MAXIMO_EN_BARRA) : [];
  const activoEnHoja = enHoja.some((i) => estaActivo(pathname, i.href));
  const columnas = enBarra.length + (hayDesborde ? 1 : 0);

  return (
    <>
      {abierto && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/40 md:hidden"
          onClick={() => setAbierto(false)}
          aria-hidden
        />
      )}

      {abierto && (
        <div className="fixed inset-x-0 bottom-0 z-40 rounded-t-2xl bg-white pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl md:hidden">
          <div className="mx-auto mt-2 mb-1 h-1 w-10 rounded-full bg-slate-300" />
          <ul className="p-2">
            {enHoja.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 rounded-xl px-4 py-3.5 text-base font-semibold ${
                    estaActivo(pathname, item.href)
                      ? "bg-slate-900 text-white"
                      : "text-slate-700 active:bg-slate-100"
                  }`}
                >
                  <span className="w-6 text-center text-lg">
                    {ICONOS[item.icono] ?? "•"}
                  </span>
                  {item.etiqueta}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur md:hidden">
        <ul
          className="mx-auto grid max-w-2xl"
          style={{ gridTemplateColumns: `repeat(${columnas}, minmax(0, 1fr))` }}
        >
          {enBarra.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={clasesBoton(estaActivo(pathname, item.href))}
              >
                <span className="text-lg leading-none">
                  {ICONOS[item.icono] ?? "•"}
                </span>
                <span className="w-full truncate text-center">
                  {item.etiqueta}
                </span>
                <span className={rayita(estaActivo(pathname, item.href))} />
              </Link>
            </li>
          ))}

          {hayDesborde && (
            <li>
              <button
                type="button"
                onClick={() => setAbierto((v) => !v)}
                aria-expanded={abierto}
                className={`w-full ${clasesBoton(activoEnHoja || abierto)}`}
              >
                <span className="text-lg leading-none">⋯</span>
                <span className="w-full truncate text-center">Más</span>
                <span className={rayita(activoEnHoja)} />
              </button>
            </li>
          )}
        </ul>
      </nav>
    </>
  );
}

const clasesBoton = (activo: boolean) =>
  `flex flex-col items-center gap-0.5 px-1 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-[11px] font-medium ${
    activo ? "text-slate-900" : "text-slate-400"
  }`;

const rayita = (activo: boolean) =>
  `h-0.5 w-6 rounded-full ${activo ? "bg-slate-900" : "bg-transparent"}`;

/** Menu lateral: comercial, control y el admin miran desde la PC. */
export function NavLateral({ items }: { items: ItemNav[] }) {
  const pathname = usePathname();

  return (
    <nav className="hidden w-56 shrink-0 md:block">
      <ul className="sticky top-20 space-y-1">
        {items.map((item) => {
          const activo = estaActivo(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold ${
                  activo
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-200/60"
                }`}
              >
                <span className="w-5 text-center">
                  {ICONOS[item.icono] ?? "•"}
                </span>
                {item.etiqueta}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
