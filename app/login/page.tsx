import { Marca } from "@/components/marca";
import { FormularioLogin } from "./formulario";

export const metadata = { title: "Entrar · Gestión de Racks" };

export default async function PaginaLogin({
  searchParams,
}: {
  searchParams: Promise<{ motivo?: string; volver?: string }>;
}) {
  const { motivo, volver } = await searchParams;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white">
            <Marca clase="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">
            Gestión de Racks
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Ingresá con tu usuario y PIN
          </p>
        </div>

        {motivo === "inactivo" && (
          <div className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 ring-1 ring-amber-200">
            Tu sesión se cerró porque el usuario fue dado de baja.
          </div>
        )}

        <FormularioLogin volver={volver} />
      </div>
    </main>
  );
}
