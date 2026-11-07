import { Suspense } from "react";
import { VistaRevisar } from "./revisar";

// Como la hoja: el id va por parámetro (?id=…&c=…) porque la exportación
// estática no tiene rutas con el id adentro.
export default function Pagina() {
  return (
    <Suspense fallback={<p className="p-6 text-ink-3">Abriendo…</p>}>
      <VistaRevisar />
    </Suspense>
  );
}
