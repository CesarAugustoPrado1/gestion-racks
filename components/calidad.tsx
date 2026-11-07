import type { Calidad } from "@/lib/db/schema";

/**
 * El tilde de SEGUNDA al dar de alta un bulto. Sin tocarlo, entra de primera:
 * es lo normal, y lo normal no tiene que costar un toque.
 *
 * Se ve en naranja cuando está marcado, para que no pase desapercibido antes de
 * guardar: un palet de primera cargado como segunda -o al revés- es un error
 * que después hay que corregir con registro.
 */
export function TildeSegunda({
  valor,
  onCambio,
}: {
  valor: Calidad;
  onCambio: (c: Calidad) => void;
}) {
  const segunda = valor === "segunda";
  return (
    <label
      className={`flex min-h-12 items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition ${
        segunda ? "bg-orange-100 text-orange-900 ring-2 ring-orange-400" : "bg-white text-slate-700 ring-1 ring-slate-300"
      }`}
    >
      <input
        type="checkbox"
        className="h-5 w-5 accent-orange-600"
        checked={segunda}
        onChange={(e) => onCambio(e.target.checked ? "segunda" : "primera")}
      />
      <span>
        De segunda
        <span className="block text-xs font-normal opacity-80">
          {segunda ? "Se va a registrar como producto de SEGUNDA." : "Sin marcar, entra de primera."}
        </span>
      </span>
    </label>
  );
}

/** La marca de un bulto de segunda en las listas. Los de primera no llevan nada. */
export function ChipSegunda({ calidad }: { calidad: Calidad | string | null | undefined }) {
  if (calidad !== "segunda") return null;
  return <span className="chip bg-orange-100 text-orange-900">2da</span>;
}
