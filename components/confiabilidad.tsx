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

/**
 * Una fila del índice abierto: nombre, medidor y número.
 *
 * Es un MEDIDOR, no una barra de un gráfico: mide un valor contra su límite
 * -0 a 1- y por eso la pista vacía se dibuja siempre, en un tono claro del
 * mismo color que el relleno. Sin la pista, una barra corta y una larga se leen
 * como dos cantidades distintas en vez de como dos porciones del mismo total.
 *
 * UN SOLO TONO, Y NO LOS COLORES DE CONFIABILIDAD. Los de confiabilidad son de
 * estado y tienen umbrales: 50% cae en verde y 48% en amarillo. Sobre una
 * posición eso está bien, porque es la decisión de ir a mirarla o no. Sobre el
 * promedio de una línea entera hace que dos números a dos puntos de distancia
 * se vean como categorías opuestas, y ese escalón no existe en los datos.
 * Comparar magnitudes pide escala secuencial. Se vio en pantalla: "50%
 * Confiable" y "48% A chequear" a dos renglones de distancia parecían un
 * capricho de la app.
 *
 * Y tampoco lleva la etiqueta de estado: "A chequear" sobre una línea entera es
 * un error de categoría, porque no se chequea una línea, se chequean
 * posiciones. El número ES la etiqueta, así que el color no queda solo.
 */
export function FilaDeIndice({
  nombre,
  detalle,
  valor,
  sinDatos,
  cuantosSinDatos,
}: {
  nombre: string;
  detalle?: string;
  /** 0 a 1, o `null` si no hay ni un chequeo del cual hablar. */
  valor: number | null;
  /** Cuántos quedaron fuera del promedio por no tener ni un chequeo. */
  sinDatos: number;
  cuantosSinDatos?: string;
}) {
  return (
    <div className="py-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-sm font-medium text-slate-900">
          {nombre}
          {detalle && (
            <span className="ml-2 font-normal text-slate-500">{detalle}</span>
          )}
        </span>
        <span className="cifra shrink-0 text-sm font-semibold text-slate-900">
          {valor == null ? (
            <span className="font-normal text-slate-500">sin chequear</span>
          ) : (
            `${Math.round(valor * 100)}%`
          )}
        </span>
      </div>

      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-medida-suave">
        {valor != null && (
          <div
            className="h-full rounded-full bg-medida"
            style={{ width: `${Math.max(valor * 100, 2)}%` }}
          />
        )}
      </div>

      {/**
       * La línea que el promedio esconde. Un 82% sobre el 30% de los bultos no
       * es un 82%, y el que lo lea tiene derecho a saberlo sin ir a buscarlo.
       */}
      {sinDatos > 0 && (
        <p className="mt-1 text-xs text-slate-500">
          {sinDatos} {cuantosSinDatos ?? "sin chequear nunca"}, que no{" "}
          {sinDatos === 1 ? "entra" : "entran"} en esa cuenta
        </p>
      )}
    </div>
  );
}
