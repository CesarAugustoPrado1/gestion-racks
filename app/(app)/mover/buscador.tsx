"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Un solo campo para código, ubicación o modelo.
 *
 * El operario tiene una sola mano libre: escribe "B-4", "laja" o "21" y la
 * pantalla se arregla. Pedirle que elija primero el tipo de búsqueda es un
 * toque de más en cada uso, y los toques de más son los que hacen que el
 * movimiento no se registre.
 */
export function Buscador({ inicial }: { inicial: string }) {
  const router = useRouter();
  const [texto, setTexto] = useState(inicial);

  function buscar(e: React.FormEvent) {
    e.preventDefault();
    const q = texto.trim();
    router.push(q ? `/mover?q=${encodeURIComponent(q)}` : "/mover");
  }

  return (
    <form onSubmit={buscar} className="flex gap-2">
      <input
        className="campo"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Buscar: B-4, P-00021, Laja…"
        autoCapitalize="none"
        autoCorrect="off"
        enterKeyHint="search"
        aria-label="Buscar un bulto"
      />
      <button type="submit" className="boton-secundario px-4">
        Buscar
      </button>
      {inicial && (
        <button
          type="button"
          className="boton-secundario px-4"
          onClick={() => {
            setTexto("");
            router.push("/mover");
          }}
        >
          ✕
        </button>
      )}
    </form>
  );
}
