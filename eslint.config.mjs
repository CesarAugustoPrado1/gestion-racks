import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

/**
 * `next-env.d.ts` y `drizzle/` los genera una herramienta, no nosotros: pedirles
 * que cumplan las reglas es discutir con el generador.
 */
const config = [
  { ignores: [".next/**", "node_modules/**", "drizzle/**", "next-env.d.ts"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];

export default config;
