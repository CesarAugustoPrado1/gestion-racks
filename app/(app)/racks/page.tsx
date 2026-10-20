import Link from "next/link";
import { requerirSesion } from "@/lib/auth";
import { mapaDeRacks } from "@/lib/consultas";
import { semividaDias } from "@/lib/configuracion";
import { confianza, indice } from "@/lib/confiabilidad";
import { Indice } from "@/components/confiabilidad";
import { MapaDeGrupo, type Vista } from "@/components/mapa";
import { abreviaturas } from "@/lib/formato";
import { Aviso, Titulo } from "@/components/ui";

export const metadata = { title: "Racks · Racks" };
export const dynamic = "force-dynamic";

const VISTAS: Array<{ id: Vista; etiqueta: string }> = [
  { id: "contenido", etiqueta: "Qué hay" },
  { id: "confiabilidad", etiqueta: "Confiabilidad" },
];

export default async function PantallaRacks({
  searchParams,
}: {
  searchParams: Promise<{ ver?: string }>;
}) {
  await requerirSesion();
  const { ver } = await searchParams;
  const vista: Vista = ver === "confiabilidad" ? "confiabilidad" : "contenido";

  const [grupos, semivida] = await Promise.all([mapaDeRacks(), semividaDias()]);

  const celdas = grupos.flatMap((g) => g.celdas);
  const ocupadas = celdas.filter((c) => c.bulto);
  /**
   * La ocupación es sobre los lugares que SE PUEDEN usar. Un nivel al que el
   * clark no llega no es lugar libre: contarlo haría que el galpón parezca con
   * espacio cuando el autoelevador no tiene dónde dejar el palet. Lo ocupado sí
   * cuenta siempre, esté donde esté.
   */
  const activas = celdas.filter((c) => c.activa && (c.bulto || !c.fueraDeUso));
  const fueraDeUso = celdas.filter((c) => c.activa && !c.bulto && c.fueraDeUso).length;
  const ajenas = grupos.flatMap((g) =>
    g.celdas
      .filter((c) => c.bulto?.ajeno)
      .map((c) => ({ grupo: g, celda: c })),
  );
  const resumen = indice(
    ocupadas.map((c) => confianza(c.bulto!, semivida)),
  );

  // Las líneas presentes, en su orden, para el color y la leyenda.
  const lineas = [
    ...new Map(
      ocupadas.map((c) => [c.bulto!.lineaNombre, c.bulto!.lineaOrden]),
    ),
  ].sort((a, b) => a[1] - b[1]);
  const abrev = abreviaturas(lineas.map(([nombre]) => nombre));

  if (grupos.length === 0) {
    return (
      <>
        <Titulo>Racks</Titulo>
        <div className="tarjeta p-6 text-sm text-slate-600">
          Todavía no hay grupos de racks cargados. Se cargan desde{" "}
          <Link href="/admin/racks" className="font-semibold underline">
            Administración
          </Link>
          .
        </div>
      </>
    );
  }

  return (
    <>
      <Titulo detalle="Cada cuadradito es una posición. Tocala para ver qué hay.">
        Racks
      </Titulo>

      <div className="tarjeta mb-4 p-5">
        <p className="text-sm text-slate-600">
          <strong className="cifra text-slate-900">{ocupadas.length}</strong> de{" "}
          <strong className="cifra text-slate-900">{activas.length}</strong>{" "}
          posiciones ocupadas ·{" "}
          {Math.round((ocupadas.length / Math.max(activas.length, 1)) * 100)}% de
          ocupación
        </p>
        {fueraDeUso > 0 && (
          <p className="mt-1 text-xs text-slate-500">
            Sin contar {fueraDeUso} posicion{fueraDeUso === 1 ? "" : "es"} fuera de
            uso: el clark no llega, o están en la lista de exclusión.
          </p>
        )}
        <div className="mt-2 border-t border-slate-100 pt-2">
          <Indice {...resumen} />
        </div>
      </div>

      {/**
       * El recordatorio: palets de una empresa en racks de la otra. Va arriba
       * y con cada uno nombrado, porque es una lista corta de cosas para ir a
       * acomodar, no un porcentaje.
       */}
      {ajenas.length > 0 && (
        <div className="mb-4">
          <Aviso tono="advertencia">
            {ajenas.length === 1
              ? "Hay 1 bulto en un rack de otra empresa:"
              : `Hay ${ajenas.length} bultos en racks de otra empresa:`}
            <span className="mt-1 block space-y-0.5">
              {ajenas.slice(0, 12).map(({ grupo, celda }) => (
                <Link
                  key={celda.posicionId}
                  href={`/racks/${celda.posicionId}`}
                  className="block font-normal underline"
                >
                  {grupo.codigo}-{celda.codigo} · {celda.bulto!.contenido} · de{" "}
                  {celda.bulto!.empresas} en un rack de {grupo.empresa}
                </Link>
              ))}
              {ajenas.length > 12 && (
                <span className="block font-normal">y {ajenas.length - 12} más.</span>
              )}
            </span>
          </Aviso>
        </div>
      )}

      {/* Las dos vistas viven en la URL: se puede mandar un link a la vista de
          confiabilidad sin explicar cómo llegar. */}
      <nav className="mb-3 flex gap-2">
        {VISTAS.map((v) => (
          <Link
            key={v.id}
            href={`/racks?ver=${v.id}`}
            className={`rounded-xl px-4 py-2 text-sm font-semibold ${
              vista === v.id
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200"
            }`}
          >
            {v.etiqueta}
          </Link>
        ))}
      </nav>

      <Leyenda vista={vista} lineas={lineas} abrev={abrev} semivida={semivida} />

      <div className="mt-3 space-y-3">
        {grupos.map((g) => (
          <MapaDeGrupo
            key={g.id}
            grupo={g}
            vista={vista}
            semivida={semivida}
            abrev={abrev}
          />
        ))}
      </div>
    </>
  );
}

/**
 * La leyenda está siempre, no solo cuando hay dudas.
 *
 * Es lo que convierte los colores en información: sin ella el tablero es un
 * mosaico lindo. Y cada entrada lleva la misma marca que la celda -la
 * abreviatura, o el número- para que la identidad no dependa del color.
 */
function Leyenda({
  vista,
  lineas,
  abrev,
  semivida,
}: {
  vista: Vista;
  lineas: Array<[string, number]>;
  abrev: Record<string, string>;
  semivida: number;
}) {
  const fondos = [
    "bg-linea-1/15 ring-linea-1/40 text-linea-1",
    "bg-linea-2/15 ring-linea-2/40 text-linea-2",
    "bg-linea-3/15 ring-linea-3/40 text-linea-3",
  ];

  const items =
    vista === "contenido"
      ? lineas.map(([nombre, orden], i) => ({
          clave: nombre,
          clase: orden < 3 ? fondos[i] : "bg-slate-100 ring-slate-300 text-slate-500",
          marca: abrev[nombre] ?? "··",
          etiqueta: nombre,
        }))
      : [
          {
            clave: "alta",
            clase: "bg-confiable-suave ring-confiable/40 text-confiable",
            marca: "2",
            etiqueta: "chequeado hace poco",
          },
          {
            clave: "media",
            clase: "bg-dudoso-suave ring-dudoso/50 text-yellow-800",
            marca: String(semivida),
            etiqueta: "a chequear",
          },
          {
            clave: "baja",
            clase: "bg-vencido-suave ring-vencido/40 text-vencido",
            marca: String(semivida * 3),
            etiqueta: "hace mucho",
          },
          {
            clave: "sin",
            clase: "bg-sin-datos-suave ring-slate-200 text-slate-400",
            marca: "?",
            etiqueta: "nunca chequeado",
          },
        ];

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1 text-xs text-slate-600">
      {items.map((i) => (
        <span key={i.clave} className="flex items-center gap-1.5">
          <span
            className={`flex h-6 w-6 items-center justify-center rounded text-[11px] font-bold tabular-nums ring-1 ${i.clase}`}
          >
            {i.marca}
          </span>
          {i.etiqueta}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="h-6 w-6 rounded bg-white ring-1 ring-slate-200" />
        libre
      </span>
      <span className="flex items-center gap-1.5">
        <span className="fuera-de-uso flex h-6 w-6 items-center justify-center rounded text-[11px] font-bold text-slate-400 ring-1 ring-slate-300">
          ✕
        </span>
        fuera de uso (↑ el clark no llega)
      </span>
      <span className="flex items-center gap-1.5">
        <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-white">
          !
        </span>
        de otra empresa
      </span>
      {vista === "confiabilidad" && (
        /**
         * Sin esta línea, ver un "1" en amarillo parece un error de la app.
         * No lo es: la confianza es frescura × acierto, así que una posición
         * donde control viene encontrando diferencias no se pone verde por
         * haberse chequeado ayer.
         */
        <span className="text-slate-400">
          el número son los días desde el último chequeo; el color además baja
          si control ya encontró diferencias acá
        </span>
      )}
      {vista === "contenido" && (
        <span className="text-slate-400">la marca dice de qué línea es</span>
      )}
    </div>
  );
}
