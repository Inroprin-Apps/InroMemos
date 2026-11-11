"use client";

import { useState } from "react";
import { cerrarValoracion, TEXTO_ACCION, usePedidoDeValoracion, valorar } from "@/lib/valoracion";
import { IconoCerrar } from "./iconos";

const ESCALA = [
  { n: 1, texto: "Muy mal" },
  { n: 2, texto: "Mal" },
  { n: 3, texto: "Regular" },
  { n: 4, texto: "Bien" },
  { n: 5, texto: "Muy bien" },
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
          {/* Escala del 1 al 5, como el cargo: números sobrios, sin caritas. */}
          <div role="radiogroup" aria-label="Del 1 (muy mal) al 5 (muy bien)" className="mt-3 grid grid-cols-5 gap-1.5">
            {ESCALA.map((c) => (
              <button
                key={c.n}
                type="button"
                role="radio"
                aria-label={`${c.n}: ${c.texto}`}
                title={c.texto}
                aria-checked={puntaje === c.n}
                onClick={() => setPuntaje(c.n)}
                className={`h-10 rounded-control border text-[14px] font-bold tabular-nums transition-colors duration-150 ${
                  puntaje === c.n ? "border-ink bg-ink text-on-fill" : "border-control bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink"
                }`}
              >
                {c.n}
              </button>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-ink-3">
            <span>Muy mal</span>
            <span>{puntaje ? ESCALA[puntaje - 1].texto : ""}</span>
            <span>Muy bien</span>
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
