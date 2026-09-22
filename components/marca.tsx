/**
 * El logo, como SVG y no como caracter.
 *
 * Arranco usando el glifo "▦" y en el celular quedaba el cuadro vacio: no esta
 * en todas las fuentes del sistema. Un logo que depende de la fuente del
 * telefono del operario no es un logo.
 */
export function Marca({ clase = "h-7 w-7" }: { clase?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={clase} aria-hidden>
      <g fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round">
        <path d="M11 12v40M53 12v40" />
        <path d="M11 26h42M11 39h42M11 52h42" />
      </g>
      <rect x="16" y="15" width="14" height="9" rx="1.5" fill="currentColor" opacity="0.55" />
      <rect x="34" y="15" width="14" height="9" rx="1.5" fill="currentColor" opacity="0.55" />
      <rect x="16" y="28" width="14" height="9" rx="1.5" fill="currentColor" opacity="0.55" />
    </svg>
  );
}
