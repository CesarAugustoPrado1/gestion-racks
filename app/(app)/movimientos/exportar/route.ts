/**
 * El historial de movimientos en CSV.
 *
 * Tres decisiones que parecen de detalle y no lo son, porque el archivo se abre
 * en Excel en español:
 *
 * - Separador `;`. Con `,` Excel en configuración regional argentina mete toda
 *   la fila en la primera celda, porque para él la coma separa decimales.
 * - BOM al principio. Sin él, Excel lee el archivo como Latin-1 y "Patagónica"
 *   llega como "PatagÃ³nica".
 * - Los números salen sin separador de miles y con punto decimal: son números
 *   para sumar, no texto para leer. El formato lo pone quien abre la planilla.
 *
 * Los filtros se leen con el mismo `leerFiltros` de la pantalla y la consulta es
 * la misma `dondeHistorial`, así lo que se baja es exactamente lo que se estaba
 * viendo. Y el rol se vuelve a pedir acá: un route handler no queda cubierto por
 * la autorización de la página, se puede pedir la URL directo.
 */
import { requerirRol } from "@/lib/auth";
import { historialPlano } from "@/lib/consultas";
import { leerFiltros } from "../page";

export const dynamic = "force-dynamic";

/** Comillas dobles si hay separador, comillas o saltos de línea adentro. */
function celda(valor: string | number): string {
  if (typeof valor === "number") return String(valor);
  return /[;"\n\r]/.test(valor) ? `"${valor.replaceAll('"', '""')}"` : valor;
}

export async function GET(pedido: Request) {
  await requerirRol("admin", "auditor", "comercial", "control");

  const params = new URL(pedido.url).searchParams;
  const filas = await historialPlano(
    leerFiltros({
      desde: params.get("desde") ?? undefined,
      hasta: params.get("hasta") ?? undefined,
      tipo: params.get("tipo") ?? undefined,
      modelo: params.get("modelo") ?? undefined,
      usuario: params.get("usuario") ?? undefined,
      q: params.get("q") ?? undefined,
      anulados: params.get("anulados") ?? undefined,
    }),
  );

  // Las columnas salen de la primera fila para que agregar un campo en
  // `historialPlano` alcance. Sin filas igual mandamos el encabezado: un CSV
  // vacío con títulos se entiende, uno de cero bytes parece un error.
  const columnas =
    filas.length > 0
      ? Object.keys(filas[0])
      : ["Fecha", "Hora", "Movimiento", "Bulto", "Linea", "Modelo"];

  const lineas = [
    columnas.join(";"),
    ...filas.map((f) => columnas.map((c) => celda(f[c] ?? "")).join(";")),
  ];

  const hoy = new Date().toISOString().slice(0, 10);

  return new Response("﻿" + lineas.join("\r\n") + "\r\n", {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="movimientos-${hoy}.csv"`,
      // Es una foto de un momento; que nadie la sirva desde un caché.
      "cache-control": "no-store",
    },
  });
}
