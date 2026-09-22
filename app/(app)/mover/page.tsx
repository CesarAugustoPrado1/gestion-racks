import { requerirRol } from "@/lib/auth";
import { EnConstruccion, Titulo } from "@/components/ui";

export const metadata = { title: "Mover · Racks" };

export default async function PantallaMover() {
  const sesion = await requerirRol("autoelevador", "admin");

  return (
    <>
      <Titulo detalle={`Hola ${sesion.nombre}. Cada movimiento real, registrado acá.`}>
        Mover
      </Titulo>
      <EnConstruccion fase="Fase 2">
        <p>
          Acá van las cuatro operaciones del autoelevador: <strong>subir</strong>{" "}
          un bulto a una posición, <strong>bajarlo</strong>, <strong>moverlo</strong>{" "}
          de lugar y <strong>entregarlo</strong>.
        </p>
        <p>
          Con la actividad del día a la vista y el acceso a corregir lo último
          que hiciste, mientras nadie haya tocado ese bulto después.
        </p>
      </EnConstruccion>
    </>
  );
}
