import { Suspense } from "react";
import { VistaRendicion } from "./vista";

// La exportación estática no admite rutas con el id adentro (/rendicion/123):
// el id va como parámetro, y leerlo exige un límite de Suspense.
export default function Pagina() {
  return (
    <Suspense fallback={<p className="p-6 text-ink-3">Abriendo…</p>}>
      <VistaRendicion />
    </Suspense>
  );
}
