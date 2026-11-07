import { ponerAlDia } from "@/lib/fotos-diarias";

export const dynamic = "force-dynamic";
// Rellenar varios días seguidos puede tardar más que una consulta común.
export const maxDuration = 60;

/**
 * La foto diaria del stock. La llama Vercel todas las noches (vercel.json,
 * `crons`) con `Authorization: Bearer <CRON_SECRET>`.
 *
 * Queda afuera del middleware de sesión -no hay usuario a esa hora-, así que la
 * protege la clave: sin `CRON_SECRET` configurado no corre para nadie, en vez
 * de quedar abierta.
 */
export async function GET(req: Request) {
  const clave = process.env.CRON_SECRET;
  if (!clave) {
    return Response.json({ error: "Falta configurar CRON_SECRET." }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${clave}`) {
    return Response.json({ error: "No autorizado." }, { status: 401 });
  }
  const resultado = await ponerAlDia();
  return Response.json({ ok: true, resultado });
}
