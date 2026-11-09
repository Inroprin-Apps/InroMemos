"use client";

import { useState } from "react";
import { cerrarValoracion, TEXTO_ACCION, usePedidoDeValoracion, valorar } from "@/lib/valoracion";
import { IconoCerrar } from "./iconos";

const CARAS = [
  { n: 1, cara: "😞", texto: "Muy mal" },
  { n: 2, cara: "🙁", texto: "Mal" },
  { n: 3, cara: "😐", texto: "Regular" },
  { n: 4, cara: "🙂", texto: "Bien" },
  { n: 5, cara: "😄", texto: "Muy bien" },
];

/** «¿Cómo te fue?»: flota abajo a la derecha después de cada acción. */
export function Valorar() {
  const pedido = usePedidoDeValoracion();
  const [puntaje, setPuntaje] = useState<number | null>(null);
  const [comentario, setComentario] = useState("");
  const [estado, setEstado] = useState<"preguntando" | "gracias" | "falla">("preguntando");
  const [para, setPara] = useState(pedido);

  // Un pedido nuevo empieza de cero.
  if (pedido !== para) {
    setPara(pedido);
    setPuntaje(null);
    setComentario("");
    setEstado("preguntando");
  }
  if (!pedido) return null;

  const enviar = async (n: number, texto: string) => {
    try {
      await valorar(pedido, n, texto);
      setEstado("gracias");
      setTimeout(cerrarValoracion, 1400);
    } catch {
      setEstado("falla");
    }
  };

  return (
    <aside
      role="dialog"
      aria-label="Valora la plataforma"
      className="animar-dialogo fixed bottom-20 right-4 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-card border border-control bg-surface p-4 shadow-card md:bottom-5"
    >
      <div className="flex items-start gap-2">
        <p className="flex-1 text-[13.5px] font-semibold text-ink">
          {estado === "gracias" ? "¡Gracias! Así mejoramos INROMEMOS." : `¿Cómo te fue al ${TEXTO_ACCION[pedido.accion]}?`}
        </p>
        <button type="button" onClick={cerrarValoracion} aria-label="Cerrar" className="flex h-6 w-6 items-center justify-center rounded-row text-ink-3 hover:bg-surface-2">
          <IconoCerrar className="h-3.5 w-3.5" />
        </button>
      </div>
      {estado !== "gracias" && (
        <>
          <div className="mt-2.5 flex justify-between">
            {CARAS.map((c) => (
              <button
                key={c.n}
                type="button"
                aria-label={c.texto}
                title={c.texto}
                aria-pressed={puntaje === c.n}
                onClick={() => setPuntaje(c.n)}
                className={`flex h-11 w-11 items-center justify-center rounded-full text-[24px] transition-transform duration-150 hover:scale-110 ${
                  puntaje === c.n ? "scale-110 bg-primary-soft ring-2 ring-primary" : puntaje ? "opacity-50" : ""
                }`}
              >
                {c.cara}
              </button>
            ))}
          </div>
          {puntaje && (
            <form
              className="animar-entrada mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                enviar(puntaje, comentario);
              }}
            >
              <input
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                maxLength={500}
                placeholder={puntaje <= 3 ? "¿Qué podemos mejorar? (opcional)" : "Un comentario (opcional)"}
                className="min-w-0 flex-1 rounded-control border border-control bg-surface px-3 py-2 text-[13px] outline-none focus:border-primary"
              />
              <button type="submit" className="rounded-control bg-primary px-3.5 text-[13px] font-semibold text-on-fill hover:bg-primary-strong">
                Enviar
              </button>
            </form>
          )}
          {estado === "falla" && <p className="mt-2 text-[12px] text-danger-strong">No se pudo guardar. Intenta de nuevo.</p>}
        </>
      )}
    </aside>
  );
}
