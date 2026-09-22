import { requerirRol } from "@/lib/auth";
import { EnConstruccion, Titulo } from "@/components/ui";

export const metadata = { title: "Administración · Racks" };

export default async function PantallaAdmin() {
  await requerirRol("admin");

  return (
    <>
      <Titulo detalle="Los datos que definen cómo mide el sistema.">
        Administración
      </Titulo>
      <EnConstruccion fase="Fase 1">
        <p>
          Acá va el ABM de líneas, modelos, <strong>normas</strong> (modelo ×
          packaging → cantidad), racks, posiciones y usuarios.
        </p>
        <p>
          Nada se borra: los modelos, racks y posiciones se suspenden, porque el
          historial tiene que seguir leyéndose.
        </p>
      </EnConstruccion>
    </>
  );
}
