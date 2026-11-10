import Link from "next/link";
import { requerirSesion } from "@/lib/auth";
import { fotoEn, type Foto } from "@/lib/foto";
import { estadoDeFotos, fotoGuardada, tomarFoto, type FotoGuardada } from "@/lib/fotos-diarias";
import { tablero } from "@/lib/tablero";
import { bultosConChequeo } from "@/lib/consultas";
import { semividaDias } from "@/lib/configuracion";
import { confianza, indice } from "@/lib/confiabilidad";
import { Indice } from "@/components/confiabilidad";
import { BarraPosiciones, Barras, LeyendaPosiciones, Seccion, Tile } from "@/components/graficos";
import { Delta, SelectorMomento } from "@/components/periodo";
import { dias, porcentaje } from "@/lib/estadisticas-calculo";
import { ETIQUETA_PACKAGING, PACKAGINGS, m2, numero } from "@/lib/formato";
import { diaDe, fechaLarga, leerMomento, sumarDias, type Momento } from "@/lib/periodos";
import { puedeVer } from "@/lib/permisos";
import { Aviso, Titulo } from "@/components/ui";

export const metadata = { title: "Resumen · Racks" };
export const dynamic = "force-dynamic";

/** Lugar útil y ocupado de una foto: lo fuera de uso no es lugar. */
function lugar(f: Foto) {
  const t = f.grupos.reduce(
    (s, g) => ({
      ocupadas: s.ocupadas + g.ocupadas + g.tapadas,
      libres: s.libres + g.libres,
      fueraDeUso: s.fueraDeUso + g.fueraDeUso,
    }),
    { ocupadas: 0, libres: 0, fueraDeUso: 0 },
  );
  const utiles = t.ocupadas + t.libres;
  return { ...t, utiles, ocupacion: porcentaje(t.ocupadas, utiles) };
}

/**
 * La foto de un momento: la GUARDADA si ese día tiene una (es el registro, con
 * la confiabilidad y la configuración de ese día), si no, reconstruida del
 * historial. La de ahora siempre es la viva.
 */
async function fotoDe(m: Momento): Promise<{ foto: Foto; guardada: FotoGuardada | null }> {
  if (m.dia) {
    const g = await fotoGuardada(m.dia);
    if (g) return { foto: g.foto, guardada: g };
  }
  return { foto: await fotoEn(m.instante, m.esAhora), guardada: null };
}

/**
 * RESUMEN: la foto del stock en un momento. Ahora, o al cierre de cualquier día
 * pasado, y opcionalmente comparada con otra foto.
 *
 * Es "cómo estábamos", no "qué pasó": lo que pasó en un período está en
 * Estadísticas. El orden es el de las preguntas al abrirlo: ¿cuánto hay?, ¿hay
 * lugar?, ¿hay algo pendiente?, ¿qué hay?, ¿desde cuándo?
 */
export default async function PantallaResumen({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string; vs?: string }>;
}) {
  const sesion = await requerirSesion();
  const q = await searchParams;
  const ahora = new Date();
  const momento = leerMomento(q.fecha, ahora);
  const vs = q.vs ? leerMomento(q.vs, ahora) : null;
  const comparacion = vs && vs.instante.getTime() !== momento.instante.getTime() ? vs : null;

  // Si la foto de ayer todavía no se guardó (el proceso de la noche no corrió),
  // se guarda ahora. Es idempotente: si ya está, no hace nada.
  await tomarFoto(sumarDias(diaDe(ahora), -1), ahora);

  const [{ foto, guardada }, otraF, vivo, conChequeo, semivida, fotos] = await Promise.all([
    fotoDe(momento),
    comparacion ? fotoDe(comparacion) : Promise.resolve(null),
    momento.esAhora ? tablero() : Promise.resolve(null),
    momento.esAhora ? bultosConChequeo() : Promise.resolve(null),
    semividaDias(),
    estadoDeFotos(),
  ]);
  const otra = otraF?.foto ?? null;

  const l = lugar(foto);
  const lo = otra ? lugar(otra) : null;
  const contra = comparacion ? comparacion.etiqueta.toLowerCase() : "";
  const d = (actual: number, anterior: number | undefined, unidad?: string) =>
    otra && anterior != null ? <Delta actual={actual} anterior={anterior} contra={contra} unidad={unidad} /> : null;

  const puedeMover = puedeVer(sesion.rol, "/mover");
  const puedeAdmin = puedeVer(sesion.rol, "/admin");
  const puedeStock = puedeVer(sesion.rol, "/stock");

  const pendientes = vivo
    ? ([
        vivo.grupos.some((g) => g.enCarga) && {
          texto: `Grupos en carga inicial: ${vivo.grupos.filter((g) => g.enCarga).map((g) => g.codigo).join(", ")}`,
          detalle: "hasta que control la cierre, el autoelevador no puede meter nada ahí",
          href: puedeVer(sesion.rol, "/control") ? "/control" : undefined,
        },
        foto.bultos.sinUbicar > 0 && {
          texto: `${numero(foto.bultos.sinUbicar)} bulto${foto.bultos.sinUbicar === 1 ? "" : "s"} sin ubicar`,
          detalle: `el más viejo hace ${dias(foto.bultos.sinUbicarMasViejoDias)}`,
          href: puedeMover ? "/mover" : undefined,
        },
        foto.bultos.ajenos > 0 && {
          texto: `${numero(foto.bultos.ajenos)} bulto${foto.bultos.ajenos === 1 ? "" : "s"} en racks de otra empresa`,
          detalle: "la lista está arriba del mapa de racks",
          href: "/racks",
        },
        vivo.bultos.fueraDeNorma > 0 && {
          texto: `${numero(vivo.bultos.fueraDeNorma)} palet${vivo.bultos.fueraDeNorma === 1 ? "" : "s"} u optimizado${vivo.bultos.fueraDeNorma === 1 ? "" : "s"} fuera de norma`,
          detalle: "con una cantidad distinta a la normalizada",
          href: puedeStock ? "/stock" : undefined,
        },
        vivo.maestros.sinEmpresa > 0 && {
          texto: `${numero(vivo.maestros.sinEmpresa)} grupo${vivo.maestros.sinEmpresa === 1 ? "" : "s"} o modelo${vivo.maestros.sinEmpresa === 1 ? "" : "s"} sin empresa`,
          detalle: "sin eso no se puede avisar si un palet está en un rack ajeno",
          href: puedeAdmin ? "/admin" : undefined,
        },
      ].filter(Boolean) as Array<{ texto: string; detalle: string; href?: string }>)
    : [];

  // Los modelos de las dos fotos: uno que había y ya no hay también es una diferencia.
  const modelosOtra = new Map((otra?.modelos ?? []).map((m) => [m.id, m]));
  const modelos = [
    ...foto.modelos,
    ...(otra?.modelos ?? [])
      .filter((m) => !foto.modelos.some((x) => x.id === m.id))
      .map((m) => ({ ...m, bultos: 0, unidades: 0, segunda: 0 })),
  ];

  return (
    <>
      <Titulo detalle="La foto del stock en un momento: cuánto hay, dónde, desde cuándo.">Resumen</Titulo>

      <SelectorMomento momento={momento} comparacion={comparacion} ruta="/resumen" ahora={ahora} />

      <p className="mt-3 text-sm text-slate-600">
        <strong className="text-slate-900">{momento.etiqueta}</strong>
        {comparacion && (
          <>
            {" "}
            comparado con <strong className="text-slate-900">{comparacion.etiqueta.toLowerCase()}</strong>
          </>
        )}
        .
      </p>

      {!momento.esAhora && guardada?.origen === "al_cierre" && (
        <div className="mt-2">
          <Aviso tono="exito">
            Foto guardada al cierre de ese día ({guardada.tomadaEn.toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}):
            es el registro de cómo estaba, con la confiabilidad y la configuración de racks de esa noche. No se puede
            modificar.
          </Aviso>
        </div>
      )}
      {!momento.esAhora && guardada?.origen !== "al_cierre" && (
        <div className="mt-2">
          <Aviso tono="info">
            {guardada
              ? "Foto guardada después, reconstruida con el historial: esa noche el proceso automático no corrió. "
              : "Foto reconstruida con el historial de movimientos: lo registrado hasta el cierre de ese día. "}
            El lugar se calcula con los racks como están configurados hoy, y la confiabilidad no está disponible.
            {!foto.hayHistoria && " No hay ningún movimiento registrado antes de esa fecha."}
          </Aviso>
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Tile
          etiqueta="Stock en m²"
          valor={m2(foto.m2.total)}
          detalle={
            d(Math.round(foto.m2.total), otra ? Math.round(otra.m2.total) : undefined, "m²") ??
            (foto.m2.modelosSinMedir.length > 0
              ? `sin contar ${foto.m2.modelosSinMedir.length} modelo${foto.m2.modelosSinMedir.length === 1 ? "" : "s"} sin medir`
              : "todas las líneas sumadas")
          }
        />
        <Tile
          etiqueta="Bultos en stock"
          valor={numero(foto.bultos.enStock)}
          detalle={
            d(foto.bultos.enStock, otra?.bultos.enStock) ??
            (foto.bultos.objetos > 0
              ? `más ${numero(foto.bultos.objetos)} objeto${foto.bultos.objetos === 1 ? "" : "s"}`
              : "palets, optimizados y sueltos")
          }
        />
        <Tile
          etiqueta="Ocupación"
          valor={`${l.ocupacion}%`}
          detalle={
            lo ? (
              <Delta actual={l.ocupacion} anterior={lo.ocupacion} contra={contra} unidad="puntos" />
            ) : (
              `${numero(l.ocupadas)} de ${numero(l.utiles)} posiciones útiles`
            )
          }
          href="/racks"
        />
        <Tile
          etiqueta="Posiciones libres"
          valor={numero(l.libres)}
          detalle={d(l.libres, lo?.libres) ?? (l.fueraDeUso > 0 ? `y ${numero(l.fueraDeUso)} fuera de uso` : "todas se pueden usar")}
        />
        <Tile
          etiqueta="Sin ubicar"
          valor={numero(foto.bultos.sinUbicar)}
          detalle={d(foto.bultos.sinUbicar, otra?.bultos.sinUbicar) ?? (foto.bultos.sinUbicar > 0 ? "stock sin posición" : "todo tiene lugar")}
          tono={foto.bultos.sinUbicar > 0 ? "atencion" : "normal"}
          href={momento.esAhora && puedeMover && foto.bultos.sinUbicar > 0 ? "/mover" : undefined}
        />
        <Tile
          etiqueta="En rack de otra empresa"
          valor={numero(foto.bultos.ajenos)}
          detalle={d(foto.bultos.ajenos, otra?.bultos.ajenos) ?? (foto.bultos.ajenos > 0 ? "para reacomodar" : "cada uno en lo suyo")}
          tono={foto.bultos.ajenos > 0 ? "atencion" : "normal"}
        />
        <Tile
          etiqueta="De segunda"
          valor={numero(foto.bultos.segunda)}
          detalle={
            d(foto.bultos.segunda, otra?.bultos.segunda) ??
            `bulto${foto.bultos.segunda === 1 ? "" : "s"} de segunda en stock${foto.m2.segunda ? ` · ${m2(foto.m2.segunda)}` : ""}`
          }
        />
      </div>

      {(conChequeo || guardada?.confiabilidad) && (
        <div className="tarjeta mt-2 p-4">
          <p className="mb-1 text-xs font-medium text-slate-500">
            Confiabilidad del stock{guardada?.confiabilidad ? " esa noche" : ""}
          </p>
          <Indice {...(guardada?.confiabilidad ?? indice(conChequeo!.map((b) => confianza(b, semivida))))} />
        </div>
      )}

      {foto.m2.modelosSinMedir.length > 0 && (
        <p className="mt-2 px-1 text-xs text-amber-800">
          Sin m² por unidad, no entran en el total de m²: {foto.m2.modelosSinMedir.join(", ")}.
          {puedeAdmin && (
            <>
              {" "}
              Se cargan en{" "}
              <Link href="/admin/modelos" className="font-semibold underline">
                Administración → Modelos
              </Link>
              .
            </>
          )}
        </p>
      )}

      {pendientes.length > 0 && (
        <Seccion titulo="Pendiente" detalle="Lo que pide que alguien haga algo.">
          <ul className="tarjeta divide-y divide-slate-100">
            {pendientes.map((p) => {
              const cuerpo = (
                <>
                  <span className="font-semibold text-amber-900">{p.texto}</span>
                  <span className="block text-xs text-slate-500">{p.detalle}</span>
                </>
              );
              return (
                <li key={p.texto}>
                  {p.href ? (
                    <Link href={p.href} className="block px-4 py-3 text-sm hover:bg-slate-50">
                      {cuerpo} <span className="text-xs text-slate-400">→</span>
                    </Link>
                  ) : (
                    <div className="px-4 py-3 text-sm">{cuerpo}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </Seccion>
      )}

      <Seccion
        titulo="Stock por línea"
        detalle="Cada línea en su unidad. Las unidades de distintas líneas no se suman entre sí."
      >
        <ul className="grid gap-2 sm:grid-cols-2">
          {foto.lineas.map((ln) => {
            const o = otra?.lineas.find((x) => x.id === ln.id);
            return (
              <li key={ln.id} className="tarjeta p-4">
                <p className="text-sm font-semibold text-slate-700">{ln.nombre}</p>
                <p className="mt-1">
                  <span className="cifra text-2xl text-slate-900">{numero(ln.unidades)}</span>{" "}
                  <span className="text-sm text-slate-500">{ln.unidadPlural}</span>
                </p>
                {o && (
                  <p className="text-xs">
                    <Delta actual={ln.unidades} anterior={o.unidades} contra={contra} />
                  </p>
                )}
                {ln.m2 > 0 && (
                  <p className="text-sm text-slate-600">
                    {m2(ln.m2)}
                    {ln.unidadesSinM2 > 0 && (
                      <span className="text-xs text-amber-800"> (sin contar {numero(ln.unidadesSinM2)} sin medir)</span>
                    )}
                  </p>
                )}
                {o && ln.m2 > 0 && (
                  <p className="text-xs">
                    <Delta actual={Math.round(ln.m2)} anterior={Math.round(o.m2)} contra={contra} unidad="m²" />
                  </p>
                )}
                <p className="text-xs text-slate-500">
                  en {numero(ln.bultos)} bulto{ln.bultos === 1 ? "" : "s"} · {numero(ln.modelosConStock)} modelo
                  {ln.modelosConStock === 1 ? "" : "s"} con stock
                </p>
                <ul className="mt-2 space-y-0.5 text-xs text-slate-600">
                  {PACKAGINGS.filter((p) => ln.porPackaging[p]).map((p) => (
                    <li key={p} className="flex justify-between">
                      <span>{ETIQUETA_PACKAGING[p]}</span>
                      <span>
                        <span className="cifra text-slate-900">{numero(ln.porPackaging[p]!.bultos)}</span> bulto
                        {ln.porPackaging[p]!.bultos === 1 ? "" : "s"} · {numero(ln.porPackaging[p]!.unidades)}{" "}
                        {ln.unidadPlural}
                        {ln.porPackaging[p]!.m2 ? ` · ${m2(ln.porPackaging[p]!.m2!)}` : ""}
                      </span>
                    </li>
                  ))}
                  {ln.segunda.unidades > 0 && (
                    <li className="flex justify-between font-semibold text-orange-800">
                      <span>de eso, de segunda</span>
                      <span>
                        {numero(ln.segunda.bultos)} bulto{ln.segunda.bultos === 1 ? "" : "s"} ·{" "}
                        {numero(ln.segunda.unidades)} {ln.unidadPlural}
                        {ln.segunda.m2 ? ` · ${m2(ln.segunda.m2)}` : ""}
                      </span>
                    </li>
                  )}
                </ul>
              </li>
            );
          })}
        </ul>
      </Seccion>

      <Seccion titulo="Stock por modelo" detalle={momento.esAhora && puedeStock ? "Tocá un modelo para ver dónde está cada bulto." : undefined}>
        {modelos.length === 0 ? (
          <p className="tarjeta p-4 text-sm text-slate-500">No había stock.</p>
        ) : (
          <div className="tarjeta overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Modelo</th>
                  <th className="px-2 py-2 text-right font-medium">Bultos</th>
                  <th className="px-2 py-2 text-right font-medium">Unidades</th>
                  <th className="px-2 py-2 text-right font-medium">m²</th>
                  <th className="px-2 py-2 text-right font-medium">2da</th>
                  {otra && <th className="px-4 py-2 text-right font-medium">Diferencia</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {modelos.map((m) => {
                  const o = modelosOtra.get(m.id);
                  const dif = m.unidades - (o?.unidades ?? 0);
                  const difM2 = m.m2 != null ? m.m2 - (o?.m2 ?? 0) : null;
                  // Los m² por unidad son los mismos para todo el modelo en la foto.
                  const segundaM2 = m.m2 != null && m.unidades > 0 ? (m.segunda * m.m2) / m.unidades : null;
                  return (
                    <tr key={m.id}>
                      <td className="px-4 py-2">
                        {momento.esAhora && puedeStock ? (
                          <Link href={`/stock/${m.id}`} className="font-semibold text-slate-900 underline-offset-2 hover:underline">
                            {m.nombre}
                          </Link>
                        ) : (
                          <span className="font-semibold text-slate-900">{m.nombre}</span>
                        )}
                        <span className="block text-xs text-slate-500">
                          {m.linea}
                          {m.empresa ? ` · ${m.empresa}` : ""}
                        </span>
                      </td>
                      <td className="cifra px-2 py-2 text-right">{numero(m.bultos)}</td>
                      <td className="cifra px-2 py-2 text-right">
                        {numero(m.unidades)} <span className="text-xs text-slate-400">{m.unidadPlural}</span>
                      </td>
                      <td className={`cifra whitespace-nowrap px-2 py-2 text-right ${m.m2 == null ? "text-slate-300" : ""}`}>
                        {m.m2 == null ? "—" : m2(m.m2)}
                      </td>
                      <td className={`cifra px-2 py-2 text-right ${m.segunda > 0 ? "text-orange-800" : "text-slate-300"}`}>
                        {m.segunda > 0 ? numero(m.segunda) : "—"}
                        {m.segunda > 0 && segundaM2 != null && (
                          <span className="block whitespace-nowrap text-xs text-orange-700">{m2(segundaM2)}</span>
                        )}
                      </td>
                      {otra && (
                        <td className={`cifra px-4 py-2 text-right ${dif === 0 ? "text-slate-300" : "text-slate-800"}`}>
                          {dif === 0 ? "=" : `${dif > 0 ? "+" : "−"}${numero(Math.abs(dif))}`}
                          {dif !== 0 && difM2 != null && (
                            <span className="block whitespace-nowrap text-xs text-slate-500">{`${difM2 > 0 ? "+" : "−"}${m2(Math.abs(difM2))}`}</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Seccion>

      <Seccion
        titulo="Lugar, por grupo"
        detalle="Cada barra es un grupo de racks. Lo rayado no cuenta como lugar."
      >
        <div className="tarjeta space-y-3 p-4">
          <LeyendaPosiciones />
          <ul className="space-y-3">
            {foto.grupos.map((g) => {
              const utilesG = g.ocupadas + g.tapadas + g.libres;
              const o = otra?.grupos.find((x) => x.id === g.id);
              return (
                <li key={g.id}>
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate">
                      <strong className="text-slate-900">Grupo {g.codigo}</strong>
                      <span className="text-slate-500">
                        {g.empresa ? ` · ${g.empresa}` : ""}
                        {g.nombre ? ` · ${g.nombre}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-slate-500">
                      <span className="cifra text-slate-900">{porcentaje(g.ocupadas + g.tapadas, utilesG)}%</span> ·{" "}
                      {/* Libres sobre las útiles, que es sobre lo que se calcula el porcentaje. */}
                      {numero(g.libres)} libre{g.libres === 1 ? "" : "s"} de {numero(utilesG)}
                      {o && o.ocupadas !== g.ocupadas && (
                        <span className="ml-1 text-slate-700">
                          ({g.ocupadas > o.ocupadas ? "+" : "−"}
                          {Math.abs(g.ocupadas - o.ocupadas)} ocupadas)
                        </span>
                      )}
                    </span>
                  </div>
                  <BarraPosiciones conteo={g} />
                  {(g.ajenos > 0 || g.objetos > 0 || g.fueraDeUso > 0) && (
                    <p className="mt-1 text-xs text-slate-500">
                      {[
                        g.fueraDeUso > 0 && (
                          <span key="f">
                            y {numero(g.fueraDeUso)} fuera de uso, que no cuentan como lugar
                          </span>
                        ),
                        g.ajenos > 0 && (
                          <span key="a" className="text-amber-800">
                            {numero(g.ajenos)} de otra empresa
                          </span>
                        ),
                        g.objetos > 0 && <span key="o">{`${numero(g.objetos)} objeto${g.objetos === 1 ? "" : "s"}`}</span>,
                      ]
                        .filter(Boolean)
                        .flatMap((x, i) => (i === 0 ? [x] : [" · ", x]))}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </Seccion>

      {foto.niveles.length > 0 && (
        <Seccion
          titulo="Ocupación por nivel"
          detalle="Sumando todos los grupos. Si arriba sobra lugar y el piso está lleno, el problema no es de espacio."
        >
          <Barras
            maximo={100}
            filas={foto.niveles.map((n) => {
              const utilesN = n.ocupadas + n.libres;
              const pct = porcentaje(n.ocupadas, utilesN);
              return {
                clave: n.nombre,
                etiqueta: n.nombre,
                valor: pct,
                texto: `${pct}% · ${numero(n.libres)} libres de ${numero(utilesN)}`,
                detalle: `${numero(n.ocupadas)} ocupadas de ${numero(utilesN)} útiles`,
              };
            })}
          />
        </Seccion>
      )}

      {foto.empresas.length > 0 && (
        <Seccion
          titulo="Por empresa"
          detalle="«Afuera» son los bultos propios guardados en racks de la otra empresa: si crece, a esa empresa le falta lugar."
        >
          <div className="tarjeta overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Empresa</th>
                  <th className="px-2 py-2 text-right font-medium">Posiciones</th>
                  <th className="px-2 py-2 text-right font-medium">Ocupación</th>
                  <th className="px-2 py-2 text-right font-medium">Bultos</th>
                  <th className="px-4 py-2 text-right font-medium">Afuera</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {foto.empresas.map((e) => (
                  <tr key={e.nombre}>
                    <td className="px-4 py-2 font-semibold text-slate-900">{e.nombre}</td>
                    <td className="cifra px-2 py-2 text-right">{numero(e.posiciones)}</td>
                    <td className="cifra px-2 py-2 text-right">{porcentaje(e.ocupadas, e.posiciones)}%</td>
                    <td className="cifra px-2 py-2 text-right">{numero(e.bultosPropios)}</td>
                    <td className={`cifra px-4 py-2 text-right ${e.afuera > 0 ? "text-amber-800" : ""}`}>
                      {numero(e.afuera)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Seccion>
      )}

      <Seccion
        titulo="Antigüedad del stock"
        detalle={`Cuánto hace que entró cada bulto de producto. La mitad del stock tiene menos de ${dias(foto.antiguedad.mediana)}.`}
      >
        <Barras
          filas={foto.antiguedad.tramos.map((t) => ({
            clave: t.tramo,
            etiqueta: t.tramo,
            valor: t.bultos,
            texto: `${numero(t.bultos)} bulto${t.bultos === 1 ? "" : "s"}`,
          }))}
        />
        {foto.antiguedad.masViejos.length > 0 && (
          <div className="mt-2">
            <p className="mb-1 text-xs font-semibold text-slate-500">Los más viejos</p>
            <ul className="tarjeta divide-y divide-slate-100">
              {foto.antiguedad.masViejos.map((v) => (
                <li key={v.id} className="flex items-baseline justify-between gap-3 px-4 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="codigo text-slate-900">{v.ubicacion ?? "sin ubicar"}</span>{" "}
                    <span className="text-slate-600">{v.contenido}</span>
                    <span className="codigo ml-1 text-xs text-slate-400">{v.codigo}</span>
                  </span>
                  <span className="shrink-0 text-xs text-slate-500">{dias(v.dias)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Seccion>

      {vivo && (
        <Seccion titulo="Configuración">
          <p className="tarjeta p-4 text-sm text-slate-600">
            {numero(vivo.maestros.lineas)} líneas · {numero(vivo.maestros.modelos)} modelos ·{" "}
            {numero(vivo.maestros.grupos)} grupos de racks · {numero(vivo.maestros.usuarios)} usuario
            {vivo.maestros.usuarios === 1 ? "" : "s"} · {numero(vivo.maestros.exclusiones)} lugar
            {vivo.maestros.exclusiones === 1 ? "" : "es"} en la lista de exclusión ·{" "}
            {numero(vivo.maestros.nivelesSinAlcance)} nivel{vivo.maestros.nivelesSinAlcance === 1 ? "" : "es"} sin
            alcance del clark
            {foto.bultos.mezclados > 0 && (
              <>
                {" "}
                · {numero(foto.bultos.mezclados)} bulto{foto.bultos.mezclados === 1 ? "" : "s"} mezclado
                {foto.bultos.mezclados === 1 ? "" : "s"}
              </>
            )}
          </p>
        </Seccion>
      )}

      <p className="mt-6 text-xs text-slate-500">
        {fotos.cantidad === 0
          ? "Todavía no hay fotos diarias guardadas. Se guarda una cada noche, al cierre del día."
          : `Fotos diarias guardadas: ${numero(fotos.cantidad)}, desde el ${fechaLarga(fotos.primera!, diaDe(ahora))}. La última es del ${fechaLarga(fotos.ultima!, diaDe(ahora))}${fotos.ultimaOrigen === "al_cierre" ? ", tomada al cierre" : ", reconstruida"}.`}
      </p>

      {puedeVer(sesion.rol, "/estadisticas") && (
        <p className="mt-2 text-sm text-slate-500">
          Lo que pasó en un período —ingresos, egresos, cómo evolucionó el stock— está en{" "}
          <Link href="/estadisticas" className="font-semibold underline">
            Estadísticas
          </Link>
          .
        </p>
      )}
    </>
  );
}
