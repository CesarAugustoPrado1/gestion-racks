import { requerirRol } from "@/lib/auth";
import { EnConstruccion, Titulo } from "@/components/ui";

export const metadata = { title: "Stock · Racks" };

export default async function PantallaStock() {
  await requerirRol("comercial", "admin", "auditor", "control");

  return (
    <>
      <Titulo detalle="Cuánto hay de cada modelo, por packaging y en unidades.">
        Stock
      </Titulo>
      <EnConstruccion fase="Fase 3">
        <p>
          Acá va la vista por modelo con las cuatro solapas:{" "}
          <strong>sueltos</strong>, <strong>palet</strong>,{" "}
          <strong>optimizado</strong> y el <strong>total</strong> en la unidad de
          la línea: placas, paquetes o cajas.
        </p>
        <p>
          La cuarta solapa es la que se cita por teléfono, así que dice siempre
          en qué unidad está expresada.
        </p>
      </EnConstruccion>
    </>
  );
}
