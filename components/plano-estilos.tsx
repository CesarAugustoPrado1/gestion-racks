"use client";

import {
  ESTILO_DE_FABRICA,
  ETIQUETA_TIPO,
  FUENTES,
  TIPOS,
  TIPOS_DE_TRAZO,
  estiloDelTipo,
  sinRelleno,
  tipografiaDe,
  type Estilo,
  type EstiloResuelto,
  type Fuente,
  type Plano,
  type TipoElemento,
  type TipoTrazo,
} from "@/lib/plano";

/**
 * Los controles de estilo. El mismo componente sirve para la REGLA de un tipo
 * ("todos los techados así") y para un ELEMENTO que se tiene que ver distinto:
 * muestra lo que vale hoy y, al tocar algo, manda solo ese campo.
 */
export function EditorDeEstilo({
  tipo,
  efectivo,
  cambiar,
}: {
  tipo: TipoElemento;
  efectivo: EstiloResuelto;
  cambiar: (parche: Estilo) => void;
}) {
  const conRelleno = !sinRelleno(tipo);
  const modoRelleno =
    efectivo.relleno === "ninguno" ? "ninguno" : efectivo.relleno === "ocupacion" ? "ocupacion" : "color";
  const colorRelleno = modoRelleno === "color" ? efectivo.relleno : ESTILO_DE_FABRICA.techado.relleno;
  const conTrazo = efectivo.trazo !== "ninguno";

  return (
    <div className="space-y-3">
      {conRelleno && (
        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold text-slate-700">
            {tipo === "calle" ? "Relleno (la franja de la calle)" : "Relleno"}
          </legend>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="campo w-auto py-1.5 text-sm"
              value={modoRelleno}
              onChange={(ev) => {
                const v = ev.target.value;
                cambiar({ relleno: v === "color" ? colorRelleno : v });
              }}
              aria-label="Tipo de relleno"
            >
              <option value="ninguno">Sin relleno</option>
              <option value="color">Color</option>
              {tipo === "rack" && <option value="ocupacion">Según ocupación</option>}
            </select>
            {modoRelleno === "color" && (
              <input
                type="color"
                className="h-9 w-12 cursor-pointer rounded border border-slate-300"
                value={colorRelleno}
                onChange={(ev) => cambiar({ relleno: ev.target.value })}
                aria-label="Color del relleno"
              />
            )}
          </div>
          {modoRelleno !== "ninguno" && (
            <label className="flex items-center gap-2 text-xs text-slate-600">
              Opacidad
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={efectivo.opacidad}
                onChange={(ev) => cambiar({ opacidad: Number(ev.target.value) })}
                className="flex-1"
              />
              <span className="w-9 text-right tabular-nums">{efectivo.opacidad}%</span>
            </label>
          )}
        </fieldset>
      )}

      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold text-slate-700">
          {tipo === "calle" ? "Trazo (la línea del medio)" : "Trazo"}
        </legend>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="campo w-auto py-1.5 text-sm"
            value={conTrazo ? "color" : "ninguno"}
            onChange={(ev) =>
              cambiar({
                trazo: ev.target.value === "ninguno" ? "ninguno" : ESTILO_DE_FABRICA[tipo].trazo,
              })
            }
            aria-label="Con o sin trazo"
          >
            <option value="ninguno">Sin trazo</option>
            <option value="color">Color</option>
          </select>
          {conTrazo && (
            <input
              type="color"
              className="h-9 w-12 cursor-pointer rounded border border-slate-300"
              value={efectivo.trazo}
              onChange={(ev) => cambiar({ trazo: ev.target.value })}
              aria-label="Color del trazo"
            />
          )}
          {conTrazo && (
            <select
              className="campo w-auto py-1.5 text-sm"
              value={efectivo.tipoTrazo}
              onChange={(ev) => cambiar({ tipoTrazo: ev.target.value as TipoTrazo })}
              aria-label="Tipo de trazo"
            >
              {(Object.keys(TIPOS_DE_TRAZO) as TipoTrazo[]).map((t) => (
                <option key={t} value={t}>
                  {TIPOS_DE_TRAZO[t]}
                </option>
              ))}
            </select>
          )}
        </div>
        {conTrazo && (
          <label className="flex items-center gap-2 text-xs text-slate-600">
            Grosor
            <input
              type="range"
              min={0.5}
              max={20}
              step={0.5}
              value={efectivo.grosor}
              onChange={(ev) => cambiar({ grosor: Number(ev.target.value) })}
              className="flex-1"
            />
            <span className="w-9 text-right tabular-nums">{String(efectivo.grosor).replace(".", ",")}</span>
          </label>
        )}
      </fieldset>
    </div>
  );
}

/** Las reglas por tipo: cómo se ve cada cosa si no se dice otra cosa. */
export function ReglasDeEstilo({
  plano,
  cambiar,
}: {
  plano: Plano;
  cambiar: (p: Plano) => void;
}) {
  return (
    <details className="tarjeta p-4">
      <summary className="cursor-pointer text-sm font-bold text-slate-900">Estilos por tipo</summary>
      <p className="mt-1 mb-3 text-xs text-slate-500">
        Cómo se ve cada tipo de cosa en todo el plano. Un elemento puede tener su propio estilo encima de esto.
      </p>
      <div className="space-y-4">
        {TIPOS.map((t) => {
          const propia = plano.estilos?.[t];
          const tocada = propia && Object.keys(propia).length > 0;
          return (
            <details key={t} className="rounded-lg bg-slate-50 p-3">
              <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700">
                <Muestra tipo={t} estilo={estiloDelTipo(t, plano)} />
                {ETIQUETA_TIPO[t]}
                {tocada && <span className="text-xs font-normal text-slate-400">· cambiado</span>}
              </summary>
              <div className="mt-3 space-y-2">
                <EditorDeEstilo
                  tipo={t}
                  efectivo={estiloDelTipo(t, plano)}
                  cambiar={(parche) =>
                    cambiar({ ...plano, estilos: { ...plano.estilos, [t]: { ...propia, ...parche } } })
                  }
                />
                {tocada && (
                  <button
                    type="button"
                    className="text-xs font-semibold text-slate-600 underline"
                    onClick={() => {
                      const resto = { ...plano.estilos };
                      delete resto[t];
                      cambiar({ ...plano, estilos: resto });
                    }}
                  >
                    Volver al de fábrica
                  </button>
                )}
              </div>
            </details>
          );
        })}
      </div>
    </details>
  );
}

/** La tipografía de todo el plano. */
export function EditorDeTipografia({ plano, cambiar }: { plano: Plano; cambiar: (p: Plano) => void }) {
  const t = tipografiaDe(plano);
  const poner = (parche: Partial<typeof t>) => cambiar({ ...plano, texto: { ...t, ...parche } });
  return (
    <details className="tarjeta p-4">
      <summary className="cursor-pointer text-sm font-bold text-slate-900">Tipografía del plano</summary>
      <div className="mt-3 space-y-3">
        <label className="block text-xs text-slate-600">
          Fuente
          <select
            className="campo mt-1 py-2"
            value={t.fuente}
            onChange={(ev) => poner({ fuente: ev.target.value as Fuente })}
            style={{ fontFamily: FUENTES[t.fuente].css }}
          >
            {(Object.keys(FUENTES) as Fuente[]).map((f) => (
              <option key={f} value={f} style={{ fontFamily: FUENTES[f].css }}>
                {FUENTES[f].etiqueta}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-600">
          Tamaño
          <input
            type="range"
            min={40}
            max={300}
            step={10}
            value={t.tamano}
            onChange={(ev) => poner({ tamano: Number(ev.target.value) })}
            className="flex-1"
          />
          <span className="w-10 text-right tabular-nums">{t.tamano}%</span>
        </label>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={t.color == null}
              onChange={(ev) => poner({ color: ev.target.checked ? undefined : "#0f172a" })}
            />
            Cada texto con su color
          </label>
          {t.color != null && (
            <input
              type="color"
              className="h-9 w-12 cursor-pointer rounded border border-slate-300"
              value={t.color}
              onChange={(ev) => poner({ color: ev.target.value })}
              aria-label="Color de todos los textos"
            />
          )}
        </div>
      </div>
    </details>
  );
}

/** Un cuadradito con el estilo, para reconocer el tipo de un vistazo. */
export function Muestra({ tipo, estilo }: { tipo: TipoElemento; estilo: EstiloResuelto }) {
  const lleno =
    estilo.relleno === "ocupacion" ? "#2a78d6" : estilo.relleno === "ninguno" || sinRelleno(tipo) ? "transparent" : estilo.relleno;
  return (
    <svg width="22" height="14" viewBox="0 0 22 14" aria-hidden className="shrink-0">
      {sinRelleno(tipo) ? (
        <line
          x1="1"
          y1="7"
          x2="21"
          y2="7"
          stroke={estilo.trazo === "ninguno" ? "#cbd5e1" : estilo.trazo}
          strokeWidth="3"
          strokeDasharray={estilo.tipoTrazo === "guiones" ? "5 3" : estilo.tipoTrazo === "puntos" ? "1 3" : undefined}
        />
      ) : (
        <rect
          x="1.5"
          y="1.5"
          width="19"
          height="11"
          rx="1.5"
          fill={lleno}
          fillOpacity={estilo.relleno === "ocupacion" ? 0.35 : estilo.opacidad / 100}
          stroke={estilo.trazo === "ninguno" ? "none" : estilo.trazo}
          strokeWidth="1.5"
          strokeDasharray={estilo.tipoTrazo === "guiones" ? "4 2" : estilo.tipoTrazo === "puntos" ? "1 2" : undefined}
        />
      )}
    </svg>
  );
}
