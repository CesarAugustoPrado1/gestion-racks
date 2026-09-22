/**
 * Que commit esta desplegado.
 *
 * En Control-Secaderos esto falto y se pago: un chequeo que pide una ruta hasta
 * que da 200 no distingue el deploy nuevo del viejo, porque el viejo tambien
 * contesta 200. Hay que poder comparar contra algo que identifique la version.
 *
 * No toca la base a proposito: tiene que contestar incluso con la base caida,
 * asi se puede separar "el deploy no salio" de "la base no responde".
 */
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
    rama: process.env.VERCEL_GIT_COMMIT_REF ?? "local",
    entorno: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    ahora: new Date().toISOString(),
  });
}
