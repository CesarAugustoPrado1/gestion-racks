import Link from "next/link";
import { requerirRol } from "@/lib/auth";
import { estadisticas, estadisticasDeCategoria, estadisticasDeMerma, evolucion, totales } from "@/lib/estadisticas";
import { dias as textoDias, porcentaje } from "@/lib/estadisticas-calculo";
import { Barras, Columnas, Seccion, Tile } from "@/components/graficos";
import { GraficoEvolucion } from "@/components/evolucion";
import { Delta, SelectorPeriodo } from "@/components/periodo";
import { ETIQUETA_MOVIMIENTO, enM2, m2, numero } from "@/lib/formato";
import { POR, fechaLarga, diaDe, leerRango, rangoAnterior } from "@/lib/periodos";
import { Titulo } from "@/components/ui";

export const metadata = { title: "Estadísticas · Racks" };
export const dynamic = "force-dynamic";


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
  searchParams: Promise<{ p?: string; desde?: string; hasta?: string }>;
}) {
  await requerirRol("admin", "auditor", "comercial", "control");
  const ahora = new Date();
  const rango = leerRango(await searchParams, ahora);
  const anterior = rangoAnterior(rango);
  const [e, cat, tot, ant, evo, merma] = await Promise.all([
    estadisticas(rango),
    estadisticasDeCategoria(rango),
    totales(rango.inicio, rango.fin),
    totales(anterior.inicio, anterior.fin),
    evolucion(rango),
    estadisticasDeMerma(rango, anterior),
  ]);

  const tipos = ["meter", "sacar", "mover", "ajuste"] as const;
  // Una sola escala para las cuatro series: así se comparan a ojo.
  const maximo = Math.max(1, ...tipos.flatMap((t) => e.porTramo[t].map((d) => d.valor)));
  const ingresos = e.totales.meter ?? 0;
  const precision = porcentaje(e.control.ok + e.control.vacioOk, e.control.chequeos);
  const precisionAnt = porcentaje(ant.chequeosBien, ant.chequeos);
  const lineasDeModelos = [...new Set(e.modelos.map((m) => m.linea))];
  /** Un total de m² dicho también en la unidad de cada línea, que no se suman entre sí. */
  const enCadaLinea = (filas: Array<{ unidades: number; unidadPlural: string }>) =>
    filas
      .filter((f) => f.unidades !== 0)
      .map((f) => `${numero(f.unidades)} ${f.unidadPlural}`)
      .join(" + ");
  const entraronPorLinea = enCadaLinea(
    Object.values(tot.porLinea).map((l) => ({ unidades: l.entraron, unidadPlural: l.unidadPlural })),
  );
  const salieronPorLinea = enCadaLinea(
    Object.values(tot.porLinea).map((l) => ({ unidades: l.salieron, unidadPlural: l.unidadPlural })),
  );
  const mermaPorLinea = enCadaLinea(merma.porLinea);
  const contra = anterior.etiqueta;
  const hoy = diaDe(ahora);
  // Un período en curso se muestra hasta hoy, no hasta su último día.
  const hastaVisto = rango.enCurso ? hoy : rango.hastaDia;
  const marcasHora = (i: number) => (rango.granularidad === "hora" && i % 3 === 0 ? `${String(i).padStart(2, "0")} h` : null);

  return (
    <>
      <Titulo detalle="Lo que pasó en un período: cuánto entró y salió, cómo evolucionó el stock y cómo se compara.">
        Estadísticas
      </Titulo>

      <SelectorPeriodo rango={rango} ruta="/estadisticas" />

      <p className="mt-3 text-sm text-slate-600">
        <strong className="text-slate-900">{rango.etiqueta}</strong>
        {rango.desdeDia === hastaVisto
          ? ` · ${fechaLarga(rango.desdeDia, hoy)}`
          : ` · del ${fechaLarga(rango.desdeDia, hoy)} al ${fechaLarga(hastaVisto, hoy)}`}
        {rango.enCurso && " (en curso, hasta ahora)"}. Cada número se compara con <strong>{contra}</strong>.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Tile
          etiqueta="Bultos que entraron"
          valor={numero(tot.bultosEntraron)}
          detalle={<Delta actual={tot.bultosEntraron} anterior={ant.bultosEntraron} contra={contra} />}
        />
        <Tile
          etiqueta="Bultos que salieron enteros"
          valor={numero(tot.bultosSalieron)}
          detalle={<Delta actual={tot.bultosSalieron} anterior={ant.bultosSalieron} contra={contra} />}
        />
        <Tile
          etiqueta="m² que entraron"
          valor={m2(tot.m2Entraron)}
          detalle={
            <>
              {entraronPorLinea && <span className="block">{entraronPorLinea}</span>}
              <Delta actual={Math.round(tot.m2Entraron)} anterior={Math.round(ant.m2Entraron)} contra={contra} unidad="m²" />
            </>
          }
        />
        <Tile
          etiqueta="m² que salieron"
          valor={m2(tot.m2Salieron)}
          detalle={
            <>
              {salieronPorLinea && <span className="block">{salieronPorLinea}</span>}
              <Delta actual={Math.round(tot.m2Salieron)} anterior={Math.round(ant.m2Salieron)} contra={contra} unidad="m²" />
            </>
          }
        />
        <Tile
          etiqueta="m² de merma"
          valor={m2(merma.m2)}
          detalle={
            <>
              {mermaPorLinea && <span className="block">{mermaPorLinea}</span>}
              <Delta actual={Math.round(merma.m2)} anterior={Math.round(merma.anterior.m2)} contra={contra} unidad="m²" />
            </>
          }
          tono={merma.m2 > 0 ? "atencion" : "normal"}
        />
        <Tile
          etiqueta="Egresos (enteros y parciales)"
          valor={numero(tot.movimientos.sacar ?? 0)}
          detalle={<Delta actual={tot.movimientos.sacar ?? 0} anterior={ant.movimientos.sacar ?? 0} contra={contra} />}
        />
        <Tile
          etiqueta="Reubicaciones"
          valor={numero(tot.movimientos.mover ?? 0)}
          detalle={<Delta actual={tot.movimientos.mover ?? 0} anterior={ant.movimientos.mover ?? 0} contra={contra} />}
        />
        <Tile
          etiqueta="Chequeos de control"
          valor={numero(tot.chequeos)}
          detalle={<Delta actual={tot.chequeos} anterior={ant.chequeos} contra={contra} />}
        />
        <Tile
          etiqueta="Coincidían al chequear"
          valor={tot.chequeos > 0 ? `${precision}%` : "—"}
          detalle={
            tot.chequeos > 0 && ant.chequeos > 0 ? (
              <Delta actual={precision} anterior={precisionAnt} contra={contra} unidad="puntos" />
            ) : (
              `${numero(tot.movimientos.ajuste ?? 0)} ajuste${(tot.movimientos.ajuste ?? 0) === 1 ? "" : "s"}`
            )
          }
        />
      </div>

      {ingresos > 0 && (
        <p className="mt-2 px-1 text-xs text-slate-500">
          <strong className="text-slate-700">{porcentaje(e.ingresosSinUbicar, ingresos)}%</strong> de los
          ingresos fue directo a «sin ubicar» ({numero(e.ingresosSinUbicar)} de {numero(ingresos)}). Si
          sube, falta lugar donde se lo necesita.
        </p>
      )}

      <Seccion
        titulo="Cómo evolucionó el stock"
        detalle={`Lo que había al cierre de cada ${rango.granularidad === "hora" ? "hora" : rango.granularidad === "dia" ? "día" : rango.granularidad}. Los m² y los bultos suman todas las líneas; después, un gráfico por línea en su unidad, que no se suman entre sí.`}
      >
        <div className="grid gap-2 sm:grid-cols-2">
          <GraficoEvolucion titulo="Stock en m² (todas las líneas)" unidad="m²" serie={evo.m2} />
          <GraficoEvolucion titulo="Bultos en stock" unidad="bultos" serie={evo.bultos} />
          {evo.lineas.map((l) => (
            <GraficoEvolucion key={l.linea} titulo={l.linea} unidad={l.unidadPlural} serie={l.serie} />
          ))}
        </div>
      </Seccion>

      <Seccion
        titulo={`Movimientos ${POR[rango.granularidad]}`}
        detalle="Las cuatro con la misma escala, para poder compararlas entre sí."
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {tipos.map((t) => (
            <Columnas
              key={t}
              titulo={ETIQUETA_MOVIMIENTO[t]}
              unidad="movimientos"
              maximo={maximo}
              serie={e.porTramo[t]}
              etiquetaX={rango.granularidad === "hora" ? marcasHora : undefined}
            />
          ))}
        </div>
      </Seccion>

      <Seccion
        titulo="Entró y salió, por línea"
        detalle={`En la unidad de cada línea. Debajo, en gris, lo de ${contra}. El ajuste es lo que control corrigió: el neto con signo, y el bruto es el tamaño del error.`}
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
                      <td className="cifra px-2 py-2 text-right">
                        {numero(f.ingresaron)}
                        {f.m2.ingresaron !== 0 && <span className="block whitespace-nowrap text-xs text-slate-600">{m2(f.m2.ingresaron)}</span>}
                        <span className="block text-[11px] font-normal text-slate-400">
                          antes {numero(ant.porLinea[f.linea]?.entraron ?? 0)}
                        </span>
                      </td>
                      <td className="cifra px-2 py-2 text-right">
                        {numero(f.egresaron)}
                        {f.m2.egresaron !== 0 && <span className="block whitespace-nowrap text-xs text-slate-600">{m2(f.m2.egresaron)}</span>}
                        <span className="block text-[11px] font-normal text-slate-400">
                          antes {numero(ant.porLinea[f.linea]?.salieron ?? 0)}
                        </span>
                      </td>
                      <td className="cifra px-2 py-2 text-right">
                        {neto > 0 ? "+" : ""}
                        {numero(neto)}
                        {f.m2.ingresaron - f.m2.egresaron !== 0 && (
                          <span className="block whitespace-nowrap text-xs text-slate-600">
                            {f.m2.ingresaron - f.m2.egresaron > 0 ? "+" : "−"}
                            {m2(Math.abs(f.m2.ingresaron - f.m2.egresaron))}
                          </span>
                        )}
                      </td>
                      <td className="cifra px-4 py-2 text-right">
                        {f.ajusteNeto > 0 ? "+" : ""}
                        {numero(f.ajusteNeto)} / {numero(f.ajusteBruto)}
                        {f.m2.ajusteBruto !== 0 && (
                          <span className="block whitespace-nowrap text-xs text-slate-600">
                            {f.m2.ajusteNeto > 0 ? "+" : f.m2.ajusteNeto < 0 ? "−" : ""}
                            {m2(Math.abs(f.m2.ajusteNeto))} / {m2(f.m2.ajusteBruto)}
                          </span>
                        )}
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
                      texto: `${numero(m.egresaron)} ${unidad}${m.m2PorUnidad != null ? ` · ${m2(enM2(m.egresaron, m.m2PorUnidad)!)}` : ""}`,
                      detalle: `${m.nombre}: salieron ${numero(m.egresaron)} y entraron ${numero(m.ingresaron)} ${unidad}${
                        m.m2PorUnidad != null
                          ? ` (${m2(enM2(m.egresaron, m.m2PorUnidad)!)} y ${m2(enM2(m.ingresaron, m.m2PorUnidad)!)})`
                          : ""
                      }`,
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
        titulo="Merma"
        detalle="Lo que se perdió o se arruinó en el depósito: roturas, accidentes, aves, roedores, hongos. La registra el clarkista al sacar, o control cuando la encuentra en un chequeo. Los m² cuentan solo los modelos con m² por unidad."
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile
            etiqueta="m² perdidos"
            valor={m2(merma.m2)}
            detalle={
            <>
              {mermaPorLinea && <span className="block">{mermaPorLinea}</span>}
              <Delta actual={Math.round(merma.m2)} anterior={Math.round(merma.anterior.m2)} contra={contra} unidad="m²" />
            </>
          }
          />
          <Tile
            etiqueta="Registros de merma"
            valor={numero(merma.registros)}
            detalle={<Delta actual={merma.registros} anterior={merma.anterior.registros} contra={contra} />}
          />
          <Tile
            etiqueta="Parte de lo que salió"
            valor={merma.parteDeLoQueSalio == null ? "—" : `${(merma.parteDeLoQueSalio * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`}
            detalle="de los m² que salieron del rack, fue merma"
          />
          <Tile
            etiqueta="Quién la detectó"
            valor={`${numero(merma.porOrigen.egreso)} / ${numero(merma.porOrigen.chequeo)}`}
            detalle="al sacar / en un chequeo de control"
          />
        </div>

        {merma.registros === 0 ? (
          <p className="tarjeta mt-2 p-4 text-sm text-slate-500">No se registró merma en este período.</p>
        ) : (
          <>
            <div className="mt-2">
              <Columnas
                titulo={`m² perdidos ${POR[rango.granularidad]}`}
                unidad="m²"
                serie={merma.serie.map((t) => ({ ...t, valor: Math.round(t.valor) }))}
                etiquetaX={rango.granularidad === "hora" ? marcasHora : undefined}
              />
            </div>

            <div className="tarjeta mt-2 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-slate-500">
                  <tr>
                    <th className="px-4 py-2 font-medium">Línea</th>
                    <th className="px-2 py-2 text-right font-medium">Perdido</th>
                    <th className="px-2 py-2 text-right font-medium">m²</th>
                    <th className="px-4 py-2 text-right font-medium">De lo que salió</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {merma.porLinea.map((l) => (
                    <tr key={l.linea}>
                      <td className="px-4 py-2 font-semibold text-slate-900">{l.linea}</td>
                      <td className="cifra px-2 py-2 text-right">
                        {numero(l.unidades)} <span className="text-xs text-slate-400">{l.unidadPlural}</span>
                      </td>
                      <td className="cifra px-2 py-2 text-right">{m2(l.m2)}</td>
                      <td className="cifra px-4 py-2 text-right">{porcentaje(l.unidades, l.salieron)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-3 mb-1 text-xs font-semibold text-slate-500">Por qué se perdió</p>
            <Barras
              filas={merma.porMotivo.map((x) => ({
                clave: x.motivo,
                etiqueta: x.motivo,
                valor: Math.max(x.m2, 0.001),
                texto: `${m2(x.m2)} · ${x.registros} ${x.registros === 1 ? "vez" : "veces"}`,
                subtexto: x.unidades,
              }))}
            />

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-semibold text-slate-500">Dónde pasó, por grupo</p>
                <Barras
                  filas={merma.porGrupo.map((x) => ({
                    clave: x.grupo,
                    etiqueta: x.grupo === "Sin ubicar" ? x.grupo : `Grupo ${x.grupo}`,
                    valor: Math.max(x.m2, 0.001),
                    texto: `${m2(x.m2)} · ${x.registros}`,
                    subtexto: x.unidades,
                  }))}
                />
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold text-slate-500">Las posiciones donde más se repite</p>
                <Barras
                  vacio="Ninguna posición se repite."
                  filas={merma.porPosicion.map((x) => ({
                    clave: x.posicion,
                    etiqueta: <span className="codigo">{x.posicion}</span>,
                    valor: x.registros,
                    texto: `${x.registros} ${x.registros === 1 ? "vez" : "veces"} · ${m2(x.m2)}`,
                    subtexto: x.unidades,
                  }))}
                />
              </div>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Si la merma se concentra en un lugar -por ejemplo aves o roedores-, conviene revisar ese sector.
            </p>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-semibold text-slate-500">Qué modelos</p>
                <Barras
                  filas={merma.porModelo.slice(0, 8).map((x) => ({
                    clave: String(x.id),
                    etiqueta: (
                      <>
                        {x.modelo} <span className="text-slate-400">· {x.linea}</span>
                      </>
                    ),
                    valor: x.unidades,
                    texto: `${numero(x.unidades)} ${x.unidadPlural} · ${m2(x.m2)}`,
                  }))}
                />
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold text-slate-500">Quién la registró</p>
                <Barras
                  filas={merma.porUsuario.map((x) => ({
                    clave: x.usuario,
                    etiqueta: x.usuario,
                    valor: x.registros,
                    texto: `${x.registros} · ${m2(x.m2)}`,
                    subtexto: x.unidades,
                  }))}
                />
              </div>
            </div>

            <p className="mt-3 mb-1 text-xs font-semibold text-slate-500">Uno por uno</p>
            <ul className="tarjeta divide-y divide-slate-100">
              {merma.ultimos.map((u, i) => (
                <li key={i} className="px-4 py-2.5 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="codigo text-slate-900">{u.bultoCodigo}</span>
                    {u.posicion && <span className="codigo text-xs text-slate-500">{u.posicion}</span>}
                    <span className="chip bg-red-100 text-red-800">{u.motivo}</span>
                    {u.tipo !== "sacar" && <span className="chip bg-dudoso-suave text-yellow-800">encontrada por control</span>}
                  </div>
                  <p className="mt-0.5 text-slate-600">{u.contenido}</p>
                  {u.nota && <p className="text-xs text-slate-500 italic">{u.nota}</p>}
                  <p className="text-xs text-slate-400">
                    {u.usuario} ·{" "}
                    {u.creadoEn.toLocaleString("es-AR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "America/Argentina/Buenos_Aires",
                    })}
                  </p>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-slate-500">
              El detalle completo, filtrable y para Excel:{" "}
              <Link href="/movimientos?tipo=merma" className="font-semibold underline">
                Movimientos → Merma
              </Link>
              .
            </p>
          </>
        )}
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
            titulo={`Chequeos ${POR[rango.granularidad]}`}
            unidad="chequeos"
            serie={e.control.porTramo}
            etiquetaX={rango.granularidad === "hora" ? marcasHora : undefined}
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

      <Seccion
        titulo="Primera y segunda"
        detalle="Los cambios de categoría del período. Un pasaje es una decisión (se detectó después que era de la otra); una corrección de control es un error de registro."
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile etiqueta="Pasajes a segunda" valor={numero(cat.pasajes.aSegunda)} />
          <Tile etiqueta="Pasajes a primera" valor={numero(cat.pasajes.aPrimera)} />
          <Tile
            etiqueta="Correcciones de control"
            valor={numero(cat.correcciones.aSegunda + cat.correcciones.aPrimera)}
            detalle={`${numero(cat.correcciones.aSegunda)} a 2da · ${numero(cat.correcciones.aPrimera)} a 1ra`}
            tono={cat.correcciones.aSegunda + cat.correcciones.aPrimera > 0 ? "atencion" : "normal"}
          />
          <Tile
            etiqueta="Hoy de segunda"
            valor={numero(cat.stockSegunda.reduce((s2, l) => s2 + l.bultos, 0))}
            detalle={
              cat.stockSegunda.length === 0
                ? "nada"
                : `${cat.stockSegunda.map((l) => `${numero(l.unidades)} ${l.unidadPlural}`).join(" + ")} · ${m2(
                    cat.stockSegunda.reduce((s2, l) => s2 + l.m2, 0),
                  )}`
            }
          />
        </div>

        {cat.aSegundaPorLinea.length > 0 && (
          <div className="mt-2">
            <p className="mb-1 text-xs font-semibold text-slate-500">Lo que pasó a segunda en el período</p>
            <Barras
              filas={cat.aSegundaPorLinea.map((l) => ({
                clave: l.linea,
                etiqueta: l.linea,
                valor: l.bultos,
                texto: `${numero(l.unidades)} ${l.unidadPlural}${l.m2 ? ` · ${m2(l.m2)}` : ""} · ${l.bultos} bulto${l.bultos === 1 ? "" : "s"}`,
              }))}
            />
          </div>
        )}

        {cat.porUsuario.length > 0 && (
          <div className="tarjeta mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Persona</th>
                  <th className="px-2 py-2 text-right font-medium">Pasajes</th>
                  <th className="px-4 py-2 text-right font-medium">Correcciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cat.porUsuario.map((u) => (
                  <tr key={u.usuario}>
                    <td className="px-4 py-2 font-semibold text-slate-900">{u.usuario}</td>
                    <td className="cifra px-2 py-2 text-right">{numero(u.pasajes)}</td>
                    <td className="cifra px-4 py-2 text-right">{numero(u.correcciones)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {cat.ultimos.length === 0 ? (
          <p className="tarjeta mt-2 p-4 text-sm text-slate-500">No hubo cambios de categoría en este período.</p>
        ) : (
          <div className="mt-2">
            <p className="mb-1 text-xs font-semibold text-slate-500">Uno por uno</p>
            <ul className="tarjeta divide-y divide-slate-100">
              {cat.ultimos.map((c, i) => (
                <li key={i} className="px-4 py-2.5 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="codigo text-slate-900">{c.bultoCodigo}</span>
                    <span className="chip bg-orange-100 text-orange-900">
                      {c.desde} → {c.hasta}
                    </span>
                    <span className={`chip ${c.tipo === "ajuste" ? "bg-dudoso-suave text-yellow-800" : "bg-slate-100 text-slate-600"}`}>
                      {c.tipo === "ajuste" ? "corrección de control" : "pasaje"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-slate-600">{c.contenido}</p>
                  {c.porQue && <p className="text-xs text-slate-500 italic">{c.porQue}</p>}
                  <p className="text-xs text-slate-400">
                    {c.usuario} ·{" "}
                    {c.creadoEn.toLocaleString("es-AR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "America/Argentina/Buenos_Aires",
                    })}
                  </p>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-slate-500">
              El detalle completo, filtrable y para Excel:{" "}
              <Link href="/movimientos?tipo=cambio_categoria" className="font-semibold underline">
                Movimientos → todo cambio de categoría
              </Link>
              .
            </p>
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
        Las curvas de confiabilidad -general, por grupo, altura, tipo, modelo y posición- están en{" "}
        <Link href={
            rango.id === "rango"
              ? `/confiabilidad?desde=${rango.desdeDia}&hasta=${rango.hastaDia}`
              : `/confiabilidad?p=${rango.id}`
          } className="font-semibold underline">
          Confiabilidad
        </Link>
        . La antigüedad del stock y la foto de cualquier día están en{" "}
        <Link href="/resumen" className="font-semibold underline">
          Resumen
        </Link>
        . Para el detalle de cada movimiento, o para llevarlo a Excel:{" "}
        <Link href="/movimientos" className="font-semibold underline">
          Movimientos
        </Link>
        .
      </p>
    </>
  );
}
