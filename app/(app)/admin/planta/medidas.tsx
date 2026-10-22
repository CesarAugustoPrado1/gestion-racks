"use client";

import { useEffect, useState } from "react";
import {
  ETIQUETA_TIPO,
  elementoDesdeRect,
  esRectilineo,
  m,
  problemaDelPlano,
  rectDeElemento,
  type Elemento,
  type Plano,
  type RectUsuario,
  type TipoElemento,
} from "@/lib/plano";

/**
 * Cargar y editar el plano con números, desde los ejes de referencia.
 *
 * Todo se expresa como un rectángulo alineado a los ejes: X e Y de la esquina
 * de ABAJO A LA IZQUIERDA, ancho en X y alto en Y. Para un acceso o el frente,
 * que son una línea, se pide el largo y si va horizontal o vertical.
 */

const TIPOS_POR_MEDIDAS: TipoElemento[] = ["limite", "techado", "rack", "calle", "acceso", "frente"];
const esLinea = (t: TipoElemento) => t === "acceso" || t === "frente";

/** Un campo numérico en metros, que se aplica al salir del campo. */
export function Medida({
  etiqueta,
  valor,
  cambiar,
  negativos = false,
  cero = false,
}: {
  etiqueta: string;
  valor: number | null;
  cambiar: (v: number) => void;
  /** Las coordenadas pueden ser negativas si el origen está corrido. */
  negativos?: boolean;
  cero?: boolean;
}) {
  const formatear = (v: number | null) => (v == null ? "" : String(Math.round(v * 100) / 100).replace(".", ","));
  const [texto, setTexto] = useState(formatear(valor));
  useEffect(() => setTexto(formatear(valor)), [valor]);
  return (
    <label className="block text-xs text-slate-600">
      {etiqueta}
      <input
        className="campo mt-1 py-2"
        inputMode="decimal"
        value={texto}
        onChange={(ev) => setTexto(ev.target.value.replace(/[^\d,.-]/g, ""))}
        onBlur={() => {
          const v = Number(texto.replace(",", "."));
          const valido = texto.trim() !== "" && Number.isFinite(v) && (negativos || v >= 0) && (cero || v !== 0);
          if (valido && v !== valor) cambiar(v);
          else if (!valido) setTexto(formatear(valor));
        }}
      />
    </label>
  );
}

type Borrador = {
  tipo: TipoElemento;
  x: number | null;
  y: number | null;
  ancho: number | null;
  alto: number | null;
  /** Para acceso y frente. */
  largo: number | null;
  direccion: "horizontal" | "vertical";
  etiqueta: string;
  grupoId: number | null;
  /** Límite o techado: sumarlo a uno que ya existe en vez de crear otro. */
  sumarA: string;
};

export function FormularioPorMedidas({
  plano,
  grupos,
  gruposUsados,
  agregar,
  sumarA,
}: {
  plano: Plano;
  grupos: Array<{ id: number; codigo: string; nombre: string | null }>;
  gruposUsados: Set<number>;
  agregar: (e: Elemento) => void;
  sumarA: (id: string, r: RectUsuario) => string | null;
}) {
  const hayLimite = plano.elementos.some((e) => e.tipo === "limite");
  const [b, setB] = useState<Borrador>({
    tipo: hayLimite ? "rack" : "limite",
    x: 0,
    y: 0,
    ancho: null,
    alto: null,
    largo: null,
    direccion: "horizontal",
    etiqueta: "",
    grupoId: null,
    sumarA: "",
  });
  const [error, setError] = useState<string | null>(null);

  const linea = esLinea(b.tipo);
  const destinos = plano.elementos.filter(
    (e): e is Extract<Elemento, { tipo: "limite" | "techado" }> =>
      e.tipo === b.tipo && (e.tipo === "limite" || e.tipo === "techado") && esRectilineo(e.puntos),
  );

  const rect: RectUsuario | null =
    b.x == null || b.y == null
      ? null
      : linea
        ? b.largo
          ? b.direccion === "horizontal"
            ? { x: b.x, y: b.y, ancho: b.largo, alto: 0 }
            : { x: b.x, y: b.y, ancho: 0, alto: b.largo }
          : null
        : b.ancho && b.alto
          ? { x: b.x, y: b.y, ancho: b.ancho, alto: b.alto }
          : null;

  function confirmar() {
    if (!rect) return;
    setError(null);
    if (b.sumarA) {
      const problema = sumarA(b.sumarA, rect);
      if (problema) setError(problema);
      return;
    }
    const e = elementoDesdeRect(b.tipo, rect, plano, {
      etiqueta: b.etiqueta.trim() || undefined,
      ...(b.tipo === "rack" ? { grupoId: b.grupoId } : {}),
    } as Partial<Elemento>);
    const problema = problemaDelPlano({ ...plano, elementos: [e] });
    if (problema) {
      setError(problema);
      return;
    }
    agregar(e);
    // Queda listo para el siguiente, del mismo tipo: se suelen cargar varios.
    setB({ ...b, etiqueta: "", grupoId: null, sumarA: "" });
  }

  return (
    <div className="tarjeta space-y-3 p-4">
      <p className="text-sm font-bold text-slate-900">Agregar por medidas</p>

      <label className="block text-xs text-slate-600">
        Qué es
        <select
          className="campo mt-1 py-2"
          value={b.tipo}
          onChange={(ev) => {
            setB({ ...b, tipo: ev.target.value as TipoElemento, sumarA: "" });
            setError(null);
          }}
        >
          {TIPOS_POR_MEDIDAS.map((t) => (
            <option key={t} value={t}>
              {ETIQUETA_TIPO[t]}
            </option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-2 gap-2">
        <Medida etiqueta="X (m)" valor={b.x} cambiar={(v) => setB({ ...b, x: v })} negativos cero />
        <Medida etiqueta="Y (m)" valor={b.y} cambiar={(v) => setB({ ...b, y: v })} negativos cero />
        {linea ? (
          <>
            <Medida etiqueta="Largo (m)" valor={b.largo} cambiar={(v) => setB({ ...b, largo: v })} />
            <label className="block text-xs text-slate-600">
              Dirección
              <select
                className="campo mt-1 py-2"
                value={b.direccion}
                onChange={(ev) => setB({ ...b, direccion: ev.target.value as Borrador["direccion"] })}
              >
                <option value="horizontal">→ horizontal</option>
                <option value="vertical">↑ vertical</option>
              </select>
            </label>
          </>
        ) : (
          <>
            <Medida etiqueta="Ancho en X (m)" valor={b.ancho} cambiar={(v) => setB({ ...b, ancho: v })} />
            <Medida etiqueta="Alto en Y (m)" valor={b.alto} cambiar={(v) => setB({ ...b, alto: v })} />
          </>
        )}
      </div>
      <p className="text-xs text-slate-500">
        {linea
          ? "X e Y son el extremo izquierdo (horizontal) o el de abajo (vertical)."
          : "X e Y son la esquina de abajo a la izquierda."}
        {b.tipo === "calle" && " El lado corto es el ancho de la calle."}
      </p>

      {(b.tipo === "limite" || b.tipo === "techado") && destinos.length > 0 && (
        <label className="block text-xs text-slate-600">
          ¿Nuevo o sumado a uno que ya está?
          <select className="campo mt-1 py-2" value={b.sumarA} onChange={(ev) => setB({ ...b, sumarA: ev.target.value })}>
            <option value="">Nuevo</option>
            {destinos.map((d, i) => (
              <option key={d.id} value={d.id}>
                Sumar a {d.etiqueta || `${ETIQUETA_TIPO[d.tipo].toLowerCase()} ${i + 1}`}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-slate-500">
            Sumar une las áreas y rearma el perímetro: así se arma un lote que no es rectangular.
          </span>
        </label>
      )}

      {b.tipo === "rack" && (
        <label className="block text-xs text-slate-600">
          Grupo de racks
          <select
            className="campo mt-1 py-2"
            value={b.grupoId ?? ""}
            onChange={(ev) => setB({ ...b, grupoId: ev.target.value ? Number(ev.target.value) : null })}
          >
            <option value="">Sin asignar</option>
            {grupos.map((g) => (
              <option key={g.id} value={g.id} disabled={gruposUsados.has(g.id)}>
                {g.codigo}
                {g.nombre ? ` · ${g.nombre}` : ""}
                {gruposUsados.has(g.id) ? " (ya está en el plano)" : ""}
              </option>
            ))}
          </select>
        </label>
      )}

      {!b.sumarA && (
        <label className="block text-xs text-slate-600">
          Nombre (opcional)
          <input
            className="campo mt-1 py-2"
            value={b.etiqueta}
            maxLength={60}
            onChange={(ev) => setB({ ...b, etiqueta: ev.target.value })}
            placeholder={b.tipo === "frente" ? "Ruta 5" : b.tipo === "acceso" ? "Portón 1" : ""}
          />
        </label>
      )}

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-800 ring-1 ring-red-200">{error}</p>}

      <button type="button" className="boton-primario min-h-10 w-full text-sm" disabled={!rect} onClick={confirmar}>
        {b.sumarA ? "Sumar" : `Agregar ${ETIQUETA_TIPO[b.tipo].toLowerCase()}`}
      </button>
    </div>
  );
}

/** Las medidas del elemento elegido, editables si es un rectángulo. */
export function MedidasDelElemento({
  elemento,
  plano,
  cambiar,
}: {
  elemento: Elemento;
  plano: Plano;
  cambiar: (e: Elemento) => void;
}) {
  const r = rectDeElemento(elemento, plano);
  if (!r) {
    return (
      <p className="text-xs text-slate-500">
        No es un rectángulo alineado a los ejes, así que no se edita con números. Usá el dibujo libre.
      </p>
    );
  }
  const rearmar = (nuevo: RectUsuario) => cambiar(elementoDesdeRect(elemento.tipo, nuevo, plano, elemento));
  const linea = esLinea(elemento.tipo);
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <Medida etiqueta="X (m)" valor={r.x} cambiar={(v) => rearmar({ ...r, x: v })} negativos cero />
        <Medida etiqueta="Y (m)" valor={r.y} cambiar={(v) => rearmar({ ...r, y: v })} negativos cero />
        {linea ? (
          <Medida
            etiqueta="Largo (m)"
            valor={r.alto === 0 ? r.ancho : r.alto}
            cambiar={(v) => rearmar(r.alto === 0 ? { ...r, ancho: v } : { ...r, alto: v })}
          />
        ) : (
          <>
            <Medida etiqueta="Ancho en X (m)" valor={r.ancho} cambiar={(v) => rearmar({ ...r, ancho: v })} />
            <Medida etiqueta="Alto en Y (m)" valor={r.alto} cambiar={(v) => rearmar({ ...r, alto: v })} />
          </>
        )}
      </div>
      {!linea && (
        <p className="text-xs text-slate-500">
          {m(r.ancho)} × {m(r.alto)} · {Math.round(r.ancho * r.alto).toLocaleString("es-AR")} m²
        </p>
      )}
    </div>
  );
}
