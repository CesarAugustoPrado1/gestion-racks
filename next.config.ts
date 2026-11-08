import type { NextConfig } from "next";
import { MANUAL_VIGENTE } from "./lib/manual";

const nextConfig: NextConfig = {
  /**
   * Cada versión del manual es un archivo con su número
   * (/manuales/manual-operario-v3.pdf) y no se reemplaza nunca, así que el
   * celular no puede quedarse con una vieja por caché. /manual.pdf -la
   * dirección de antes- lleva siempre a la vigente, para quien la tenga
   * guardada.
   */
  async redirects() {
    return [{ source: "/manual.pdf", destination: MANUAL_VIGENTE, permanent: false }];
  },
};

export default nextConfig;
