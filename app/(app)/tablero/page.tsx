import Link from "next/link";
import { requerirSesion } from "@/lib/auth";
import { tablero } from "@/lib/tablero";
import { bultosConChequeo } from "@/lib/consultas";
import { semividaDias } from "@/lib/configuracion";
import { confianza, indice } from "@/lib/confiabilidad";
import { Indice } from "@/components/confiabilidad";
import {
  BarraPosiciones,
  Barras,
  LeyendaPosiciones,
  Seccion,
  Tile,
} from "@/components/graficos";
import { dias, porcentaje } from "@/lib/estadisticas-calculo";
import { ETIQUETA_MOVIMIENTO, ETIQUETA_PACKAGING, PACKAGINGS, numero } from "@/lib/formato";
import { puedeVer } from "@/lib/permisos";
import { Titulo } from "@/components/ui";

export const metadata = { title: "Tablero · Racks" };
export const dynamic = "force-dynamic";

/**
 * Cómo estamos, ahora. Todo sale del estado vivo, no del historial.
 *
 * El orden es el de las preguntas que se hacen al abrirlo: ¿hay lugar?, ¿qué
 * hay?, ¿hay algo pendiente?, ¿se está trabajando? Lo que pide acción va en
 * ámbar y es un link a donde se resuelve.
 */
export default async function PantallaTablero() {
  const sesion = await requerirSesion();
  const [t, bultos, semivida] = await Promise.all([
    tablero(),
    bultosConChequeo(),
    semividaDias(),
  ]);

  const total = t.grupos.reduce(
    (s, g) => ({
      ocupadas: s.ocupadas + g.ocupadas,
      tapadas: s.tapadas + g.tapadas,
      libres: s.libres + g.libres,
      fueraDeUso: s.fueraDeUso + g.fueraDeUso,
      ajenos: s.ajenos + g.ajenos,
    }),
    { ocupadas: 0, tapadas: 0, libres: 0, fueraDeUso: 0, ajenos: 0 },
  );
  // La ocupación es sobre lo que se PUEDE usar: lo fuera de uso no es lugar.
  const utiles = total.ocupadas + total.tapadas + total.libres;
  const ocupacion = porcentaje(total.ocupadas + total.tapadas, utiles);
  const confiabilidad = indice(bultos.map((b) => confianza(b, semivida)));
  const enStock = t.bultos.ubicados + t.bultos.sinUbicar;
  const puedeMover = puedeVer(sesion.rol, "/mover");
  const puedeAdmin = puedeVer(sesion.rol, "/admin");

  if (t.grupos.length === 0 && t.lineas.length === 0) {
    return (
      <>
        <Titulo>Tablero</Titulo>
        <div className="tarjeta p-6 text-sm text-slate-600">
          Todavía no hay racks ni líneas cargados. Cuando estén, acá vas a ver la
          ocupación, el stock y lo pendiente de un vistazo.
          {puedeAdmin && (
            <>
              {" "}
              Se cargan desde{" "}
              <Link href="/admin" className="font-semibold underline">
                Administración
              </Link>
              .
            </>
          )}
        </div>
      </>
    );
  }

  const pendientes = [
    t.bultos.sinUbicar > 0 && {
      texto: `${numero(t.bultos.sinUbicar)} bulto${t.bultos.sinUbicar === 1 ? "" : "s"} sin ubicar`,
      detalle: `el más viejo hace ${dias(t.bultos.sinUbicarMasViejoDias)}`,
      href: puedeMover ? "/mover" : undefined,
    },
    total.ajenos > 0 && {
      texto: `${numero(total.ajenos)} bulto${total.ajenos === 1 ? "" : "s"} en racks de otra empresa`,
      detalle: "la lista está arriba del mapa de racks",
      href: "/racks",
    },
    t.bultos.fueraDeNorma > 0 && {
      texto: `${numero(t.bultos.fueraDeNorma)} palet${t.bultos.fueraDeNorma === 1 ? "" : "s"} u optimizado${t.bultos.fueraDeNorma === 1 ? "" : "s"} fuera de norma`,
      detalle: "con una cantidad distinta a la normalizada",
      href: puedeVer(sesion.rol, "/stock") ? "/stock" : undefined,
    },
    t.maestros.sinEmpresa > 0 && {
      texto: `${numero(t.maestros.sinEmpresa)} grupo${t.maestros.sinEmpresa === 1 ? "" : "s"} o modelo${t.maestros.sinEmpresa === 1 ? "" : "s"} sin empresa`,
      detalle: "sin eso no se puede avisar si un palet está en un rack ajeno",
      href: puedeAdmin ? "/admin" : undefined,
    },
  ].filter(Boolean) as Array<{ texto: string; detalle: string; href?: string }>;

  return (
    <>
      <Titulo detalle="Cómo estamos ahora. Los números se actualizan solos al entrar.">
        Tablero
      </Titulo>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Tile
          etiqueta="Ocupación"
          valor={`${ocupacion}%`}
          detalle={`${numero(total.ocupadas + total.tapadas)} de ${numero(utiles)} posiciones útiles`}
          href="/racks"
        />
        <Tile
          etiqueta="Posiciones libres"
          valor={numero(total.libres)}
          detalle={
            total.fueraDeUso > 0
              ? `y ${numero(total.fueraDeUso)} fuera de uso`
              : "todas se pueden usar"
          }
          href="/racks"
        />
        <Tile
          etiqueta="Bultos en stock"
          valor={numero(enStock)}
          detalle={
            t.bultos.objetos > 0
              ? `más ${numero(t.bultos.objetos)} objeto${t.bultos.objetos === 1 ? "" : "s"} que no son producto`
              : "palets, optimizados y sueltos"
          }
        />
        <Tile
          etiqueta="Sin ubicar"
          valor={numero(t.bultos.sinUbicar)}
          detalle={t.bultos.sinUbicar > 0 ? "stock sin posición asignada" : "todo tiene lugar"}
          tono={t.bultos.sinUbicar > 0 ? "atencion" : "normal"}
          href={puedeMover && t.bultos.sinUbicar > 0 ? "/mover" : undefined}
        />
        <Tile
          etiqueta="En rack de otra empresa"
          valor={numero(total.ajenos)}
          detalle={total.ajenos > 0 ? "para reacomodar" : "cada uno en lo suyo"}
          tono={total.ajenos > 0 ? "atencion" : "normal"}
          href={total.ajenos > 0 ? "/racks" : undefined}
        />
        <Tile
          etiqueta="Movimientos hoy"
          valor={numero(Object.values(t.actividad.hoy).reduce((s, n) => s + n, 0))}
          detalle={`${numero(Object.values(t.actividad.semana).reduce((s, n) => s + n, 0))} en los últimos 7 días`}
          href={puedeVer(sesion.rol, "/movimientos") ? "/movimientos" : undefined}
        />
      </div>

      <div className="tarjeta mt-2 p-4">
        <p className="mb-1 text-xs font-medium text-slate-500">Confiabilidad del stock</p>
        <Indice {...confiabilidad} />
      </div>

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
        titulo="Lugar, por grupo"
        detalle="Cada barra es un grupo de racks, de piso a techo. Lo rayado no cuenta como lugar."
      >
        <div className="tarjeta space-y-3 p-4">
          <LeyendaPosiciones />
          <ul className="space-y-3">
            {t.grupos.map((g) => {
              const utilesG = g.ocupadas + g.tapadas + g.libres;
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
                      <span className="cifra text-slate-900">
                        {porcentaje(g.ocupadas + g.tapadas, utilesG)}%
                      </span>{" "}
                      · {numero(g.libres)} libre{g.libres === 1 ? "" : "s"}
                    </span>
                  </div>
                  <BarraPosiciones conteo={g} />
                  {(g.ajenos > 0 || g.objetos > 0) && (
                    <p className="mt-1 text-xs text-slate-500">
                      {g.ajenos > 0 && (
                        <span className="text-amber-800">
                          {numero(g.ajenos)} de otra empresa
                        </span>
                      )}
                      {g.ajenos > 0 && g.objetos > 0 && " · "}
                      {g.objetos > 0 && `${numero(g.objetos)} objeto${g.objetos === 1 ? "" : "s"}`}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </Seccion>

      {t.niveles.length > 0 && (
        <Seccion
          titulo="Ocupación por nivel"
          detalle="Sumando todos los grupos. Si arriba sobra lugar y el piso está lleno, el problema no es de espacio."
        >
          <Barras
            maximo={100}
            filas={t.niveles.map((n) => {
              const utilesN = n.ocupadas + n.libres;
              const pct = porcentaje(n.ocupadas, utilesN);
              return {
                clave: n.nombre,
                etiqueta: n.nombre,
                valor: pct,
                texto: `${pct}% · ${numero(n.libres)} libres`,
                detalle: `${numero(n.ocupadas)} ocupadas de ${numero(utilesN)} útiles, ${numero(n.total)} en total`,
              };
            })}
          />
        </Seccion>
      )}

      {t.empresas.length > 0 && (
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
                {t.empresas.map((e) => (
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
        titulo="Stock por línea"
        detalle="Cada línea en su unidad. Las unidades de distintas líneas no se suman entre sí."
      >
        <ul className="grid gap-2 sm:grid-cols-2">
          {t.lineas.map((l) => (
            <li key={l.id} className="tarjeta p-4">
              <p className="text-sm font-semibold text-slate-700">{l.nombre}</p>
              <p className="mt-1">
                <span className="cifra text-2xl text-slate-900">{numero(l.unidades)}</span>{" "}
                <span className="text-sm text-slate-500">{l.unidadPlural}</span>
              </p>
              <p className="text-xs text-slate-500">
                en {numero(l.bultos)} bulto{l.bultos === 1 ? "" : "s"} · {numero(l.modelosConStock)} modelo
                {l.modelosConStock === 1 ? "" : "s"} con stock
              </p>
              <ul className="mt-2 space-y-0.5 text-xs text-slate-600">
                {PACKAGINGS.filter((p) => l.porPackaging[p]).map((p) => (
                  <li key={p} className="flex justify-between">
                    <span>{ETIQUETA_PACKAGING[p]}</span>
                    <span>
                      <span className="cifra text-slate-900">{numero(l.porPackaging[p]!.bultos)}</span>{" "}
                      bulto{l.porPackaging[p]!.bultos === 1 ? "" : "s"} ·{" "}
                      {numero(l.porPackaging[p]!.unidades)} {l.unidadPlural}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </Seccion>

      {t.modelos.length > 0 && (
        <Seccion titulo="Modelos con más bultos" detalle="Tocá uno para ver dónde está cada bulto.">
          <Barras
            filas={t.modelos.slice(0, 10).map((m) => ({
              clave: String(m.id),
              etiqueta: (
                <>
                  {m.nombre} <span className="text-slate-400">· {m.linea}</span>
                </>
              ),
              valor: m.bultos,
              texto: `${numero(m.bultos)} · ${numero(m.unidades)} ${m.unidadPlural}`,
              detalle: `${m.nombre}${m.empresa ? ` (${m.empresa})` : ""}: ${numero(m.bultos)} bultos, ${numero(m.unidades)} ${m.unidadPlural}`,
              href: puedeVer(sesion.rol, "/stock") ? `/stock/${m.id}` : undefined,
            }))}
          />
        </Seccion>
      )}

      <Seccion titulo="Actividad" detalle="Movimientos registrados, sin contar los anulados.">
        <div className="tarjeta overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Movimiento</th>
                <th className="px-2 py-2 text-right font-medium">Hoy</th>
                <th className="px-4 py-2 text-right font-medium">Últimos 7 días</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(["meter", "sacar", "mover", "ajuste"] as const).map((tipo) => (
                <tr key={tipo}>
                  <td className="px-4 py-2 text-slate-700">{ETIQUETA_MOVIMIENTO[tipo]}</td>
                  <td className="cifra px-2 py-2 text-right">{numero(t.actividad.hoy[tipo] ?? 0)}</td>
                  <td className="cifra px-4 py-2 text-right">{numero(t.actividad.semana[tipo] ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {puedeVer(sesion.rol, "/estadisticas") && (
          <p className="mt-2 text-sm">
            <Link href="/estadisticas" className="font-semibold text-slate-700 underline">
              Ver estadísticas del período →
            </Link>
          </p>
        )}
      </Seccion>

      <Seccion titulo="Configuración">
        <p className="tarjeta p-4 text-sm text-slate-600">
          {numero(t.maestros.lineas)} líneas · {numero(t.maestros.modelos)} modelos ·{" "}
          {numero(t.maestros.grupos)} grupos de racks · {numero(t.maestros.usuarios)} usuario{t.maestros.usuarios === 1 ? "" : "s"} ·{" "}
          {numero(t.maestros.exclusiones)} lugar{t.maestros.exclusiones === 1 ? "" : "es"} en la lista de exclusión ·{" "}
          {numero(t.maestros.nivelesSinAlcance)} nivel{t.maestros.nivelesSinAlcance === 1 ? "" : "es"} sin alcance del clark
          {t.bultos.mezclados > 0 && (
            <> · {numero(t.bultos.mezclados)} bulto{t.bultos.mezclados === 1 ? "" : "s"} mezclado{t.bultos.mezclados === 1 ? "" : "s"}</>
          )}
        </p>
      </Seccion>
    </>
  );
}
