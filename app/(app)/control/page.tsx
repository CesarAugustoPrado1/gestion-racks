import Link from "next/link";
import { requerirRol } from "@/lib/auth";
import { gruposEnCarga, modelosParaCargar, motivosDeAjuste, posicionesParaChequear } from "@/lib/consultas";
import { olvidoDias, semividaDias } from "@/lib/configuracion";
import {
  confianza,
  estaOlvidada,
  etiquetaDeEstado,
  indice,
  nivel,
  ordenarRecorrida,
} from "@/lib/confiabilidad";
import { Indice } from "@/components/confiabilidad";
import { describirPosicion } from "@/lib/posiciones";
import { Titulo } from "@/components/ui";
import { Recorrida, type FilaDeRecorrida } from "./recorrida";

export const metadata = { title: "Control · Racks" };
export const dynamic = "force-dynamic";

type Orden = "urgencia" | "ubicacion";

export default async function PantallaControl({
  searchParams,
}: {
  searchParams: Promise<{ orden?: string; grupo?: string }>;
}) {
  const sesion = await requerirRol("control", "admin");
  const q = await searchParams;
  const orden: Orden = q.orden === "ubicacion" ? "ubicacion" : "urgencia";
  const [todas, semivida, piso, enCarga, motivos, modelos] = await Promise.all([
    posicionesParaChequear(),
    semividaDias(),
    olvidoDias(),
    gruposEnCarga(),
    motivosDeAjuste(),
    modelosParaCargar(),
  ]);

  // Los grupos en carga inicial se recorren desde su carga, no desde acá.
  const codigosEnCarga = new Set(enCarga.map((g) => g.codigo));
  const posiciones = todas.filter((p) => !codigosEnCarga.has(p.rack));

  const conDatos = posiciones.map((p) => {
    const c = confianza(p, semivida);
    return {
      ...p,
      confianza: c,
      /**
       * La urgencia: lo que hace más que no se mira Y más producto tiene.
       *
       * Es lo que convierte el índice en el plan del día. Una posición vacía
       * cuenta como 1 para que no desaparezca del final de la lista:
       * confirmar un vacío también es información.
       */
      urgencia: (1 - (c?.valor ?? 0)) * Math.max(p.unidades, 1),
      /**
       * Y el piso: lo que hace mucho que nadie mira sube igual, por chico que
       * sea. Sin esto una posición chica puede quedar debajo de una grande para
       * siempre, no mucho tiempo: siempre. Ver `estaOlvidada`.
       */
      olvidada: estaOlvidada(
        { chequeadoEn: p.chequeadoEn, unidades: p.unidades },
        piso,
      ),
    };
  });

  const porUrgencia = ordenarRecorrida(conDatos);
  const olvidadas = porUrgencia.filter((p) => p.olvidada).length;
  const resumen = indice(porUrgencia.map((p) => p.confianza));

  // Los grupos para filtrar, y el elegido si existe.
  const grupos = [...new Set(porUrgencia.map((p) => p.rack))].sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
  const grupo = q.grupo && grupos.includes(q.grupo) ? q.grupo : null;

  /**
   * Por ubicación: el orden en que se camina el pasillo. El código ya lo trae
   * -grupo, calle o columna con dos cifras, nivel, profundidad-, así que basta
   * ordenarlo como texto con los números como números.
   */
  const elegidas = (
    orden === "ubicacion"
      ? [...porUrgencia].sort((a, b) => a.codigo.localeCompare(b.codigo, "es", { numeric: true }))
      : porUrgencia
  ).filter((p) => !grupo || p.rack === grupo);

  const filas: FilaDeRecorrida[] = elegidas.map((p) => ({
    id: p.id,
    codigo: p.codigo,
    rack: p.rack,
    donde: describirPosicion(p).split(" · ")[1] ?? "",
    contenido:
      p.contenido ??
      (p.invasor ? `La ocupa ${p.invasor}, que sobresale desde abajo` : "El sistema dice que está vacía"),
    unidades: p.unidades,
    unidadPlural: p.unidadPlural,
    estado: etiquetaDeEstado(p, p.confianza),
    nivel: nivel(p.confianza),
    olvidada: p.olvidada,
    fueraDeUso: p.fueraDeUso,
  }));

  const enlace = (o: Orden, g: string | null) => {
    const params = new URLSearchParams();
    if (o !== "urgencia") params.set("orden", o);
    if (g) params.set("grupo", g);
    const t = params.toString();
    return t ? `/control?${t}` : "/control";
  };
  const chip = (activo: boolean) =>
    `rounded-full px-3 py-1.5 text-sm font-medium ${activo ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`;

  return (
    <>
      <Titulo detalle={`${sesion.nombre} · ${orden === "urgencia" ? "primero lo que hace más que no se mira" : "en el orden del rack"}`}>
        Recorrida
      </Titulo>

      {enCarga.length > 0 && (
        <ul className="mb-4 space-y-2">
          {enCarga.map((g) => (
            <li key={g.id}>
              <Link
                href={`/control/carga/${g.id}`}
                className="flex items-center gap-3 rounded-2xl bg-sky-50 p-4 ring-1 ring-sky-200 transition active:scale-[0.99]"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-sky-950">
                    Carga inicial · grupo {g.codigo}
                  </p>
                  <p className="text-xs text-sky-900">
                    {g.relevadas} de {g.total} posiciones relevadas
                  </p>
                </div>
                <span className="text-sm font-semibold text-sky-900">Seguir →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="tarjeta mb-4 p-5">
        <Indice {...resumen} />
        <p className="mt-2 text-xs text-slate-500">
          Un chequeo vale la mitad a los {semivida} días. Si lo que dice el
          renglón coincide con lo que ves, <strong>OK</strong>; si no,{" "}
          <strong>Corregir</strong> y se abre ahí mismo.
        </p>
        {olvidadas > 0 && (
          <p className="mt-1 text-xs text-slate-500">
            <strong className="text-slate-700">
              {olvidadas} {olvidadas === 1 ? "posición va" : "posiciones van"}{" "}
              primero por olvidada{olvidadas === 1 ? "" : "s"}
            </strong>
            : hace más de {piso} días que nadie las mira, así que suben por más
            chicas que sean.
          </p>
        )}
      </div>

      <div className="mb-3 space-y-2">
        <div className="flex gap-2">
          <Link href={enlace("urgencia", grupo)} replace scroll={false} className={chip(orden === "urgencia")}>
            Urgencia
          </Link>
          <Link href={enlace("ubicacion", grupo)} replace scroll={false} className={chip(orden === "ubicacion")}>
            Por ubicación
          </Link>
        </div>
        {grupos.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            <Link href={enlace(orden, null)} replace scroll={false} className={chip(!grupo)}>
              Todos
            </Link>
            {grupos.map((g) => (
              <Link key={g} href={enlace(orden, g)} replace scroll={false} className={chip(grupo === g)}>
                {g}
              </Link>
            ))}
          </div>
        )}
        <p className="px-1 text-xs text-slate-500">
          {orden === "urgencia"
            ? "Primero lo que hace más que no se mira y más producto tiene."
            : "En el orden del rack: grupo, calle o columna, nivel y profundidad. Para recorrer un pasillo de corrido."}
        </p>
      </div>

      {/* La clave hace que al cambiar el orden o el grupo la lista arranque de nuevo. */}
      <Recorrida key={`${orden}-${grupo ?? ""}`} filas={filas} motivos={motivos} modelos={modelos} />

      {conDatos.length === 0 && (
        <div className="tarjeta p-6 text-sm text-slate-600">
          No hay posiciones cargadas todavía.
        </div>
      )}
    </>
  );
}
