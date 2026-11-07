/**
 * Los períodos de las estadísticas y los momentos de los resúmenes. Módulo
 * PURO: sin base y sin reloj propio -el "ahora" se recibe-, para poder
 * probarlo entero.
 *
 * Todo va en hora de Argentina, que es UTC-3 fijo (sin horario de verano desde
 * 2009). Un día es de 00:00 a 00:00 de Argentina, no de UTC: agrupar en UTC
 * corre a otro día todo lo que pasa después de las 21.
 *
 * Las semanas empiezan el LUNES, como en la planta y como `date_trunc('week')`
 * de Postgres.
 */

export const TZ = "America/Argentina/Buenos_Aires";
const OFFSET = "-03:00";
const DIA_MS = 86_400_000;

/** "2026-11-07" en Argentina, para un instante. */
export function diaDe(instante: Date): string {
  return new Date(instante.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
}

/** El instante en que empieza ese día en Argentina. */
export function inicioDelDia(dia: string): Date {
  return new Date(`${dia}T00:00:00${OFFSET}`);
}

export function sumarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00Z`);
  return new Date(d.getTime() + n * DIA_MS).toISOString().slice(0, 10);
}

/** Mismo día, `n` meses antes o después; si no existe (31 de un mes de 30), el último. */
export function sumarMeses(dia: string, n: number): string {
  const [a, m, d] = dia.split("-").map(Number);
  const total = a * 12 + (m - 1) + n;
  const anio = Math.floor(total / 12);
  const mes = (total % 12) + 1;
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return `${anio}-${String(mes).padStart(2, "0")}-${String(Math.min(d, ultimo)).padStart(2, "0")}`;
}

/** El lunes de la semana de ese día. */
export function lunesDe(dia: string): string {
  const semana = new Date(`${dia}T12:00:00Z`).getUTCDay(); // 0 domingo
  return sumarDias(dia, -((semana + 6) % 7));
}

export const esDia = (s: string | undefined | null): s is string =>
  !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T12:00:00Z`).getTime());

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** "7 de noviembre" (y el año si no es el actual). */
export function fechaLarga(dia: string, hoy?: string): string {
  const [a, m, d] = dia.split("-").map(Number);
  const anio = hoy && hoy.slice(0, 4) === dia.slice(0, 4) ? "" : ` de ${a}`;
  return `${d} de ${MESES[m - 1]}${anio}`;
}

/** "sáb 7/11". */
export function fechaCorta(dia: string): string {
  const semana = new Date(`${dia}T12:00:00Z`).getUTCDay();
  return `${DIAS_SEMANA[semana].slice(0, 3)} ${Number(dia.slice(8, 10))}/${Number(dia.slice(5, 7))}`;
}

export const nombreDeMes = (dia: string) => MESES[Number(dia.slice(5, 7)) - 1];

/* -------------------------------------------------------------------------- */
/* Períodos (estadísticas)                                                    */
/* -------------------------------------------------------------------------- */

export const PERIODOS_FIJOS = [
  { id: "hoy", etiqueta: "Hoy" },
  { id: "ayer", etiqueta: "Ayer" },
  { id: "anteayer", etiqueta: "Anteayer" },
  { id: "semana", etiqueta: "Esta semana" },
  { id: "semana_anterior", etiqueta: "Semana anterior" },
  { id: "mes", etiqueta: "Mes en curso" },
  { id: "mes_anterior", etiqueta: "Mes anterior" },
  { id: "30d", etiqueta: "Últimos 30 días" },
  { id: "90d", etiqueta: "Últimos 90 días" },
  { id: "anio", etiqueta: "Año en curso" },
] as const;

export type IdPeriodo = (typeof PERIODOS_FIJOS)[number]["id"] | "rango";
export type Granularidad = "hora" | "dia" | "semana" | "mes";

/** Cuánto se corre un período para llegar al anterior equivalente. */
type Paso = { dias: number } | { meses: number };

export type Rango = {
  id: IdPeriodo;
  /** "Mes en curso", "Del 3 al 9 de octubre". */
  etiqueta: string;
  /** Primer y último día, inclusive. */
  desdeDia: string;
  hastaDia: string;
  /** El intervalo real, [inicio, fin). `fin` nunca pasa de ahora. */
  inicio: Date;
  fin: Date;
  /** Si el período todavía no terminó (hoy, esta semana, el mes en curso). */
  enCurso: boolean;
  granularidad: Granularidad;
  paso: Paso;
};

function granularidadPara(dias: number): Granularidad {
  if (dias <= 1) return "hora";
  if (dias <= 92) return "dia";
  if (dias <= 200) return "semana";
  return "mes";
}

function armar(
  id: IdPeriodo,
  etiqueta: string,
  desdeDia: string,
  hastaDia: string,
  paso: Paso,
  ahora: Date,
): Rango {
  const inicio = inicioDelDia(desdeDia);
  const finDelPeriodo = inicioDelDia(sumarDias(hastaDia, 1));
  const enCurso = finDelPeriodo.getTime() > ahora.getTime();
  const dias = Math.round((finDelPeriodo.getTime() - inicio.getTime()) / DIA_MS);
  return {
    id,
    etiqueta,
    desdeDia,
    hastaDia,
    inicio,
    fin: enCurso ? ahora : finDelPeriodo,
    enCurso,
    granularidad: granularidadPara(dias),
    paso,
  };
}

/**
 * El período pedido en la URL: `?p=semana`, o `?desde=2026-10-01&hasta=2026-10-15`.
 * Cualquier cosa rara vuelve al mes en curso, que es lo más consultado.
 */
export function leerRango(
  q: { p?: string; desde?: string; hasta?: string },
  ahora: Date,
): Rango {
  const hoy = diaDe(ahora);

  if (esDia(q.desde) && esDia(q.hasta)) {
    let [d, h] = q.desde <= q.hasta ? [q.desde, q.hasta] : [q.hasta, q.desde];
    if (h > hoy) h = hoy;
    if (d > hoy) d = hoy;
    const largo = Math.round((inicioDelDia(h).getTime() - inicioDelDia(d).getTime()) / DIA_MS) + 1;
    const etiqueta =
      d === h ? fechaLarga(d, hoy) : `Del ${fechaLarga(d, hoy)} al ${fechaLarga(h, hoy)}`;
    return armar("rango", etiqueta, d, h, { dias: largo }, ahora);
  }

  const lunes = lunesDe(hoy);
  const primeroDelMes = `${hoy.slice(0, 7)}-01`;
  switch (q.p) {
    case "hoy":
      return armar("hoy", "Hoy", hoy, hoy, { dias: 1 }, ahora);
    case "ayer":
      return armar("ayer", "Ayer", sumarDias(hoy, -1), sumarDias(hoy, -1), { dias: 1 }, ahora);
    case "anteayer":
      return armar("anteayer", "Anteayer", sumarDias(hoy, -2), sumarDias(hoy, -2), { dias: 1 }, ahora);
    case "semana":
      return armar("semana", "Esta semana", lunes, sumarDias(lunes, 6), { dias: 7 }, ahora);
    case "semana_anterior":
      return armar("semana_anterior", "Semana anterior", sumarDias(lunes, -7), sumarDias(lunes, -1), { dias: 7 }, ahora);
    case "mes_anterior": {
      const desde = sumarMeses(primeroDelMes, -1);
      return armar("mes_anterior", `Mes anterior (${nombreDeMes(desde)})`, desde, sumarDias(primeroDelMes, -1), { meses: 1 }, ahora);
    }
    case "30d":
      return armar("30d", "Últimos 30 días", sumarDias(hoy, -29), hoy, { dias: 30 }, ahora);
    case "90d":
      return armar("90d", "Últimos 90 días", sumarDias(hoy, -89), hoy, { dias: 90 }, ahora);
    case "anio":
      return armar("anio", "Año en curso", `${hoy.slice(0, 4)}-01-01`, `${hoy.slice(0, 4)}-12-31`, { meses: 12 }, ahora);
    case "mes":
    default:
      return armar(
        "mes",
        `Mes en curso (${nombreDeMes(hoy)})`,
        primeroDelMes,
        sumarDias(sumarMeses(primeroDelMes, 1), -1),
        { meses: 1 },
        ahora,
      );
  }
}

function correr(instante: Date, paso: Paso): Date {
  if ("dias" in paso) return new Date(instante.getTime() - paso.dias * DIA_MS);
  // En meses: se corre el día calendario y se conserva la hora del día.
  const dia = diaDe(instante);
  const delDia = instante.getTime() - inicioDelDia(dia).getTime();
  return new Date(inicioDelDia(sumarMeses(dia, -paso.meses)).getTime() + delDia);
}

/**
 * El período anterior EQUIVALENTE, para comparar: se corren las dos puntas un
 * paso. Así un período en curso se compara con el mismo tramo del anterior -del
 * 1 al 7 de noviembre contra del 1 al 7 de octubre, hoy hasta esta hora contra
 * ayer hasta esta hora- y no contra uno entero, que siempre "ganaría".
 */
export function rangoAnterior(r: Rango): { inicio: Date; fin: Date; etiqueta: string } {
  const inicio = correr(r.inicio, r.paso);
  const fin = correr(r.fin, r.paso);
  const tramo = r.enCurso ? ", mismo tramo" : "";
  const etiquetas: Record<IdPeriodo, string> = {
    hoy: "ayer a esta hora",
    ayer: "anteayer",
    anteayer: "el día anterior",
    semana: `la semana anterior${tramo}`,
    semana_anterior: "la semana previa",
    mes: `${nombreDeMes(diaDe(inicio))}${tramo}`,
    mes_anterior: nombreDeMes(diaDe(inicio)),
    "30d": "los 30 días previos",
    "90d": "los 90 días previos",
    anio: `el año anterior${tramo}`,
    rango: "el período previo del mismo largo",
  };
  return { inicio, fin, etiqueta: etiquetas[r.id] };
}

/* -------------------------------------------------------------------------- */
/* Tramos de los gráficos                                                     */
/* -------------------------------------------------------------------------- */

export type Tramo = {
  /** Igual a lo que devuelve `claveSql` para un movimiento de ese tramo. */
  clave: string;
  inicio: Date;
  fin: Date;
  /** Para el eje y el tooltip. */
  etiqueta: string;
};

/** El formato con que Postgres agrupa: `to_char(date_trunc(g, t at time zone TZ), FORMATO)`. */
export const FORMATO_SQL: Record<Granularidad, string> = {
  hora: "YYYY-MM-DD HH24",
  dia: "YYYY-MM-DD",
  semana: "YYYY-MM-DD",
  mes: "YYYY-MM",
};

/**
 * Los tramos de un período, completos y en orden, incluso los vacíos. Sin
 * esto un gráfico salta del lunes al jueves sin avisar, y dos días tranquilos
 * se leen como uno. Un período en curso llega hasta el tramo actual.
 */
export function tramosDe(r: Rango): Tramo[] {
  const salida: Tramo[] = [];
  const hasta = r.fin.getTime();
  if (r.granularidad === "hora") {
    for (let h = 0; h < 24; h++) {
      const inicio = new Date(r.inicio.getTime() + h * 3_600_000);
      if (inicio.getTime() >= hasta) break;
      const hh = String(h).padStart(2, "0");
      salida.push({
        clave: `${r.desdeDia} ${hh}`,
        inicio,
        fin: new Date(inicio.getTime() + 3_600_000),
        etiqueta: `${hh} h`,
      });
    }
    return salida;
  }

  let dia = r.granularidad === "semana" ? lunesDe(r.desdeDia) : r.granularidad === "mes" ? `${r.desdeDia.slice(0, 7)}-01` : r.desdeDia;
  while (inicioDelDia(dia).getTime() < hasta) {
    const siguiente =
      r.granularidad === "dia" ? sumarDias(dia, 1) : r.granularidad === "semana" ? sumarDias(dia, 7) : sumarMeses(dia, 1);
    salida.push({
      clave: r.granularidad === "mes" ? dia.slice(0, 7) : dia,
      // El primer tramo empieza donde empieza el período, aunque la semana o el mes empiecen antes.
      inicio: new Date(Math.max(inicioDelDia(dia).getTime(), r.inicio.getTime())),
      fin: new Date(Math.min(inicioDelDia(siguiente).getTime(), inicioDelDia(sumarDias(r.hastaDia, 1)).getTime())),
      etiqueta:
        r.granularidad === "dia"
          ? fechaCorta(dia)
          : r.granularidad === "semana"
            ? `sem. ${Number(dia.slice(8, 10))}/${Number(dia.slice(5, 7))}`
            : nombreDeMes(dia).slice(0, 3),
    });
    dia = siguiente;
  }
  return salida;
}

/** "por hora", "por día"… para los títulos. */
export const POR: Record<Granularidad, string> = {
  hora: "por hora",
  dia: "por día",
  semana: "por semana",
  mes: "por mes",
};

/* -------------------------------------------------------------------------- */
/* Momentos (resúmenes)                                                       */
/* -------------------------------------------------------------------------- */

export type Momento = {
  /** `ahora`, o el día al cierre. */
  id: string;
  etiqueta: string;
  /** La foto incluye todo lo registrado ANTES de este instante. */
  instante: Date;
  esAhora: boolean;
  /** El día al cierre, si no es ahora. */
  dia: string | null;
};

/** Los atajos de momento: los cierres que más se piden. */
export function atajosDeMomento(ahora: Date): Array<{ id: string; etiqueta: string; dia: string | null }> {
  const hoy = diaDe(ahora);
  const lunes = lunesDe(hoy);
  const primeroDelMes = `${hoy.slice(0, 7)}-01`;
  return [
    { id: "ahora", etiqueta: "Ahora", dia: null },
    { id: "ayer", etiqueta: "Ayer al cierre", dia: sumarDias(hoy, -1) },
    { id: "semana", etiqueta: "Cierre de la semana pasada", dia: sumarDias(lunes, -1) },
    { id: "mes", etiqueta: `Cierre de ${nombreDeMes(sumarDias(primeroDelMes, -1))}`, dia: sumarDias(primeroDelMes, -1) },
  ];
}

/**
 * El momento pedido: `?fecha=2026-10-31` es ese día AL CIERRE (todo lo
 * registrado hasta las 24 h). Sin fecha, o con hoy o una futura, es ahora.
 */
export function leerMomento(fecha: string | undefined, ahora: Date): Momento {
  const hoy = diaDe(ahora);
  if (!esDia(fecha) || fecha >= hoy) {
    return { id: "ahora", etiqueta: "Ahora", instante: ahora, esAhora: true, dia: null };
  }
  const atajo = atajosDeMomento(ahora).find((a) => a.dia === fecha);
  return {
    id: atajo?.id ?? fecha,
    etiqueta: atajo?.etiqueta ?? `${fechaLarga(fecha, hoy)} al cierre`,
    instante: inicioDelDia(sumarDias(fecha, 1)),
    esAhora: false,
    dia: fecha,
  };
}
