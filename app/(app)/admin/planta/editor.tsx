"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { guardarPlano } from "@/lib/acciones/plano";
import { useAccion } from "@/components/usar-accion";
import { Aviso } from "@/components/ui";
import { FormularioPorMedidas, Medida, MedidasDelElemento } from "./medidas";
import {
  DibujoElemento,
  Escala,
  Grilla,
  escalaDe,
  ordenarParaDibujar,
  type InfoDeGrupo,
} from "@/components/plano-dibujo";
import {
  ETIQUETA_TIPO,
  MINIMO_DE_PUNTOS,
  aGrilla,
  aUsuario,
  deUsuario,
  elementoDesdeRect,
  origenDe,
  unirRectilineos,
  type RectUsuario,
  esPoligono,
  esSegmento,
  esquinasDeRack,
  girar,
  largo,
  m,
  mover,
  moverVertice,
  nuevoId,
  problemaDelPlano,
  superficie,
  type Elemento,
  type Plano,
  type Punto,
  type TipoElemento,
} from "@/lib/plano";

/**
 * El editor del plano. Todo en el navegador hasta que se toca "Guardar", que
 * manda el plano entero como una versión nueva.
 *
 * DOS MODOS. "Por medidas" es el principal: casi todo en una planta es un
 * rectángulo alineado a los ejes, y se carga con X, Y, ancho y alto desde los
 * ejes de referencia. "Dibujo libre" queda para lo que no entra en eso. Los dos
 * editan el mismo plano.
 *
 * Shift + clic elige varias figuras a la vez, para UNIRLAS: el lote o un
 * techado que no es un rectángulo se arma sumando rectángulos.
 *
 * Cómo se usa, que es lo mismo que dice la barra de ayuda:
 * - Elegir una herramienta y hacer clic en el plano para poner puntos.
 * - Los trazos (límite, techado, calle) se terminan con doble clic o Enter;
 *   Escape cancela y Borrar saca el último punto. Acceso y frente son dos
 *   puntos y se terminan solos. Un rack se pone con un clic.
 * - Con "Seleccionar": clic en algo para elegirlo, arrastrar para moverlo,
 *   arrastrar los puntitos para cambiar la forma, arrastrar el fondo para
 *   desplazarse. La rueda del mouse hace zoom.
 * - Ctrl+Z deshace. Suprimir borra lo elegido.
 */

type Herramienta = "seleccionar" | TipoElemento;

const HERRAMIENTAS: Array<{ id: Herramienta; etiqueta: string; ayuda: string }> = [
  { id: "seleccionar", etiqueta: "Seleccionar", ayuda: "Clic para elegir, arrastrar para mover. Arrastrá el fondo para desplazarte; la rueda hace zoom." },
  { id: "limite", etiqueta: "Límite", ayuda: "Clic en cada esquina del predio. Doble clic o Enter para cerrar." },
  { id: "techado", etiqueta: "Techado", ayuda: "Clic en cada esquina de lo que está bajo techo. Doble clic o Enter para cerrar." },
  { id: "rack", etiqueta: "Rack", ayuda: "Clic donde va. Después, a la derecha, elegís el grupo y le das las medidas." },
  { id: "calle", etiqueta: "Calle", ayuda: "Clic en cada quiebre del recorrido del clark. Doble clic o Enter para terminar." },
  { id: "acceso", etiqueta: "Acceso", ayuda: "Clic en los dos extremos del portón o la puerta." },
  { id: "frente", etiqueta: "Frente", ayuda: "Clic en los dos extremos del frente: la calle por donde se entra a la fábrica." },
];

type Arrastre =
  | { modo: "mover"; id: string; desde: Punto; original: Elemento }
  | { modo: "vertice"; id: string; indice: number }
  | { modo: "fondo"; desdePantalla: [number, number]; vista: Vista };

type Vista = { x: number; y: number; w: number; h: number };

export function EditorPlano({
  inicial,
  version,
  grupos,
}: {
  inicial: Plano;
  version: number | null;
  grupos: Array<{ id: number; codigo: string; nombre: string | null; info: InfoDeGrupo }>;
}) {
  const router = useRouter();
  const { ejecutar, enviando, error, setError } = useAccion();

  const [plano, setPlano] = useState<Plano>(inicial);
  const [base, setBase] = useState<number | null>(version);
  const [cambios, setCambios] = useState(false);
  const [historia, setHistoria] = useState<Plano[]>([]);
  const [herramienta, setHerramienta] = useState<Herramienta>("seleccionar");
  const [seleccion, setSeleccion] = useState<string | null>(null);
  /** Las otras elegidas con Shift + clic, para unir. */
  const [otras, setOtras] = useState<string[]>([]);
  const [modo, setModo] = useState<"medidas" | "dibujo">("medidas");
  const [borrador, setBorrador] = useState<Punto[]>([]);
  const [cursor, setCursor] = useState<Punto | null>(null);
  const [arrastre, setArrastre] = useState<Arrastre | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const margen = escalaDe(plano) * 6;
  const encuadre = useCallback(
    (p: Plano): Vista => ({ x: -margen, y: -margen, w: p.ancho + margen * 2, h: p.largo + margen * 2 }),
    [margen],
  );
  const [vista, setVista] = useState<Vista>(() => encuadre(inicial));
  const svgRef = useRef<SVGSVGElement>(null);

  const infoGrupos = useMemo(() => new Map(grupos.map((g) => [g.id, g.info])), [grupos]);
  const elegido = plano.elementos.find((e) => e.id === seleccion) ?? null;
  const problema = problemaDelPlano(plano);
  const s = escalaDe(plano);

  /* --- Cambios con deshacer --------------------------------------------- */

  // Sin efectos adentro de los actualizadores de estado: en desarrollo React
  // los llama dos veces, y cada cambio quedaba dos veces en el historial.
  const cambiar = useCallback(
    (nuevo: Plano, guardarHistoria = true) => {
      if (guardarHistoria) setHistoria((h) => [...h.slice(-49), plano]);
      setPlano(nuevo);
      setCambios(true);
    },
    [plano],
  );

  const deshacer = useCallback(() => {
    const anterior = historia[historia.length - 1];
    if (!anterior) return;
    setPlano(anterior);
    setHistoria((h) => h.slice(0, -1));
    setCambios(true);
  }, [historia]);

  const reemplazar = (id: string, f: (e: Elemento) => Elemento, guardarHistoria = true) =>
    cambiar({ ...plano, elementos: plano.elementos.map((e) => (e.id === id ? f(e) : e)) }, guardarHistoria);

  const borrar = useCallback(
    (id: string) => {
      cambiar({ ...plano, elementos: plano.elementos.filter((e) => e.id !== id) });
      setSeleccion(null);
      setOtras([]);
    },
    [cambiar, plano],
  );

  const agregar = (e: Elemento) => {
    cambiar({ ...plano, elementos: [...plano.elementos, e] });
    setSeleccion(e.id);
    setOtras([]);
  };

  /**
   * Une las figuras elegidas en la primera. Solo límites o techados, todas del
   * mismo tipo y con lados rectos: ver `unirRectilineos`.
   */
  const elegidas = [seleccion, ...otras]
    .filter((x): x is string => x != null)
    .map((id) => plano.elementos.find((e) => e.id === id))
    .filter((e): e is Elemento => e != null);
  const unibles =
    elegidas.length >= 2 &&
    elegidas.every((e) => (e.tipo === "limite" || e.tipo === "techado") && e.tipo === elegidas[0].tipo);
  function unir() {
    const figuras = elegidas.map((e) => (e as Extract<Elemento, { puntos: Punto[] }>).puntos);
    const r = unirRectilineos(figuras);
    if ("error" in r) {
      setAviso(r.error);
      return;
    }
    const primera = elegidas[0];
    const sacar = new Set(elegidas.slice(1).map((e) => e.id));
    cambiar({
      ...plano,
      elementos: plano.elementos
        .filter((e) => !sacar.has(e.id))
        .map((e) => (e.id === primera.id ? ({ ...e, puntos: r.puntos } as Elemento) : e)),
    });
    setOtras([]);
    setAviso(`Listo: ${elegidas.length} figuras unidas en una.`);
  }

  /** Suma un rectángulo a una figura existente (para el formulario por medidas). */
  function sumarA(id: string, rect: RectUsuario): string | null {
    const destino = plano.elementos.find((e) => e.id === id);
    if (!destino || (destino.tipo !== "limite" && destino.tipo !== "techado")) return "No encontré la figura.";
    const nuevo = elementoDesdeRect(destino.tipo, rect, plano) as Extract<Elemento, { puntos: Punto[] }>;
    const r = unirRectilineos([destino.puntos, nuevo.puntos]);
    if ("error" in r) return r.error;
    reemplazar(id, (e) => ({ ...e, puntos: r.puntos }) as Elemento);
    setSeleccion(id);
    return null;
  }

  /* --- Coordenadas ------------------------------------------------------- */

  function aPlano(ev: { clientX: number; clientY: number }): Punto {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = ev.clientX;
    pt.y = ev.clientY;
    const r = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return [r.x, r.y];
  }
  const ajustar = ([x, y]: Punto): Punto => [
    Math.min(Math.max(aGrilla(x), 0), plano.ancho),
    Math.min(Math.max(aGrilla(y), 0), plano.largo),
  ];

  /* --- Terminar un trazo ------------------------------------------------- */

  const terminar = useCallback(
    (puntos: Punto[]) => {
      if (herramienta === "seleccionar" || herramienta === "rack") return;
      // El doble clic agrega dos veces el último punto: se limpian repetidos.
      const limpios = puntos.filter(
        (p, i) => i === 0 || p[0] !== puntos[i - 1][0] || p[1] !== puntos[i - 1][1],
      );
      if (limpios.length < MINIMO_DE_PUNTOS[herramienta]) {
        setAviso(`${ETIQUETA_TIPO[herramienta]}: hacen falta al menos ${MINIMO_DE_PUNTOS[herramienta]} puntos.`);
        return;
      }
      const id = nuevoId();
      const nuevo: Elemento =
        herramienta === "calle"
          ? { id, tipo: "calle", puntos: limpios, ancho: 4 }
          : ({ id, tipo: herramienta, puntos: limpios } as Elemento);
      cambiar({ ...plano, elementos: [...plano.elementos, nuevo] });
      setBorrador([]);
      setSeleccion(id);
      setAviso(null);
    },
    [cambiar, herramienta, plano],
  );

  /* --- Mouse ------------------------------------------------------------- */

  function alApretar(ev: React.PointerEvent<SVGSVGElement>) {
    if (ev.button !== 0) return;
    const p = aPlano(ev);
    const objetivo = (ev.target as Element).closest("[data-id],[data-vertice]");

    if (herramienta === "seleccionar") {
      const vertice = objetivo?.getAttribute("data-vertice");
      const idTocado = objetivo?.getAttribute("data-id");
      if (ev.shiftKey && idTocado) {
        // Shift + clic: sumar o sacar de la selección, sin mover nada.
        if (idTocado === seleccion) {
          setSeleccion(otras[0] ?? null);
          setOtras(otras.slice(1));
        } else if (otras.includes(idTocado)) {
          setOtras(otras.filter((x) => x !== idTocado));
        } else if (seleccion) {
          setOtras([...otras, idTocado]);
        } else {
          setSeleccion(idTocado);
        }
        return;
      }
      if (modo === "medidas" && idTocado) {
        // Por medidas, el lienzo solo elige: mover se hace con los números.
        setSeleccion(idTocado);
        setOtras([]);
        return;
      }
      if (vertice && seleccion && modo === "dibujo") {
        setHistoria((h) => [...h.slice(-49), plano]);
        setArrastre({ modo: "vertice", id: seleccion, indice: Number(vertice) });
      } else if (objetivo?.getAttribute("data-id")) {
        const id = objetivo.getAttribute("data-id")!;
        const original = plano.elementos.find((e) => e.id === id)!;
        setSeleccion(id);
        setOtras([]);
        setHistoria((h) => [...h.slice(-49), plano]);
        setArrastre({ modo: "mover", id, desde: ajustar(p), original });
      } else {
        setSeleccion(null);
        setOtras([]);
        setArrastre({ modo: "fondo", desdePantalla: [ev.clientX, ev.clientY], vista });
      }
      (ev.currentTarget as SVGSVGElement).setPointerCapture(ev.pointerId);
      return;
    }

    const q = ajustar(p);
    if (herramienta === "rack") {
      const id = nuevoId();
      const nuevo: Elemento = {
        id,
        tipo: "rack",
        x: Math.min(q[0], plano.ancho - 10),
        y: Math.min(q[1], plano.largo - 2.5),
        ancho: 10,
        largo: 2.5,
        rotacion: 0,
        grupoId: null,
      };
      cambiar({ ...plano, elementos: [...plano.elementos, nuevo] });
      setSeleccion(id);
      setHerramienta("seleccionar");
      return;
    }

    const puntos = [...borrador, q];
    if (esSegmento(herramienta) && puntos.length === 2) terminar(puntos);
    else setBorrador(puntos);
  }

  function alMover(ev: React.PointerEvent<SVGSVGElement>) {
    const p = aPlano(ev);
    setCursor(ajustar(p));
    if (!arrastre) return;
    if (arrastre.modo === "fondo") {
      const svg = svgRef.current!;
      const escala = arrastre.vista.w / svg.clientWidth;
      setVista({
        ...arrastre.vista,
        x: arrastre.vista.x - (ev.clientX - arrastre.desdePantalla[0]) * escala,
        y: arrastre.vista.y - (ev.clientY - arrastre.desdePantalla[1]) * escala,
      });
    } else if (arrastre.modo === "mover") {
      const q = ajustar(p);
      const movido = mover(arrastre.original, q[0] - arrastre.desde[0], q[1] - arrastre.desde[1]);
      reemplazar(arrastre.id, () => movido, false);
    } else {
      reemplazar(arrastre.id, (e) => moverVertice(e, arrastre.indice, ajustar(p)), false);
    }
  }

  function alSoltar() {
    setArrastre(null);
  }

  // La rueda hace zoom alrededor del cursor. Se engancha a mano porque React
  // registra la rueda como pasiva y entonces no se puede frenar el scroll.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const rueda = (ev: WheelEvent) => {
      ev.preventDefault();
      const factor = ev.deltaY > 0 ? 1.15 : 1 / 1.15;
      const [px, py] = aPlano(ev);
      setVista((v) => {
        const w = Math.min(Math.max(v.w * factor, 5), plano.ancho * 4 + 50);
        const k = w / v.w;
        return { x: px - (px - v.x) * k, y: py - (py - v.y) * k, w, h: v.h * k };
      });
    };
    svg.addEventListener("wheel", rueda, { passive: false });
    return () => svg.removeEventListener("wheel", rueda);
  }, [plano.ancho]);

  // Teclado: terminar, cancelar, deshacer, borrar.
  useEffect(() => {
    const tecla = (ev: KeyboardEvent) => {
      const enCampo = (ev.target as HTMLElement).closest("input,select,textarea");
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "z" && !enCampo) {
        ev.preventDefault();
        deshacer();
      } else if (ev.key === "Escape") {
        setBorrador([]);
        setHerramienta("seleccionar");
      } else if (ev.key === "Enter" && borrador.length > 0) {
        terminar(borrador);
      } else if (ev.key === "Backspace" && borrador.length > 0 && !enCampo) {
        ev.preventDefault();
        setBorrador((b) => b.slice(0, -1));
      } else if ((ev.key === "Delete" || ev.key === "Backspace") && seleccion && !enCampo && borrador.length === 0) {
        ev.preventDefault();
        borrar(seleccion);
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [borrador, borrar, deshacer, seleccion, terminar]);

  // Avisar antes de salir con cambios sin guardar.
  useEffect(() => {
    if (!cambios) return;
    const antes = (ev: BeforeUnloadEvent) => ev.preventDefault();
    window.addEventListener("beforeunload", antes);
    return () => window.removeEventListener("beforeunload", antes);
  }, [cambios]);

  function guardar() {
    setError(null);
    void ejecutar(
      () => guardarPlano({ plano, base }),
      (r) => {
        setBase(r.version);
        setCambios(false);
        setAviso("Guardado.");
        router.refresh();
      },
    );
  }

  function zoom(factor: number) {
    setVista((v) => {
      const cx = v.x + v.w / 2;
      const cy = v.y + v.h / 2;
      return { x: cx - (v.w * factor) / 2, y: cy - (v.h * factor) / 2, w: v.w * factor, h: v.h * factor };
    });
  }

  const ayuda =
    modo === "medidas"
      ? "Cargá con números en el panel de la derecha. Clic en una figura para elegirla y ver sus medidas; Shift + clic para elegir varias y unirlas."
      : HERRAMIENTAS.find((h) => h.id === herramienta)!.ayuda;
  const origen = origenDe(plano);
  const puntoOrigen = deUsuario([0, 0], plano);
  const gruposUsados = new Set(
    plano.elementos.flatMap((e) => (e.tipo === "rack" && e.grupoId != null && e.id !== seleccion ? [e.grupoId] : [])),
  );

  return (
    <div className="space-y-3">
      <p className="rounded-xl bg-amber-50 px-4 py-2 text-xs text-amber-900 ring-1 ring-amber-200 md:hidden">
        El editor está pensado para una PC con mouse. En el celular se puede mirar, pero dibujar es incómodo.
      </p>

      {/* Herramientas */}
      <div className="tarjeta flex flex-wrap items-center gap-2 p-3">
        {(["medidas", "dibujo"] as const).map((mo) => (
          <button
            key={mo}
            type="button"
            onClick={() => {
              setModo(mo);
              setHerramienta("seleccionar");
              setBorrador([]);
              setAviso(null);
            }}
            className={`rounded-lg px-3 py-2 text-sm font-semibold ${
              modo === mo ? "bg-slate-900 text-white" : "bg-white text-slate-700 ring-1 ring-slate-300"
            }`}
          >
            {mo === "medidas" ? "Por medidas" : "Dibujo libre"}
          </button>
        ))}
        <span className="mx-1 h-6 w-px bg-slate-200" />
        {modo === "dibujo" && HERRAMIENTAS.map((h) => (
          <button
            key={h.id}
            type="button"
            onClick={() => {
              setHerramienta(h.id);
              setBorrador([]);
              setAviso(null);
            }}
            className={`rounded-lg px-3 py-2 text-sm font-semibold ${
              herramienta === h.id ? "bg-slate-900 text-white" : "bg-white text-slate-700 ring-1 ring-slate-300"
            }`}
          >
            {h.etiqueta}
          </button>
        ))}
        {modo === "dibujo" && <span className="mx-1 h-6 w-px bg-slate-200" />}
        <button type="button" className="rounded-lg px-3 py-2 text-sm ring-1 ring-slate-300" onClick={() => zoom(1 / 1.3)} aria-label="Acercar">
          +
        </button>
        <button type="button" className="rounded-lg px-3 py-2 text-sm ring-1 ring-slate-300" onClick={() => zoom(1.3)} aria-label="Alejar">
          −
        </button>
        <button type="button" className="rounded-lg px-3 py-2 text-sm ring-1 ring-slate-300" onClick={() => setVista(encuadre(plano))}>
          Ver todo
        </button>
        <button type="button" className="rounded-lg px-3 py-2 text-sm ring-1 ring-slate-300 disabled:opacity-40" onClick={deshacer} disabled={historia.length === 0}>
          Deshacer
        </button>
        <span className="ml-auto flex items-center gap-2">
          {cambios && <span className="text-xs font-medium text-amber-700">Cambios sin guardar</span>}
          <button type="button" className="boton-primario min-h-10 px-4 text-sm" onClick={guardar} disabled={enviando || !cambios || !!problema}>
            {enviando ? "Guardando…" : "Guardar"}
          </button>
        </span>
      </div>

      <p className="px-1 text-xs text-slate-500">
        {ayuda}
        {borrador.length > 0 && (
          <>
            {" "}
            <strong className="text-slate-700">
              {borrador.length} punto{borrador.length === 1 ? "" : "s"}
            </strong>{" "}
            · Enter para terminar, Escape para cancelar.
          </>
        )}
      </p>

      {error && <Aviso>{error}</Aviso>}
      {problema && <Aviso tono="advertencia">{problema} Corregilo para poder guardar.</Aviso>}
      {aviso && !error && <Aviso tono={aviso === "Guardado." ? "exito" : "info"}>{aviso}</Aviso>}

      <div className="grid gap-3 lg:grid-cols-[1fr_280px]">
        {/* El lienzo */}
        <div className="tarjeta self-start overflow-hidden">
          <svg
            ref={svgRef}
            viewBox={`${vista.x} ${vista.y} ${vista.w} ${vista.h}`}
            style={{ aspectRatio: `${encuadre(plano).w} / ${encuadre(plano).h}` }}
            className={`lienzo-plano block max-h-[75vh] w-full touch-none select-none ${
              herramienta === "seleccionar" ? (arrastre ? "cursor-grabbing" : "cursor-default") : "cursor-crosshair"
            }`}
            onPointerDown={alApretar}
            onPointerMove={alMover}
            onPointerUp={alSoltar}
            onPointerLeave={() => setCursor(null)}
            onDoubleClick={() => borrador.length > 0 && terminar(borrador)}
            preserveAspectRatio="xMidYMid meet"
          >
            <rect x={0} y={0} width={plano.ancho} height={plano.largo} fill="#fff" stroke="#cbd5e1" strokeWidth={s * 0.2} />
            <Grilla plano={plano} />
            {ordenarParaDibujar(plano.elementos).map((e) => (
              <g key={e.id} data-id={e.id} className={herramienta === "seleccionar" ? "cursor-move" : ""}>
                <DibujoElemento e={e} plano={plano} grupos={infoGrupos} resaltado={e.id === seleccion || otras.includes(e.id)} />
                {/* Un trazo fino es difícil de agarrar: se le suma una franja
                    invisible más ancha para el clic. */}
                {e.tipo !== "rack" && (
                  <polyline
                    points={(esPoligono(e.tipo) ? [...e.puntos, e.puntos[0]] : e.puntos).map((p) => p.join(",")).join(" ")}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={Math.max(s * 2, e.tipo === "calle" ? e.ancho : 0)}
                  />
                )}
              </g>
            ))}

            {/* Los puntos del elegido, para arrastrarlos. */}
            {elegido && elegido.tipo !== "rack" && herramienta === "seleccionar" && modo === "dibujo" &&
              elegido.puntos.map(([x, y], i) => (
                <circle key={i} data-vertice={i} cx={x} cy={y} r={s * 0.9} fill="#fff" stroke="#0f172a" strokeWidth={s * 0.3} className="cursor-pointer" />
              ))}

            {/* El trazo que se está dibujando. */}
            {borrador.length > 0 && (
              <g pointerEvents="none">
                <polyline
                  points={[...borrador, ...(cursor ? [cursor] : [])].map((p) => p.join(",")).join(" ")}
                  fill="none"
                  stroke="#0f172a"
                  strokeWidth={s * 0.3}
                  strokeDasharray={`${s} ${s * 0.5}`}
                />
                {borrador.map(([x, y], i) => (
                  <circle key={i} cx={x} cy={y} r={s * 0.6} fill="#0f172a" />
                ))}
              </g>
            )}

            {/* Los ejes de referencia: desde acá se miden X e Y. */}
            <g pointerEvents="none">
              <line x1={puntoOrigen[0]} y1={puntoOrigen[1]} x2={puntoOrigen[0] + s * 8} y2={puntoOrigen[1]} stroke="#dc2626" strokeWidth={s * 0.3} />
              <line x1={puntoOrigen[0]} y1={puntoOrigen[1]} x2={puntoOrigen[0]} y2={puntoOrigen[1] - s * 8} stroke="#dc2626" strokeWidth={s * 0.3} />
              <circle cx={puntoOrigen[0]} cy={puntoOrigen[1]} r={s * 0.6} fill="#dc2626" />
              <text x={puntoOrigen[0] + s * 8.5} y={puntoOrigen[1] + s * 0.6} fontSize={s * 1.6} fontWeight={700} fill="#dc2626">X</text>
              <text x={puntoOrigen[0] - s * 0.6} y={puntoOrigen[1] - s * 8.8} fontSize={s * 1.6} fontWeight={700} fill="#dc2626">Y</text>
            </g>

            {cursor && (herramienta !== "seleccionar" || modo === "medidas") && (
              <g pointerEvents="none">
                <circle cx={cursor[0]} cy={cursor[1]} r={s * 0.5} fill="none" stroke="#2a78d6" strokeWidth={s * 0.2} />
                <text x={cursor[0] + s} y={cursor[1] - s} fontSize={s * 1.4} fill="#2a78d6" paintOrder="stroke" stroke="#fff" strokeWidth={s * 0.4}>
                  X {aUsuario(cursor, plano)[0].toLocaleString("es-AR")} · Y {aUsuario(cursor, plano)[1].toLocaleString("es-AR")}
                </text>
              </g>
            )}
            <Escala plano={plano} />
          </svg>
        </div>

        {/* El panel */}
        <aside className="space-y-3">
          <div className="tarjeta space-y-2 p-4">
            <p className="text-sm font-bold text-slate-900">Espacio de trabajo</p>
            <div className="grid grid-cols-2 gap-2">
              <Numero etiqueta="Ancho (m)" valor={plano.ancho} cambiar={(v) => cambiar({ ...plano, ancho: v })} />
              <Numero etiqueta="Largo (m)" valor={plano.largo} cambiar={(v) => cambiar({ ...plano, largo: v })} />
            </div>
            <p className="text-xs text-slate-500">Todo lo que se dibuja tiene que quedar adentro.</p>
            <p className="pt-1 text-xs font-semibold text-slate-700">Ejes de referencia (en rojo)</p>
            <div className="grid grid-cols-2 gap-2">
              <Medida
                etiqueta="Desde la izquierda (m)"
                valor={origen.x}
                cambiar={(v) => cambiar({ ...plano, origen: { ...origen, x: v } })}
                negativos
                cero
              />
              <Medida
                etiqueta="Desde abajo (m)"
                valor={origen.y}
                cambiar={(v) => cambiar({ ...plano, origen: { ...origen, y: v } })}
                negativos
                cero
              />
            </div>
            <p className="text-xs text-slate-500">
              Dónde está el (0,0). X crece hacia la derecha e Y hacia arriba. Correrlo no mueve nada: cambia desde dónde se mide.
            </p>
          </div>

          {otras.length > 0 && (
            <div className="tarjeta space-y-2 p-4">
              <p className="text-sm font-bold text-slate-900">{elegidas.length} figuras elegidas</p>
              {unibles ? (
                <>
                  <button type="button" className="boton-primario min-h-10 w-full text-sm" onClick={unir}>
                    Unir en una sola
                  </button>
                  <p className="text-xs text-slate-500">
                    Suma las áreas y rearma el perímetro. Se tienen que tocar por un lado y tener lados horizontales y verticales.
                  </p>
                </>
              ) : (
                <p className="text-xs text-slate-500">
                  Solo se pueden unir límites con límites o techados con techados.
                </p>
              )}
            </div>
          )}

          {modo === "medidas" && (
            <FormularioPorMedidas
              plano={plano}
              grupos={grupos}
              gruposUsados={new Set(plano.elementos.flatMap((e) => (e.tipo === "rack" && e.grupoId != null ? [e.grupoId] : [])))}
              agregar={agregar}
              sumarA={sumarA}
            />
          )}

          {elegido ? (
            <div className="tarjeta space-y-3 p-4">
              <p className="text-sm font-bold text-slate-900">{ETIQUETA_TIPO[elegido.tipo]}</p>
              <label className="block text-xs text-slate-600">
                Nombre (opcional)
                <input
                  className="campo mt-1 py-2"
                  value={elegido.etiqueta ?? ""}
                  maxLength={60}
                  onChange={(ev) => reemplazar(elegido.id, (e) => ({ ...e, etiqueta: ev.target.value || undefined }))}
                  placeholder={elegido.tipo === "frente" ? "Av. Siempreviva" : elegido.tipo === "acceso" ? "Portón 1" : ""}
                />
              </label>

              {modo === "medidas" && (
                <MedidasDelElemento
                  elemento={elegido}
                  plano={plano}
                  cambiar={(nuevo) => reemplazar(elegido.id, () => nuevo)}
                />
              )}

              {elegido.tipo === "rack" && (
                <>
                  <label className="block text-xs text-slate-600">
                    Grupo de racks
                    <select
                      className="campo mt-1 py-2"
                      value={elegido.grupoId ?? ""}
                      onChange={(ev) =>
                        reemplazar(elegido.id, (e) => ({ ...e, grupoId: ev.target.value ? Number(ev.target.value) : null }) as Elemento)
                      }
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
                  {modo === "dibujo" && (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <Numero etiqueta="Ancho (m)" valor={elegido.ancho} cambiar={(v) => reemplazar(elegido.id, (e) => ({ ...e, ancho: v }) as Elemento)} />
                        <Numero etiqueta="Largo (m)" valor={elegido.largo} cambiar={(v) => reemplazar(elegido.id, (e) => ({ ...e, largo: v }) as Elemento)} />
                      </div>
                      <button type="button" className="boton-secundario min-h-10 w-full text-sm" onClick={() => reemplazar(elegido.id, girar)}>
                        Girar 90°
                      </button>
                    </>
                  )}
                  <p className="text-xs text-slate-500">
                    Ocupa {m(esquinasDeRack(elegido)[1][0] - esquinasDeRack(elegido)[0][0])} ×{" "}
                    {m(esquinasDeRack(elegido)[2][1] - esquinasDeRack(elegido)[1][1])} en el plano.
                  </p>
                </>
              )}

              {elegido.tipo === "calle" && modo === "dibujo" && (
                <>
                  <Numero etiqueta="Ancho de la calle (m)" valor={elegido.ancho} cambiar={(v) => reemplazar(elegido.id, (e) => ({ ...e, ancho: v }) as Elemento)} />
                  <p className="text-xs text-slate-500">Recorrido: {m(largo(elegido.puntos))}.</p>
                </>
              )}

              {(elegido.tipo === "limite" || elegido.tipo === "techado") && (
                <p className="text-xs text-slate-500">
                  {Math.round(superficie(elegido.puntos)).toLocaleString("es-AR")} m² · perímetro {m(largo(elegido.puntos, true))}
                </p>
              )}

              {(elegido.tipo === "acceso" || elegido.tipo === "frente") && (
                <p className="text-xs text-slate-500">Mide {m(largo(elegido.puntos))}.</p>
              )}

              {elegido.tipo !== "rack" && modo === "dibujo" && (
                <p className="text-xs text-slate-500">Arrastrá los puntos blancos para cambiar la forma.</p>
              )}
              {(elegido.tipo === "limite" || elegido.tipo === "techado") && (
                <p className="text-xs text-slate-500">Para sumarle otra figura: Shift + clic en las dos y «Unir en una sola».</p>
              )}

              <button type="button" className="boton-peligro min-h-10 w-full text-sm" onClick={() => borrar(elegido.id)}>
                Borrar
              </button>
            </div>
          ) : (
            <div className="tarjeta p-4 text-xs text-slate-500">
              Hacé clic en algo del plano para ver y cambiar sus datos.
            </div>
          )}

          <ResumenDePlano plano={plano} grupos={grupos} />
        </aside>
      </div>
    </div>
  );
}

function Numero({ etiqueta, valor, cambiar }: { etiqueta: string; valor: number; cambiar: (v: number) => void }) {
  // Se edita como texto y se aplica al salir del campo: si se aplicara en cada
  // tecla, escribir "12" pasaría por "1" y el plano saltaría.
  const [texto, setTexto] = useState(String(valor).replace(".", ","));
  useEffect(() => setTexto(String(valor).replace(".", ",")), [valor]);
  return (
    <label className="block text-xs text-slate-600">
      {etiqueta}
      <input
        className="campo mt-1 py-2"
        inputMode="decimal"
        value={texto}
        onChange={(ev) => setTexto(ev.target.value.replace(/[^\d,.]/g, ""))}
        onBlur={() => {
          const v = Number(texto.replace(",", "."));
          if (Number.isFinite(v) && v > 0 && v !== valor) cambiar(v);
          else setTexto(String(valor).replace(".", ","));
        }}
      />
    </label>
  );
}

function ResumenDePlano({
  plano,
  grupos,
}: {
  plano: Plano;
  grupos: Array<{ id: number; codigo: string }>;
}) {
  const cuenta = (t: TipoElemento) => plano.elementos.filter((e) => e.tipo === t).length;
  const enPlano = new Set(plano.elementos.flatMap((e) => (e.tipo === "rack" && e.grupoId != null ? [e.grupoId] : [])));
  const faltan = grupos.filter((g) => !enPlano.has(g.id));
  return (
    <div className="tarjeta space-y-1 p-4 text-xs text-slate-600">
      <p className="text-sm font-bold text-slate-900">En el plano</p>
      {(["limite", "techado", "rack", "calle", "acceso", "frente"] as const).map((t) => (
        <p key={t} className="flex justify-between">
          <span>{ETIQUETA_TIPO[t]}</span>
          <span className="cifra text-slate-900">{cuenta(t)}</span>
        </p>
      ))}
      {faltan.length > 0 && (
        <p className="pt-1 text-amber-800">
          Grupos sin dibujar: {faltan.map((g) => g.codigo).join(", ")}.
        </p>
      )}
    </div>
  );
}
