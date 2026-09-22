import { requerirRol } from "@/lib/auth";
import { EnConstruccion, Titulo } from "@/components/ui";

export const metadata = { title: "Control · Racks" };

export default async function PantallaControl() {
  const sesion = await requerirRol("control", "admin");

  return (
    <>
      <Titulo detalle={`Hola ${sesion.nombre}. La recorrida, ordenada por lo que hace más que no se mira.`}>
        Control
      </Titulo>
      <EnConstruccion fase="Fase 4">
        <p>
          Acá va la recorrida: las posiciones ordenadas por confiabilidad y
          cantidad, para chequear primero lo que más conviene chequear.
        </p>
        <p>
          Un toque cuando está bien. Cuando no, la corrección queda asentada
          como <strong>ajuste</strong>, con su motivo, y el chequeo cuenta igual:
          encontrar un error también es información sobre la posición.
        </p>
      </EnConstruccion>
    </>
  );
}
