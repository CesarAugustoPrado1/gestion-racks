import { redirect } from "next/navigation";

/** El Tablero pasó a ser el Resumen (la foto de ahora, o de otro momento). */
export default function PantallaTablero() {
  redirect("/resumen");
}
