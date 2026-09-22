import { requerirSesion } from "@/lib/auth";
import { EnConstruccion, Titulo } from "@/components/ui";

export const metadata = { title: "Racks · Racks" };

export default async function PantallaRacks() {
  await requerirSesion();

  return (
    <>
      <Titulo detalle="La foto de la planta: qué hay en cada posición y qué tan confiable es ese dato.">
        Racks
      </Titulo>
      <EnConstruccion fase="Fase 3">
        <p>
          Acá va el mapa, rack por rack, con su accesibilidad —selectivo o
          penetrable—, la ocupación y el color de confiabilidad de cada posición.
        </p>
        <p>
          Todo contador se toca y abre la lista de los bultos que lo componen: un
          número que no se puede abrir obliga a bajar a mirar.
        </p>
      </EnConstruccion>
    </>
  );
}
