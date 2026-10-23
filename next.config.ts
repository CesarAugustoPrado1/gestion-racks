import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * El manual se reemplaza en cada versión con el mismo nombre. Sin esto el
   * celular puede mostrar uno viejo que quedó guardado: así pregunta siempre
   * si hay uno nuevo.
   */
  async headers() {
    return [
      {
        source: "/manual.pdf",
        headers: [{ key: "Cache-Control", value: "no-cache" }],
      },
    ];
  },
};

export default nextConfig;
