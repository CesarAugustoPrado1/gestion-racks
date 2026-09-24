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
export default async function PantallaConfiabilidad() {
  await requerirRol("admin", "auditor", "control", "comercial");
  const [bultos, posiciones, semivida, piso] = await Promise.all([
    bultosConChequeo(),
    posicionesParaChequear(),
    semividaDias(),
    olvidoDias(),
  ]);

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

  const cobertura = global.medidos + global.sinDatos;
  const porcentaje = cobertura > 0 ? Math.round((global.medidos / cobertura) * 100) : 0;

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
                  de {numero(cobertura)} bultos
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

          <h2 className="mt-6 mb-1 text-base font-bold text-slate-900">
            Por línea y modelo
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
            Por rack
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
