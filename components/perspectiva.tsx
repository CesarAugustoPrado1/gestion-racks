import { nombreDeNivel } from "@/lib/posiciones";
import { confianza, nivel as nivelDeConfianza } from "@/lib/confiabilidad";
import type { ReactNode } from "react";
import {
  centro,
  comoPuntos,
  huecoPenetrable,
  huecoSelectivo,
  MEDIDAS,
  puntoPenetrable,
  tamanoPenetrable,
  tamanoSelectivo,
  xDeModulo,
  type Punto,
} from "@/lib/perspectiva";
import type { CeldaDelMapa, GrupoDelMapa } from "@/lib/consultas";
import { pintarCelda, type Vista } from "./mapa";

/**
 * Un grupo de racks dibujado en perspectiva, como se lo ve parado en el galpón.
 *
 * La geometría vive en lib/perspectiva.ts y está probada: los bordes de arriba
 * y de abajo de cada hueco son paralelos al piso. Acá solo se pinta.
 *
 * Los colores son los mismos del mapa plano -la línea, o la confiabilidad- y la
 * letra adentro de cada hueco también, así las dos vistas se leen igual. El
 * texto va siempre en tinta, nunca del color de la línea.
 */

const MARGEN = { izq: 16, der: 16, arriba: 30, abajo: 58 };

type Estilo = {
  fill: string;
  fillOpacity?: number;
  stroke: string;
  dash?: string;
  texto: string;
};

function estilo(celda: CeldaDelMapa, vista: Vista, semivida: number, rayas: string): Estilo {
  const tinta = "var(--color-slate-800)";
  if (!celda.activa) {
    return { fill: "transparent", stroke: "var(--color-slate-200)", dash: "2 3", texto: tinta };
  }
  if (!celda.bulto && celda.invasor) {
    return { fill: "var(--color-slate-200)", stroke: "var(--color-slate-400)", texto: "var(--color-slate-500)" };
  }
  if (!celda.bulto && celda.fueraDeUso) {
    return { fill: `url(#${rayas})`, stroke: "var(--color-slate-300)", texto: "var(--color-slate-400)" };
  }
  if (!celda.bulto) {
    return { fill: "#fff", stroke: "var(--color-slate-300)", texto: tinta };
  }
  const b = celda.bulto;
  if (b.esObjeto) {
    return { fill: "var(--color-slate-200)", stroke: "var(--color-slate-500)", dash: "3 2", texto: tinta };
  }
  if (vista === "confiabilidad") {
    const n = nivelDeConfianza(confianza(b, semivida));
    const color = {
      alta: ["--color-confiable-suave", "--color-confiable"],
      media: ["--color-dudoso-suave", "--color-dudoso"],
      baja: ["--color-vencido-suave", "--color-vencido"],
      sin_datos: ["--color-sin-datos-suave", "--color-slate-300"],
    }[n];
    return { fill: `var(${color[0]})`, stroke: `var(${color[1]})`, texto: tinta };
  }
  const i = b.lineaOrden;
  const linea = i < 3 ? `var(--color-linea-${i + 1})` : "var(--color-slate-400)";
  return { fill: linea, fillOpacity: 0.18, stroke: linea, texto: tinta };
}

function Hueco({
  celda,
  esquinas,
  vista,
  semivida,
  abrev,
  rayas,
}: {
  celda: CeldaDelMapa;
  esquinas: Punto[];
  vista: Vista;
  semivida: number;
  abrev: Record<string, string>;
  rayas: string;
}) {
  const { letra, titulo } = pintarCelda(celda, vista, semivida, abrev);
  const e = estilo(celda, vista, semivida, rayas);
  const [cx, cy] = centro(esquinas);
  return (
    <a href={`/racks/${celda.posicionId}`} className="group">
      <title>{titulo}</title>
      <polygon
        points={comoPuntos(esquinas)}
        fill={e.fill}
        fillOpacity={e.fillOpacity}
        stroke={e.stroke}
        strokeWidth={1.5}
        strokeDasharray={e.dash}
        className="transition group-hover:stroke-slate-900"
        style={{ strokeLinejoin: "round" }}
      />
      {letra && (
        <text
          x={cx}
          y={cy + 4}
          textAnchor="middle"
          fontSize={11}
          fontWeight={700}
          fill={e.texto}
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {letra}
        </text>
      )}
      {celda.bulto?.ajeno && (
        <g>
          <circle cx={cx + 11} cy={cy - 10} r={6} fill="var(--color-amber-500)" />
          <text x={cx + 11} y={cy - 7} textAnchor="middle" fontSize={9} fontWeight={700} fill="#fff">
            !
          </text>
        </g>
      )}
    </a>
  );
}

export function PerspectivaDeGrupo({
  grupo,
  vista,
  semivida,
  abrev,
}: {
  grupo: GrupoDelMapa;
  vista: Vista;
  semivida: number;
  abrev: Record<string, string>;
}) {
  const rayas = `rayas-${grupo.id}`;
  const encabezado = (
    <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 pt-4">
      <h2 className="text-base font-bold text-slate-900">
        Grupo {grupo.codigo}
        {grupo.empresa && (
          <span className="ml-2 chip bg-slate-100 align-middle text-slate-600">{grupo.empresa}</span>
        )}
        {grupo.enCarga && (
          <span className="ml-2 chip bg-sky-100 align-middle text-sky-900">en carga inicial</span>
        )}
      </h2>
      <p className="text-xs text-slate-500">
        {grupo.nombre ? `${grupo.nombre} · ` : ""}
        {grupo.penetrable
          ? `${grupo.unidades} calles de ${grupo.niveles} × ${grupo.profundidad} · se entra por la ${grupo.acceso}`
          : `${grupo.unidades} módulos de ${grupo.ancho} × ${grupo.niveles}`}
      </p>
    </header>
  );

  const patron = (
    <defs>
      <pattern id={rayas} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="6" height="6" fill="var(--color-slate-100)" />
        <line x1="0" y1="0" x2="0" y2="6" stroke="var(--color-slate-300)" strokeWidth="2" />
      </pattern>
    </defs>
  );

  return (
    <section id={`grupo-${grupo.codigo}`} className="tarjeta scroll-mt-20 overflow-hidden">
      {encabezado}
      <div className="overflow-x-auto p-4">
        {grupo.penetrable ? (
          <Penetrable {...{ grupo, vista, semivida, abrev, rayas, patron }} />
        ) : (
          <Selectivo {...{ grupo, vista, semivida, abrev, rayas, patron }} />
        )}
      </div>
    </section>
  );
}

type PropsDibujo = {
  grupo: GrupoDelMapa;
  vista: Vista;
  semivida: number;
  abrev: Record<string, string>;
  rayas: string;
  patron: ReactNode;
};

function Penetrable({ grupo, vista, semivida, abrev, rayas, patron }: PropsDibujo) {
  const g = {
    calles: grupo.unidades,
    niveles: grupo.niveles,
    profundidad: grupo.profundidad ?? 1,
    acceso: grupo.acceso,
  };
  const t = tamanoPenetrable(g);
  // Lugar para los nombres de los niveles, del lado del pasillo.
  const etiquetas = 52;
  const izq = MARGEN.izq + (g.acceso === "izquierda" ? etiquetas : 0);
  const ancho = izq + t.ancho + MARGEN.der + (g.acceso === "derecha" ? etiquetas : 0);
  const alto = MARGEN.arriba + t.alto + MARGEN.abajo;
  const origen: Punto = [izq, MARGEN.arriba + t.alto];
  const p = (c: number, n: number, d: number) => puntoPenetrable(g, c, n, d, origen);
  const pasilloY = origen[1] + 26;

  // Los nombres de los niveles, junto a la calle del lado por donde se entra.
  const calleDelBorde = g.acceso === "derecha" ? g.calles - 1 : 0;
  const lado = g.acceso === "derecha" ? 1 : -1;

  return (
    <svg width={ancho} height={alto} viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label={`Grupo ${grupo.codigo} en perspectiva`} className="font-sans">
      {patron}
      {Array.from({ length: g.calles }, (_, c) => {
        const piso = [p(c, 0, 0), p(c, 0, g.profundidad)];
        const pared = [p(c, 0, g.profundidad), p(c, g.niveles, g.profundidad)];
        const celdas = grupo.celdas.filter((x) => x.unidad === c + 1);
        // Del fondo hacia el pasillo: lo de adelante se dibuja encima.
        const orden = [...celdas].sort((a, b) => (b.profundidad ?? 1) - (a.profundidad ?? 1));
        return (
          <g key={c}>
            <line x1={piso[0][0]} y1={piso[0][1]} x2={piso[1][0]} y2={piso[1][1]} stroke="var(--color-slate-400)" strokeWidth={2} strokeLinecap="round" />
            <line x1={pared[0][0]} y1={pared[0][1]} x2={pared[1][0]} y2={pared[1][1]} stroke="var(--color-slate-400)" strokeWidth={2} strokeLinecap="round" />
            {orden.map((celda) => (
              <Hueco
                key={celda.posicionId}
                celda={celda}
                esquinas={huecoPenetrable(g, c, celda.nivel - 1, (celda.profundidad ?? 1) - 1, origen)}
                vista={vista}
                semivida={semivida}
                abrev={abrev}
                rayas={rayas}
              />
            ))}
            <text
              x={(piso[0][0] + piso[1][0]) / 2}
              y={pasilloY - 8}
              textAnchor="middle"
              fontSize={12}
              fontWeight={700}
              fill="var(--color-slate-700)"
            >
              {c + 1}
            </text>
          </g>
        );
      })}

      {Array.from({ length: g.niveles }, (_, n) => {
        const [x, y] = p(calleDelBorde, n + 0.5, 0);
        return (
          <text key={n} x={x + lado * 8} y={y + 4} textAnchor={lado > 0 ? "start" : "end"} fontSize={10} fill="var(--color-slate-500)">
            {nombreDeNivel(n + 1, g.niveles)}
          </text>
        );
      })}

      {(() => {
        const [x, y] = p(g.acceso === "derecha" ? 0 : g.calles - 1, g.niveles, g.profundidad);
        return (
          <text x={x} y={y - 8} textAnchor="middle" fontSize={10} fill="var(--color-slate-500)">
            pared
          </text>
        );
      })()}

      <line x1={izq - 8} y1={pasilloY} x2={izq + t.ancho + 8} y2={pasilloY} stroke="var(--color-slate-800)" strokeWidth={2} strokeLinecap="round" />
      <text
        x={g.acceso === "derecha" ? izq + t.ancho + 8 : izq - 8}
        y={pasilloY + 18}
        textAnchor={g.acceso === "derecha" ? "end" : "start"}
        fontSize={11}
        fill="var(--color-slate-600)"
      >
        {g.acceso === "derecha" ? "pasillo · el clark entra por acá →" : "← el clark entra por acá · pasillo"}
      </text>
    </svg>
  );
}

function Selectivo({ grupo, vista, semivida, abrev, rayas, patron }: PropsDibujo) {
  const g = { modulos: grupo.unidades, ancho: grupo.ancho ?? 1, niveles: grupo.niveles };
  const t = tamanoSelectivo(g);
  const etiquetas = 52;
  const izq = MARGEN.izq + etiquetas;
  const ancho = izq + t.ancho + MARGEN.der;
  const alto = MARGEN.arriba + t.alto + MARGEN.abajo - 20;
  const origen: Punto = [izq, MARGEN.arriba + t.alto];
  const { fondoX: fx, fondoY: fy, alto: h, anchoSelectivo: w } = MEDIDAS;

  return (
    <svg width={ancho} height={alto} viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label={`Grupo ${grupo.codigo} en perspectiva`} className="font-sans">
      {patron}
      {Array.from({ length: g.modulos }, (_, m) => {
        const x0 = origen[0] + xDeModulo(g, m);
        const x1 = x0 + g.ancho * w;
        const yPiso = origen[1];
        const yTecho = origen[1] - g.niveles * h;
        // El volumen: la cara de arriba y la del costado, finitas y en gris. Las
        // dos con bordes paralelos al frente o al fondo, nunca inclinados al azar.
        const arriba: Punto[] = [[x0, yTecho], [x1, yTecho], [x1 + fx, yTecho - fy], [x0 + fx, yTecho - fy]];
        const costado: Punto[] = [[x1, yPiso], [x1 + fx, yPiso - fy], [x1 + fx, yTecho - fy], [x1, yTecho]];
        const celdas = grupo.celdas.filter((x) => x.unidad === m + 1);
        return (
          <g key={m}>
            <polygon points={comoPuntos(arriba)} fill="var(--color-slate-100)" stroke="var(--color-slate-300)" strokeWidth={1} />
            <polygon points={comoPuntos(costado)} fill="var(--color-slate-200)" stroke="var(--color-slate-300)" strokeWidth={1} />
            <line x1={x0 - 2} y1={yPiso} x2={x1 + 2} y2={yPiso} stroke="var(--color-slate-400)" strokeWidth={2} strokeLinecap="round" />
            {celdas.map((celda) => (
              <Hueco
                key={celda.posicionId}
                celda={celda}
                esquinas={huecoSelectivo(g, m, ((celda.columna ?? 1) - 1) % g.ancho, celda.nivel - 1, origen)}
                vista={vista}
                semivida={semivida}
                abrev={abrev}
                rayas={rayas}
              />
            ))}
            <text x={(x0 + x1) / 2} y={yPiso + 18} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--color-slate-700)">
              {m + 1}
            </text>
          </g>
        );
      })}
      {Array.from({ length: g.niveles }, (_, n) => (
        <text key={n} x={izq - 8} y={origen[1] - (n + 0.5) * h + 4} textAnchor="end" fontSize={10} fill="var(--color-slate-500)">
          {nombreDeNivel(n + 1, g.niveles)}
        </text>
      ))}
    </svg>
  );
}
