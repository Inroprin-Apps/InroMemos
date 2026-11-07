import { Suspense } from "react";
import { Drive } from "./drive";

// Google vuelve acá con ?code=…&state=…: leerlos exige un límite de Suspense.
export default function Pagina() {
  return (
    <Suspense fallback={<p className="p-6 text-ink-3">Abriendo…</p>}>
      <Drive />
    </Suspense>
  );
}
