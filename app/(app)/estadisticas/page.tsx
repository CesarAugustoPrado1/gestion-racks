import Link from "next/link";
import { requerirRol } from "@/lib/auth";
import { estadisticas } from "@/lib/estadisticas";
import {
  dias as textoDias,
  etiquetaPeriodo,
  leerPeriodo,
  porcentaje,
  PERIODOS,
} from "@/lib/estadisticas-calculo";
import { Barras, Columnas, Seccion, Tile } from "@/components/graficos";
import { ETIQUETA_MOVIMIENTO, numero } from "@/lib/formato";
import { Titulo } from "@/components/ui";

export const metadata = { title: "Estadísticas · Racks" };
export const dynamic = "force-dynamic";

const PLURAL: Record<string, string> = {
  meter: "Ingresos",
  sacar: "Egresos",
  mover: "Reubicaciones",
  ajuste: "Ajustes",
};

const corto = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

/**
 * Lo que pasó en un período, para analizar y decidir.
 *
 * Cada sección contesta una pregunta concreta:
 * - ¿Cuánto entra y cuánto sale, y cuándo?
 * - ¿Qué es lo que más se mueve, y qué está quieto?
 * - ¿Por qué sale lo que sale?
 * - ¿Cuánto tarda en salir lo que entra?
 * - ¿Cuánto nos equivocamos al registrar?
 * - ¿Quién hace qué, y a qué hora se trabaja?
 *
 * El período vive en la URL, así se puede mandar un link a "los últimos 90
 * días" sin explicar cómo llegar.
 */
export default async function PantallaEstadisticas({
  searchParams,
}: {
  searchParams: Promise<{ dias?: string }>;
}) {
  await requerirRol("admin", "auditor", "comercial", "control");
  const periodo = leerPeriodo((await searchParams).dias);
  const e = await estadisticas(periodo);

  const tipos = ["meter", "sacar", "mover", "ajuste"] as const;
  // Una sola escala para las cuatro series de días: así se comparan a ojo.
  const maximoDia = Math.max(1, ...tipos.flatMap((t) => e.porDia[t].map((d) => d.valor)));
  const ingresos = e.totales.meter ?? 0;
  const precision = porcentaje(e.control.ok + e.control.vacioOk, e.control.chequeos);
  const lineasDeModelos = [...new Set(e.modelos.map((m) => m.linea))];

  return (
    <>
      <Titulo detalle={`Lo que pasó en los ${etiquetaPeriodo(periodo)}, para analizar y decidir.`}>
        Estadísticas
      </Titulo>

      <nav className="mb-4 flex flex-wrap gap-2">
        {PERIODOS.map((p) => (
          <Link
            key={p}
            href={`/estadisticas?dias=${p}`}
            className={`rounded-xl px-4 py-2 text-sm font-semibold ${
              p === periodo ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"
            }`}
          >
            {p === 365 ? "1 año" : `${p} días`}
          </Link>
        ))}
      </nav>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tipos.map((t) => (
          <Tile
            key={t}
            etiqueta={PLURAL[t]}
            valor={numero(e.totales[t] ?? 0)}
            detalle="movimientos"
          />
        ))}
      </div>

      {ingresos > 0 && (
        <p className="mt-2 px-1 text-xs text-slate-500">
          <strong className="text-slate-700">{porcentaje(e.ingresosSinUbicar, ingresos)}%</strong> de los
          ingresos fue directo a «sin ubicar» ({numero(e.ingresosSinUbicar)} de {numero(ingresos)}). Si
          sube, falta lugar donde se lo necesita.
        </p>
      )}

      <Seccion
        titulo="Movimientos por día"
        detalle="Las cuatro con la misma escala, para poder compararlas entre sí."
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {tipos.map((t) => (
            <Columnas
              key={t}
              titulo={ETIQUETA_MOVIMIENTO[t]}
              unidad="movimientos"
              maximo={maximoDia}
              serie={e.porDia[t].map((d) => ({ clave: d.dia, valor: d.valor, etiqueta: corto(d.dia) }))}
            />
          ))}
        </div>
      </Seccion>

      <Seccion
        titulo="Entró y salió, por línea"
        detalle="En la unidad de cada línea. El ajuste es lo que control corrigió: el neto con signo, y el bruto es el tamaño del error."
      >
        {e.flujoPorLinea.length === 0 ? (
          <p className="tarjeta p-4 text-sm text-slate-500">Sin movimientos de producto en este período.</p>
        ) : (
          <div className="tarjeta overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Línea</th>
                  <th className="px-2 py-2 text-right font-medium">Ingresó</th>
                  <th className="px-2 py-2 text-right font-medium">Egresó</th>
                  <th className="px-2 py-2 text-right font-medium">Neto</th>
                  <th className="px-4 py-2 text-right font-medium">Ajuste neto / bruto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {e.flujoPorLinea.map((f) => {
                  const neto = f.ingresaron - f.egresaron;
                  return (
                    <tr key={f.linea}>
                      <td className="px-4 py-2">
                        <span className="font-semibold text-slate-900">{f.linea}</span>
                        <span className="block text-xs text-slate-400">{f.unidadPlural}</span>
                      </td>
                      <td className="cifra px-2 py-2 text-right">{numero(f.ingresaron)}</td>
                      <td className="cifra px-2 py-2 text-right">{numero(f.egresaron)}</td>
                      <td className="cifra px-2 py-2 text-right">
                        {neto > 0 ? "+" : ""}
                        {numero(neto)}
                      </td>
                      <td className="cifra px-4 py-2 text-right">
                        {f.ajusteNeto > 0 ? "+" : ""}
                        {numero(f.ajusteNeto)} / {numero(f.ajusteBruto)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Seccion>

      <Seccion
        titulo="Lo que más sale"
        detalle="Por línea, en su unidad. Al lado, lo que entró del mismo modelo en el período."
      >
        {lineasDeModelos.length === 0 ? (
          <p className="tarjeta p-4 text-sm text-slate-500">Sin ingresos ni egresos en este período.</p>
        ) : (
          <div className="space-y-3">
            {lineasDeModelos.map((linea) => {
              const suyos = e.modelos.filter((m) => m.linea === linea && m.egresaron > 0).slice(0, 8);
              const unidad = e.modelos.find((m) => m.linea === linea)!.unidadPlural;
              return (
                <div key={linea}>
                  <p className="mb-1 text-xs font-semibold text-slate-500">{linea}</p>
                  <Barras
                    vacio={`Nada de ${linea} salió en este período.`}
                    filas={suyos.map((m) => ({
                      clave: String(m.id),
                      etiqueta: m.nombre,
                      valor: m.egresaron,
                      texto: `${numero(m.egresaron)} ${unidad}`,
                      detalle: `${m.nombre}: salieron ${numero(m.egresaron)} y entraron ${numero(m.ingresaron)} ${unidad}`,
                      href: `/stock/${m.id}`,
                    }))}
                  />
                </div>
              );
            })}
          </div>
        )}
      </Seccion>

      <Seccion
        titulo="Por qué sale"
        detalle="Egresos por motivo. Los atenuados no son salidas de la fábrica (un rearmado vuelve al rack)."
      >
        <Barras
          filas={e.motivosEgreso.map((m) => ({
            clave: m.motivo,
            etiqueta: m.motivo,
            valor: m.movimientos,
            atenuada: !m.esEgreso,
            detalle: m.esEgreso ? "sale de la fábrica" : "no es una salida de la fábrica",
          }))}
        />
      </Seccion>

      <Seccion
        titulo="Cuánto tarda en salir"
        detalle="Días en el rack de lo que salió entero en el período, desde que entró. La mediana es lo típico; el promedio lo estiran los que quedan mucho."
      >
        {e.permanencia.length === 0 ? (
          <p className="tarjeta p-4 text-sm text-slate-500">Ningún bulto salió entero en este período.</p>
        ) : (
          <div className="tarjeta overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Línea</th>
                  <th className="px-2 py-2 text-right font-medium">Bultos</th>
                  <th className="px-2 py-2 text-right font-medium">Mediana</th>
                  <th className="px-4 py-2 text-right font-medium">Promedio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {e.permanencia.map((p) => (
                  <tr key={p.linea}>
                    <td className="px-4 py-2 font-semibold text-slate-900">{p.linea}</td>
                    <td className="cifra px-2 py-2 text-right">{numero(p.bultos)}</td>
                    <td className="cifra px-2 py-2 text-right">{textoDias(p.mediana)}</td>
                    <td className="cifra px-4 py-2 text-right">{textoDias(p.promedio)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Seccion>

      <Seccion
        titulo="Antigüedad del stock de hoy"
        detalle="Cuánto hace que entró cada bulto que está en stock. No depende del período elegido."
      >
        <Barras
          vacio="No hay stock."
          filas={e.antiguedad.tramos.map((t) => ({
            clave: t.tramo,
            etiqueta: t.tramo,
            valor: t.bultos,
            texto: `${numero(t.bultos)} bultos`,
          }))}
        />
        {e.antiguedad.masViejos.length > 0 && (
          <>
            <p className="mt-3 mb-1 text-xs font-semibold text-slate-500">Los diez que hace más que están</p>
            <ul className="tarjeta divide-y divide-slate-100">
              {e.antiguedad.masViejos.map((b) => (
                <li key={b.id} className="flex items-baseline justify-between gap-3 px-4 py-2 text-sm">
                  <span className="min-w-0 truncate">
                    <span className="codigo text-slate-900">{b.ubicacion ?? "sin ubicar"}</span>{" "}
                    <span className="text-slate-600">{b.contenido}</span>
                  </span>
                  <span className="shrink-0 text-xs text-slate-500">{textoDias(b.dias)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Seccion>

      <Seccion
        titulo="Control"
        detalle="Cuánto coincide lo registrado con lo que hay. Cada corrección es un error que alguien cometió antes."
      >
        <div className="grid grid-cols-3 gap-2">
          <Tile etiqueta="Chequeos" valor={numero(e.control.chequeos)} />
          <Tile
            etiqueta="Coincidían"
            valor={e.control.chequeos > 0 ? `${precision}%` : "—"}
            detalle={`${numero(e.control.ok + e.control.vacioOk)} bien`}
          />
          <Tile
            etiqueta="Corregidos"
            valor={numero(e.control.corregidos)}
            tono={e.control.corregidos > 0 ? "atencion" : "normal"}
          />
        </div>
        <div className="mt-2">
          <Columnas
            titulo="Chequeos por día"
            unidad="chequeos"
            serie={e.control.porDia.map((d) => ({ clave: d.dia, valor: d.valor, etiqueta: corto(d.dia) }))}
          />
        </div>
        {e.control.motivosAjuste.length > 0 && (
          <div className="mt-2">
            <p className="mb-1 text-xs font-semibold text-slate-500">Qué se corrigió</p>
            <Barras
              filas={e.control.motivosAjuste.map((m) => ({
                clave: m.motivo,
                etiqueta: m.motivo,
                valor: m.ajustes,
              }))}
            />
          </div>
        )}
      </Seccion>

      <Seccion titulo="A qué hora se trabaja" detalle="Movimientos por hora del día, en el período.">
        <Columnas
          titulo="Movimientos por hora"
          unidad="movimientos"
          serie={e.porHora.map((h) => ({
            clave: String(h.hora),
            valor: h.movimientos,
            etiqueta: `${String(h.hora).padStart(2, "0")} h`,
          }))}
          etiquetaX={(i) => (i % 6 === 0 ? `${String(i).padStart(2, "0")} h` : null)}
        />
      </Seccion>

      <Seccion titulo="Quién hace qué" detalle="Movimientos y chequeos por persona en el período.">
        {e.porUsuario.length === 0 ? (
          <p className="tarjeta p-4 text-sm text-slate-500">Nadie registró nada en este período.</p>
        ) : (
          <div className="tarjeta overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Persona</th>
                  <th className="px-2 py-2 text-right font-medium">Ingresos</th>
                  <th className="px-2 py-2 text-right font-medium">Egresos</th>
                  <th className="px-2 py-2 text-right font-medium">Reubic.</th>
                  <th className="px-2 py-2 text-right font-medium">Ajustes</th>
                  <th className="px-4 py-2 text-right font-medium">Chequeos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {e.porUsuario.map((u) => (
                  <tr key={u.usuario}>
                    <td className="px-4 py-2 font-semibold text-slate-900">{u.usuario}</td>
                    <td className="cifra px-2 py-2 text-right">{numero(u.ingresos)}</td>
                    <td className="cifra px-2 py-2 text-right">{numero(u.egresos)}</td>
                    <td className="cifra px-2 py-2 text-right">{numero(u.reubicaciones)}</td>
                    <td className="cifra px-2 py-2 text-right">{numero(u.ajustes)}</td>
                    <td className="cifra px-4 py-2 text-right">{numero(u.chequeos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Seccion>

      <p className="mt-6 text-sm text-slate-500">
        Para el detalle de cada movimiento, o para llevarlo a Excel:{" "}
        <Link href="/movimientos" className="font-semibold underline">
          Movimientos
        </Link>
        .
      </p>
    </>
  );
}
