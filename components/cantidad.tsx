import { esNormalizado } from "@/lib/bultos";
import { numero } from "@/lib/formato";
import type { Packaging } from "@/lib/db/schema";

/**
 * La cantidad de un renglón al cargar un bulto.
 *
 * En un SUELTO se escribe: no hay dos iguales. En un PALET o un OPTIMIZADO no
 * hay nada que escribir: es la cantidad normalizada del modelo, fija, y se
 * muestra sin campo para que quede claro que no se cambia. Si lo que hay es
 * otra cantidad, no es un palet: se carga como suelto.
 */
export function CampoCantidad({
  packaging,
  norma,
  valor,
  onCambio,
  nombre,
  enfocar = false,
}: {
  packaging: Packaging;
  norma: number | null | undefined;
  valor: string;
  onCambio: (v: string) => void;
  nombre: string;
  enfocar?: boolean;
}) {
  if (esNormalizado(packaging)) {
    return (
      <span
        className="w-24 rounded-xl bg-slate-100 px-3 py-2 text-right text-slate-700 ring-1 ring-slate-200"
        aria-label={`Cantidad de ${nombre}: fija`}
      >
        <span className="cifra block text-base font-semibold">{norma != null ? numero(norma) : "—"}</span>
        <span className="block text-[10px] uppercase tracking-wide text-slate-500">fija</span>
      </span>
    );
  }
  return (
    <input
      className={`campo w-24 text-right ${Number(valor) > 0 ? "" : "ring-2 ring-amber-400"}`}
      inputMode="numeric"
      placeholder="Cant."
      autoFocus={enfocar}
      value={valor}
      onChange={(e) => onCambio(e.target.value.replace(/\D/g, ""))}
      aria-label={`Cantidad de ${nombre}`}
    />
  );
}
