import {
  COLOR_NIVEL,
  etiquetaDeEstado,
  hace,
  nivel,
  type Confianza,
} from "@/lib/confiabilidad";

/**
 * El estado de confiabilidad de un bulto o una posición.
 *
 * Muestra SIEMPRE cuándo fue el último chequeo, no solo el color: el color
 * ordena de un vistazo, pero el que va a decidir si baja a mirar necesita el
 * dato, y "hace 2 meses" es una razón mientras que un cuadradito rojo es una
 * opinión.
 */
export function ChipConfianza({
  confianza,
  fila,
  compacto = false,
}: {
  confianza: Confianza | null;
  /** Para distinguir "nunca se miró" de "se miró, pero después se movió". */
  fila?: { chequeadoEn: Date | string | null; chequeosTotal: number };
  compacto?: boolean;
}) {
  const n = nivel(confianza);
  const color = COLOR_NIVEL[n];
  const texto = etiquetaDeEstado(
    fila ?? { chequeadoEn: null, chequeosTotal: 0 },
    confianza,
  );

  if (compacto) {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-xs text-slate-500"
        title={texto}
      >
        <span className={`h-2 w-2 shrink-0 rounded-full ${color.punto}`} />
        {confianza
          ? hace(confianza.diasDesdeElChequeo)
          : fila && fila.chequeosTotal > 0
            ? "se movió"
            : "sin chequear"}
      </span>
    );
  }

  return <span className={`chip ${color.chip}`}>{texto}</span>;
}

/**
 * El índice de un conjunto.
 *
 * Nunca se muestra el promedio solo: al lado va cuántos bultos quedaron fuera
 * por no tener chequeo. Un 82% sobre el 30% de los bultos no es un 82%.
 */
export function Indice({
  valor,
  medidos,
  sinDatos,
}: {
  valor: number | null;
  medidos: number;
  sinDatos: number;
}) {
  if (valor == null) {
    return (
      <p className="text-sm text-slate-500">
        Sin chequeos todavía: no hay índice que mostrar.
      </p>
    );
  }
  return (
    <p className="text-sm text-slate-600">
      <span className="cifra text-slate-900">
        {Math.round(valor * 100)}%
      </span>{" "}
      de confiabilidad sobre {medidos} bulto{medidos === 1 ? "" : "s"} chequeado
      {medidos === 1 ? "" : "s"}
      {sinDatos > 0 && (
        <>
          {" "}
          · <strong>{sinDatos}</strong> sin chequear nunca, que no entra en la
          cuenta
        </>
      )}
      .
    </p>
  );
}
