import Link from "next/link";
import { notFound } from "next/navigation";
import { requerirRol } from "@/lib/auth";
import { detalleDeModelo, type BultoDeModelo } from "@/lib/consultas";
import { semividaDias } from "@/lib/configuracion";
import { confianza, indice } from "@/lib/confiabilidad";
import { fueraDeNorma } from "@/lib/bultos";
import {
  ETIQUETA_PACKAGING,
  PACKAGINGS,
  medidaDeSolapa,
  numero,
  unidades,
} from "@/lib/formato";
import { ChipConfianza, Indice } from "@/components/confiabilidad";
import { Titulo } from "@/components/ui";
import type { Packaging } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

type Solapa = Packaging | "total";
const SOLAPAS: Solapa[] = [...PACKAGINGS, "total"];

function esSolapa(v: string | undefined): v is Solapa {
  return !!v && (SOLAPAS as string[]).includes(v);
}

export default async function PantallaModelo({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ solapa?: string }>;
}) {
  await requerirRol("comercial", "admin", "auditor", "control");

  const { id } = await params;
  const { solapa: pedida } = await searchParams;
  const modelo = await detalleDeModelo(Number(id));
  if (!modelo) notFound();

  const semivida = await semividaDias();

  /**
   * La solapa vive en la URL y no en estado del cliente: cada solapa es un
   * link, así el que manda "mirá cuánto hay de Laja en optimizado" manda la
   * solapa abierta, y la pantalla no depende de que el JS haya hidratado.
   */
  const solapa: Solapa = esSolapa(pedida) ? pedida : "total";

  const porPackaging = (p: Packaging) =>
    modelo.bultos.filter((b) => b.packaging === p);

  const totalDe = (bultos: BultoDeModelo[]) =>
    bultos.reduce((s, b) => s + b.unidades, 0);

  const visibles = solapa === "total" ? modelo.bultos : porPackaging(solapa);

  /** Lo que se cuenta en cada solapa. Ver `medidaDeSolapa`: no es lo mismo. */
  const medidaDe = (s: Solapa) => {
    const bultos = s === "total" ? modelo.bultos : porPackaging(s as Packaging);
    return medidaDeSolapa(
      s,
      { bultos: bultos.length, unidades: totalDe(bultos) },
      modelo.unidadSingular,
      modelo.unidadPlural,
    );
  };
  const medida = medidaDe(solapa);

  const confianzas = visibles.map((b) => confianza(b, semivida));
  const resumen = indice(confianzas);

  return (
    <>
      <Link
        href="/stock"
        className="mb-2 inline-block text-sm font-medium text-slate-500"
      >
        ← Stock
      </Link>

      <Titulo detalle={`${modelo.lineaNombre} · se cuenta en ${modelo.unidadPlural}`}>
        {modelo.nombre}
      </Titulo>

      {/* Las cuatro solapas. La última es la que se cita por teléfono. */}
      <nav className="mb-4 flex gap-1.5 overflow-x-auto">
        {SOLAPAS.map((s) => {
          const activa = s === solapa;
          const m = medidaDe(s);
          return (
            <Link
              key={s}
              href={`/stock/${modelo.id}?solapa=${s}`}
              className={`flex min-w-24 flex-1 flex-col items-center rounded-xl px-3 py-2.5 text-center transition ${
                activa
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
              }`}
            >
              <span className="text-[11px] font-medium">
                {s === "total" ? "Total" : ETIQUETA_PACKAGING[s]}
              </span>
              <span className="cifra text-lg leading-tight">
                {numero(m.valor)}
              </span>
              {/* La unidad va en la solapa y no solo en el detalle: sin esto,
                  "Suelto 20" y "Palet 3" se leen como la misma clase de número,
                  y no lo son. */}
              <span
                className={`text-[10px] leading-tight ${activa ? "text-slate-300" : "text-slate-400"}`}
              >
                {m.unidad}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="tarjeta mb-4 p-5">
        <p className="text-sm text-slate-500">
          {solapa === "total"
            ? "Todo lo que hay de este modelo, sumando los tres packagings"
            : `En ${ETIQUETA_PACKAGING[solapa].toLowerCase()}`}
        </p>
        <p className="cifra mt-1 text-3xl text-slate-900">
          {numero(medida.valor)} {medida.unidad}
        </p>
        <p className="mt-1 text-sm text-slate-500">
          {medida.equivale != null ? (
            <>
              {medida.valor === 1 ? "equivale a" : "equivalen a"}{" "}
              <strong className="text-slate-700">
                {unidades(
                  medida.equivale,
                  modelo.unidadSingular,
                  modelo.unidadPlural,
                )}
              </strong>
            </>
          ) : (
            <>
              en {visibles.length} bulto{visibles.length === 1 ? "" : "s"}
            </>
          )}
          {solapa !== "total" && modelo.normas[solapa] != null && (
            <> · la norma es {numero(modelo.normas[solapa]!)} por palet</>
          )}
        </p>
        <div className="mt-3 border-t border-slate-100 pt-3">
          <Indice {...resumen} />
        </div>
      </div>

      {visibles.length === 0 ? (
        <div className="tarjeta p-6 text-sm text-slate-600">
          No hay nada de {modelo.nombre}
          {solapa !== "total" && ` en ${ETIQUETA_PACKAGING[solapa].toLowerCase()}`}
          .
        </div>
      ) : (
        <ul className="space-y-2">
          {visibles.map((b, i) => (
            <FilaBulto
              key={b.id}
              bulto={b}
              confianza={confianzas[i]}
              modelo={modelo}
              mostrarPackaging={solapa === "total"}
            />
          ))}
        </ul>
      )}
    </>
  );
}

function FilaBulto({
  bulto,
  confianza: c,
  modelo,
  mostrarPackaging,
}: {
  bulto: BultoDeModelo;
  confianza: ReturnType<typeof confianza>;
  modelo: { normas: Partial<Record<Packaging, number>>; unidadPlural: string };
  mostrarPackaging: boolean;
}) {
  const norma = modelo.normas[bulto.packaging] ?? null;
  /**
   * En un bulto mezclado no se compara contra la norma: la norma es de un
   * modelo y un packaging, y acá hay dos modelos. `null` no es "fuera de
   * norma", es que la pregunta no aplica.
   */
  const fuera = bulto.otrosModelos
    ? null
    : fueraDeNorma(bulto.totalBulto, norma);

  return (
    <li className="tarjeta flex items-start gap-4 p-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="codigo text-base text-slate-900">
            {bulto.ubicacion ?? "En el piso"}
          </span>
          {mostrarPackaging && (
            <span className="chip bg-slate-100 text-slate-600">
              {ETIQUETA_PACKAGING[bulto.packaging]}
            </span>
          )}
          {bulto.accesibilidad === "penetrable" && (
            /**
             * En un carril penetrable la profundidad NO es un detalle: dos
             * bultos en C-3 no son intercambiables, porque para sacar el del
             * fondo hay que bajar el de adelante. Sin esto, dos filas de la
             * lista se ven idénticas y el que va a buscar uno no sabe cuál.
             */
            <span
              className="chip bg-slate-100 text-slate-500"
              title="Rack penetrable: para sacar el del fondo hay que bajar los de adelante"
            >
              {bulto.profundidad == null
                ? "penetrable"
                : bulto.profundidad === 1
                  ? "al frente"
                  : bulto.profundidad === bulto.profundidadMax
                    ? "al fondo"
                    : `${bulto.profundidad}º del carril`}
            </span>
          )}
          {bulto.otrosModelos && (
            <span
              className="chip bg-blue-50 text-blue-800"
              title="Comparte el bulto con otro modelo, así que no es un bulto normalizado"
            >
              mezclado con {bulto.otrosModelos}
            </span>
          )}
          {fuera === true && (
            <span
              className="chip bg-amber-100 text-amber-900"
              title={`La norma es ${norma} por bulto`}
            >
              fuera de norma
            </span>
          )}
        </div>

        <p className="mt-1 text-xs text-slate-500">
          <span className="codigo">{bulto.codigo}</span>
          {bulto.otrosModelos && (
            <> · el bulto lleva {numero(bulto.totalBulto)} en total</>
          )}
        </p>

        <div className="mt-1.5">
          <ChipConfianza confianza={c} compacto />
        </div>
      </div>

      <div className="text-right">
        <p className="cifra text-xl text-slate-900">
          {numero(bulto.unidades)}
        </p>
        <p className="text-[11px] text-slate-500">{modelo.unidadPlural}</p>
      </div>
    </li>
  );
}
