import Link from "next/link";
import { requerirRol } from "@/lib/auth";
import { bultosConChequeo, posicionesParaChequear } from "@/lib/consultas";
import { olvidoDias, semividaDias } from "@/lib/configuracion";
import {
  agruparIndices,
  confianza,
  estaOlvidada,
  etiquetaDeEstado,
  indice,
} from "@/lib/confiabilidad";
import { FilaDeIndice } from "@/components/confiabilidad";
import { numero } from "@/lib/formato";
import { describirPosicion } from "@/lib/posiciones";
import { Titulo } from "@/components/ui";
import { curvas } from "@/lib/curvas";
import { leerRango, POR } from "@/lib/periodos";
import { SelectorPeriodo } from "@/components/periodo";
import { GraficoConfianza } from "@/components/evolucion";
import type { Indice, PuntoDeCurva } from "@/lib/confianza-historia";

export const metadata = { title: "Confiabilidad · Racks" };
export const dynamic = "force-dynamic";

/** Cuántas olvidadas se listan. Más que esto deja de ser una lista y es un censo. */
const CUANTAS_OLVIDADAS = 12;

/**
 * El índice abierto: la pantalla que contesta "¿de qué me puedo fiar?".
 *
 * UNA SOLA DEFINICIÓN DEL NÚMERO. El promedio es el mismo `indice()` que usan el
 * tablero y la recorrida, sobre las mismas `confianza()`. Se consideró agregar
 * acá una variante ponderada por cantidad -un palet de 60 mal cargado duele más
 * que uno de 4- y se descartó: serían dos números con el mismo nombre en dos
 * pantallas distintas, y el día que difieran nadie va a saber cuál creer. La
 * cantidad sí pesa, pero donde corresponde: en el orden de la recorrida, que
 * multiplica por unidades, y en el ranking de abajo.
 */
export default async function PantallaConfiabilidad({
  searchParams,
}: {
  searchParams: Promise<{ p?: string; desde?: string; hasta?: string; modelo?: string; posicion?: string }>;
}) {
  await requerirRol("admin", "auditor", "control", "comercial");
  const q = await searchParams;
  const rango = leerRango(q, new Date());
  const [bultos, posiciones, semivida, piso, curva] = await Promise.all([
    bultosConChequeo(),
    posicionesParaChequear(),
    semividaDias(),
    olvidoDias(),
    curvas(rango, q.posicion ?? null),
  ]);

  // Una curva a partir de los puntos: el índice de cada tramo, o nada.
  const serie = (de: (p: PuntoDeCurva) => Indice | undefined) =>
    curva.puntos.map((p) => {
      const i = de(p);
      return { clave: p.clave, etiqueta: p.etiqueta, valor: i?.valor ?? null, medidos: i?.medidos ?? 0, sinDatos: i?.sinDatos ?? 0 };
    });
  const cobertura = curva.puntos.map((p) => {
    const total = p.general.medidos + p.general.sinDatos;
    return { clave: p.clave, etiqueta: p.etiqueta, valor: total > 0 ? p.general.medidos / total : null };
  });
  const tiene = (de: (p: PuntoDeCurva) => Indice | undefined) =>
    curva.puntos.some((p) => (de(p)?.medidos ?? 0) + (de(p)?.sinDatos ?? 0) > 0);
  const modelosConDato = curva.modelos.filter((m) => tiene((p) => p.porModelo[m.id]));
  const modeloElegido = modelosConDato.find((m) => String(m.id) === q.modelo) ?? modelosConDato[0] ?? null;
  const ultimo = curva.puntos[curva.puntos.length - 1];
  const linkCon = (extra: Record<string, string>) => {
    const u = new URLSearchParams();
    if (q.desde && q.hasta) {
      u.set("desde", q.desde);
      u.set("hasta", q.hasta);
    } else u.set("p", rango.id);
    if (q.posicion) u.set("posicion", q.posicion);
    if (q.modelo) u.set("modelo", q.modelo);
    for (const [k, v] of Object.entries(extra)) u.set(k, v);
    return `/confiabilidad?${u.toString()}`;
  };

  const conConfianza = <T extends { chequeadoEn: Date | null; chequeosOk: number; chequeosTotal: number }>(
    filas: T[],
  ) => filas.map((f) => ({ fila: f, c: confianza(f, semivida) }));

  const global = indice(conConfianza(bultos).map((x) => x.c));

  const agrupar = <T extends { chequeadoEn: Date | null; chequeosOk: number; chequeosTotal: number }>(
    filas: T[],
    clave: (f: T) => string,
  ) => agruparIndices(filas, clave, (f) => confianza(f, semivida));

  // Por línea, y adentro por modelo. Las líneas conservan el orden de la base.
  const lineas = [...new Set(bultos.map((b) => b.linea))];
  const porLinea = lineas.map((l) => {
    const suyos = bultos.filter((b) => b.linea === l);
    return {
      linea: l,
      total: indice(conConfianza(suyos).map((x) => x.c)),
      modelos: agrupar(suyos, (b) => b.modelo),
    };
  });

  const porRack = agrupar(posiciones, (p) => p.rack);

  const olvidadas = posiciones
    .map((p) => ({
      ...p,
      c: confianza(p, semivida),
      olvidada: estaOlvidada({ chequeadoEn: p.chequeadoEn, unidades: p.unidades }, piso),
    }))
    .filter((p) => p.unidades > 0)
    .sort((a, b) => (1 - (b.c?.valor ?? 0)) * b.unidades - (1 - (a.c?.valor ?? 0)) * a.unidades)
    .slice(0, CUANTAS_OLVIDADAS);

  /**
   * La vara para leer los porcentajes. Se calcula con la misma `confianza()`
   * en vez de escribir "50%" a mano: un número fijo en un texto explicativo se
   * desfasa el día que cambie la fórmula y nadie se entera, porque los textos
   * no tienen tests.
   */
  const vara = confianza(
    {
      chequeadoEn: new Date(Date.now() - semivida * 86400000),
      chequeosOk: 10,
      chequeosTotal: 10,
    },
    semivida,
  )!;

  const totalBultos = global.medidos + global.sinDatos;
  const porcentaje = totalBultos > 0 ? Math.round((global.medidos / totalBultos) * 100) : 0;

  return (
    <>
      <Titulo detalle="De qué se puede fiar el dato, y sobre todo dónde no.">
        Confiabilidad
      </Titulo>

      {bultos.length === 0 ? (
        <div className="tarjeta p-6 text-sm text-slate-600">
          Todavía no hay stock cargado, así que no hay nada de lo que fiarse ni
          de lo que desconfiar.
        </div>
      ) : (
        <>
          {/**
           * El número que encabeza. Va en cifras proporcionales y no tabulares:
           * `tabular-nums` le da a cada dígito el ancho de un cero y a 48px un
           * "68%" queda suelto. Las tabulares se reservan para columnas.
           */}
          <div className="tarjeta p-6">
            <p className="text-sm text-slate-500">Confiabilidad del stock</p>
            <p className="mt-1 text-5xl font-bold text-slate-900">
              {global.valor == null ? "—" : `${Math.round(global.valor * 100)}%`}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              sobre{" "}
              <strong className="cifra text-slate-900">{numero(global.medidos)}</strong>{" "}
              bulto{global.medidos === 1 ? "" : "s"} que control miró alguna vez.
            </p>

            {/**
             * La cobertura es el dato que el promedio esconde, así que va al
             * lado y no en una pestaña: un 90% sobre un tercio del galpón no es
             * un 90% del galpón.
             */}
            <div className="mt-4 border-t border-slate-100 pt-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-slate-900">
                  Cuánto se miró alguna vez
                </span>
                <span className="text-sm text-slate-500">
                  <span className="cifra font-semibold text-slate-900">
                    {porcentaje}%
                  </span>{" "}
                  de {numero(totalBultos)} bultos
                </span>
              </div>
              <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-sin-datos-suave">
                <div
                  className="h-full rounded-full bg-slate-700"
                  style={{ width: `${Math.max(porcentaje, 2)}%` }}
                />
              </div>
              {global.sinDatos > 0 && (
                <p className="mt-1 text-xs text-slate-500">
                  {numero(global.sinDatos)} nunca se chequearon. No cuentan como
                  malos: cuentan como desconocidos, y por eso quedan fuera del
                  promedio de arriba en vez de hundirlo.
                </p>
              )}
            </div>
          </div>

          {/* ------------------------------------------------------------ */}
          {/* Curvas: cómo evolucionó                                      */}
          {/* ------------------------------------------------------------ */}
          <h2 className="mt-6 mb-1 text-base font-bold text-slate-900">Cómo evolucionó</h2>
          <p className="mb-2 text-sm text-slate-600">
            La confiabilidad al cierre de cada {rango.granularidad === "hora" ? "hora" : rango.granularidad === "dia" ? "día" : rango.granularidad}
            , rearmada con el historial de chequeos y movimientos. Todas las curvas van de 0 a 100 %: se pueden comparar a
            ojo.
          </p>
          <SelectorPeriodo rango={rango} ruta="/confiabilidad" />

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <GraficoConfianza titulo="Confiabilidad general" serie={serie((p) => p.general)} />
            <GraficoConfianza
              titulo="Cuánto se miró alguna vez"
              serie={cobertura}
              detalle="Bultos con al menos un chequeo, sobre todo el stock."
            />
          </div>

          <h3 className="mt-5 mb-1 text-sm font-bold text-slate-900">Por grupo de racks</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {curva.grupos
              .filter((g) => tiene((p) => p.porGrupo[g]))
              .map((g) => (
                <GraficoConfianza key={g} titulo={`Grupo ${g}`} serie={serie((p) => p.porGrupo[g])} />
              ))}
          </div>

          <h3 className="mt-5 mb-1 text-sm font-bold text-slate-900">Por altura</h3>
          <p className="mb-2 text-xs text-slate-500">
            Si los niveles de arriba se chequean menos, acá se ve: cuesta más mirarlos.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {curva.niveles
              .filter((n) => tiene((p) => p.porNivel[n]))
              .map((n) => (
                <GraficoConfianza key={n} titulo={n} serie={serie((p) => p.porNivel[n])} />
              ))}
          </div>

          <h3 className="mt-5 mb-1 text-sm font-bold text-slate-900">Por tipo de mercadería</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {curva.lineas
              .filter((l) => tiene((p) => p.porLinea[l]))
              .map((l) => (
                <GraficoConfianza key={l} titulo={l} serie={serie((p) => p.porLinea[l])} />
              ))}
          </div>

          <h3 className="mt-5 mb-1 text-sm font-bold text-slate-900">Por modelo</h3>
          {modelosConDato.length === 0 ? (
            <p className="tarjeta p-4 text-sm text-slate-500">Ningún modelo tuvo stock en este período.</p>
          ) : (
            <>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {modelosConDato.map((m) => (
                  <Link
                    key={m.id}
                    href={linkCon({ modelo: String(m.id) })}
                    scroll={false}
                    className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
                      modeloElegido?.id === m.id
                        ? "bg-slate-900 text-white"
                        : "bg-white text-slate-700 ring-1 ring-slate-300"
                    }`}
                  >
                    {m.nombre}
                  </Link>
                ))}
              </div>
              {modeloElegido && (
                <GraficoConfianza
                  titulo={`${modeloElegido.nombre} · ${modeloElegido.linea}`}
                  serie={serie((p) => p.porModelo[modeloElegido.id])}
                />
              )}
              <div className="tarjeta mt-2 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-slate-500">
                    <tr>
                      <th className="px-4 py-2 font-medium">Modelo</th>
                      <th className="px-2 py-2 text-right font-medium">Primer dato</th>
                      <th className="px-2 py-2 text-right font-medium">Al final</th>
                      <th className="px-4 py-2 text-right font-medium">Cambio</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {modelosConDato.map((m) => {
                      // El primer tramo del período con dato: un modelo puede no haber tenido stock al empezar.
                      const a = curva.puntos.map((p) => p.porModelo[m.id]?.valor ?? null).find((v) => v != null) ?? null;
                      const b = ultimo?.porModelo[m.id]?.valor ?? null;
                      const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)} %`);
                      const cambio = a != null && b != null ? Math.round((b - a) * 100) : null;
                      return (
                        <tr key={m.id}>
                          <td className="px-4 py-2">
                            <Link href={linkCon({ modelo: String(m.id) })} scroll={false} className="font-semibold text-slate-900 hover:underline">
                              {m.nombre}
                            </Link>
                            <span className="block text-xs text-slate-500">{m.linea}</span>
                          </td>
                          <td className="cifra px-2 py-2 text-right">{pct(a)}</td>
                          <td className="cifra px-2 py-2 text-right">{pct(b)}</td>
                          <td className="cifra px-4 py-2 text-right">
                            {cambio == null ? "—" : cambio === 0 ? "=" : `${cambio > 0 ? "+" : "−"}${Math.abs(cambio)}`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <h3 className="mt-5 mb-1 text-sm font-bold text-slate-900">Por posición</h3>
          <p className="mb-2 text-xs text-slate-500">
            La de la posición: cuenta también los chequeos de cuando estaba vacía, y se borra cuando entra o sale algo.
          </p>
          <form action="/confiabilidad" className="mb-2 flex flex-wrap items-end gap-2">
            {q.desde && q.hasta ? (
              <>
                <input type="hidden" name="desde" value={q.desde} />
                <input type="hidden" name="hasta" value={q.hasta} />
              </>
            ) : (
              <input type="hidden" name="p" value={rango.id} />
            )}
            {q.modelo && <input type="hidden" name="modelo" value={q.modelo} />}
            <label className="text-xs text-slate-500">
              Código de la posición
              <input
                name="posicion"
                list="codigos-de-posicion"
                defaultValue={q.posicion ?? ""}
                placeholder="B-07-2-1"
                className="campo mt-0.5 py-2 uppercase"
                autoComplete="off"
              />
            </label>
            <datalist id="codigos-de-posicion">
              {curva.posiciones.map((p) => (
                <option key={p.id} value={p.codigo} />
              ))}
            </datalist>
            <button type="submit" className="boton-secundario h-11">
              Ver curva
            </button>
          </form>
          {q.posicion && !curva.posicionPedida && (
            <p className="tarjeta p-4 text-sm text-amber-800">No hay ninguna posición «{q.posicion}».</p>
          )}
          {curva.posicionPedida && (
            <GraficoConfianza
              titulo={`Posición ${curva.posicionPedida.codigo}`}
              serie={curva.puntos.map((p) => ({ clave: p.clave, etiqueta: p.etiqueta, valor: p.posicion }))}
              detalle={`Confiabilidad de la posición ${POR[rango.granularidad]}.`}
            />
          )}

          <p className="mt-3 text-xs text-slate-500">
            Curvas rearmadas con la historia: cada chequeo verifica lo que había en la posición, cada movimiento lo
            borra y la carga inicial deja el bulto verificado. El «Está» de la carga inicial sobre un palet que ya estaba
            cargado no deja registro, así que en esos casos la curva del pasado queda un poco más baja que lo que fue.
          </p>

          <h2 className="mt-8 mb-1 text-base font-bold text-slate-900">
            Hoy, por línea y modelo
          </h2>
          <p className="mb-2 text-sm text-slate-600">
            Para leerlos: un bulto chequeado hace {semivida} días que siempre dio
            bien da <strong className="cifra">{Math.round(vara.valor * 100)}%</strong>.
            Más alto es más reciente o con mejor historial; más bajo, al revés.
          </p>
          <div className="space-y-3">
            {porLinea.map((l) => (
              <div key={l.linea} className="tarjeta p-5">
                <FilaDeIndice
                  nombre={l.linea}
                  valor={l.total.valor}
                  sinDatos={l.total.sinDatos}
                  cuantosSinDatos="bultos sin chequear nunca"
                />
                <div className="mt-2 divide-y divide-slate-100 border-t border-slate-100 pt-1 pl-3">
                  {l.modelos.map((m) => (
                    <FilaDeIndice
                      key={m.clave}
                      nombre={m.clave}
                      valor={m.valor}
                      sinDatos={m.sinDatos}
                      cuantosSinDatos="bultos sin chequear nunca"
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          <h2 className="mt-6 mb-2 text-base font-bold text-slate-900">
            Hoy, por rack
          </h2>
          <div className="tarjeta divide-y divide-slate-100 p-5">
            {porRack.map((r) => (
              <FilaDeIndice
                key={r.clave}
                nombre={`Rack ${r.clave}`}
                valor={r.valor}
                sinDatos={r.sinDatos}
                cuantosSinDatos="posiciones sin chequear nunca"
              />
            ))}
          </div>

          <h2 className="mt-6 mb-1 text-base font-bold text-slate-900">
            Lo que más conviene ir a mirar
          </h2>
          <p className="mb-2 text-sm text-slate-600">
            Ordenado por lo que hace más que no se mira <em>y</em> más producto
            tiene. Es el mismo orden con el que abre la recorrida.
          </p>
          {olvidadas.length === 0 ? (
            <div className="tarjeta p-5 text-sm text-slate-600">
              No hay posiciones con producto: nada que recorrer.
            </div>
          ) : (
            <ul className="space-y-2">
              {olvidadas.map((p, i) => (
                <li key={p.id}>
                  <Link
                    href={`/racks/${p.id}`}
                    className="tarjeta flex items-center gap-3 p-4 transition active:scale-[0.99] hover:ring-slate-300"
                  >
                    <span className="cifra w-6 shrink-0 text-sm text-slate-400">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="codigo text-sm text-slate-900">
                          {p.codigo}
                        </span>
                        <span className="text-xs text-slate-500">
                          {describirPosicion(p).split(" · ")[1]}
                        </span>
                        {p.olvidada && (
                          <span className="chip bg-vencido-suave text-vencido">
                            olvidada
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-sm text-slate-600">
                        {p.contenido ??
                          (p.invasor
                            ? `La ocupa ${p.invasor}, que sobresale desde abajo`
                            : "Vacía")}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {etiquetaDeEstado(p, p.c)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="cifra text-lg text-slate-900">
                        {numero(p.unidades)}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {p.unidadPlural}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-6 text-xs text-slate-500">
            Un chequeo vale la mitad a los {semivida} días, y una posición donde
            control viene encontrando diferencias baja aunque se haya mirado
            ayer. Los que nunca se chequearon no promedian: se cuentan aparte,
            porque no saber no es lo mismo que estar mal.
          </p>
        </>
      )}
    </>
  );
}
