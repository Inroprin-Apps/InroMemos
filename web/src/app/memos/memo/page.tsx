import { Suspense } from "react";
import { VistaMemo } from "./memo";

// Como en /rendicion: la exportación estática no admite /memos/memo/123, así
// que el id va como parámetro y leerlo exige un límite de Suspense.
export default function Pagina() {
  return (
    <Suspense fallback={<p className="p-6 text-ink-3">Abriendo…</p>}>
      <VistaMemo />
    </Suspense>
  );
}
