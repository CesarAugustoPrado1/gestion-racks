import type { ReactNode } from "react";

export function Aviso({
  tono = "error",
  children,
}: {
  tono?: "error" | "info" | "exito";
  children: ReactNode;
}) {
  const estilos = {
    error: "bg-red-50 text-red-800 ring-red-200",
    info: "bg-blue-50 text-blue-800 ring-blue-200",
    exito: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  }[tono];

  return (
    <p
      className={`rounded-xl px-4 py-3 text-sm font-medium ring-1 ${estilos}`}
      role={tono === "error" ? "alert" : undefined}
    >
      {children}
    </p>
  );
}

/**
 * Encabezado de pantalla. El titulo dice el puesto, no la app: el operario ya
 * sabe en que app esta.
 */
export function Titulo({
  children,
  detalle,
}: {
  children: ReactNode;
  detalle?: ReactNode;
}) {
  return (
    <div className="mb-5">
      <h1 className="text-xl font-bold text-slate-900">{children}</h1>
      {detalle && <p className="mt-1 text-sm text-slate-500">{detalle}</p>}
    </div>
  );
}

/**
 * Pantalla todavia sin construir.
 *
 * Existe porque la fase 0 despliega la app entera -login, roles, navegacion-
 * antes de tener una sola pantalla de trabajo, y cada puesto tiene que poder
 * entrar y ver algo que le diga la verdad: que su pantalla viene despues y que
 * su usuario ya funciona. Se van borrando de a una a medida que se construyen.
 */
export function EnConstruccion({
  fase,
  children,
}: {
  fase: string;
  children: ReactNode;
}) {
  return (
    <div className="tarjeta p-6">
      <span className="chip bg-amber-100 text-amber-900">{fase}</span>
      <div className="mt-3 space-y-2 text-sm text-slate-600">{children}</div>
    </div>
  );
}
