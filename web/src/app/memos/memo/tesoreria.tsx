"use client";

import { useState } from "react";
import { ESTADOS_PAGO, registrarEstadoPago, type EstadoPago, type Memo } from "@/lib/memos";
import { botonPrincipal, campo } from "../../piezas";
import { Tarjeta } from "../piezas-memo";

const SIGUIENTE: Record<string, EstadoPago[]> = {
  ninguno: ["en_analisis", "registrado", "programado", "pagado"],
  en_analisis: ["registrado", "observado_analisis"],
  registrado: ["programado", "pagado"],
  programado: ["pagado"],
  observado_analisis: [],
  pagado: [],
};

/**
 * Tesorería registra el estado del pago a mano mientras InroPay no lo
 * devuelve solo. «Pagado» cierra la rendición de la que salió el memo.
 */
export function PanelTesoreria({ memo, onHecho }: { memo: Memo; onHecho: () => void }) {
  const opciones = SIGUIENTE[memo.estado_pago ?? "ninguno"] ?? [];
  const [estado, setEstado] = useState<EstadoPago | "">(opciones[0] ?? "");
  const [detalle, setDetalle] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const [falla, setFalla] = useState<string | null>(null);
  if (!memo.requiere_pago || !["aprobado", "enviado", "recibido"].includes(memo.estado) || !opciones.length) return null;

  const registrar = async () => {
    if (!estado) return;
    setTrabajando(true);
    setFalla(null);
    try {
      await registrarEstadoPago(memo.id, estado, detalle);
      setDetalle("");
      onHecho();
    } catch (e) {
      setFalla((e as Error).message);
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <Tarjeta titulo="Pago (Tesorería)" nota={memo.estado_pago ? `Ahora: ${ESTADOS_PAGO[memo.estado_pago]}` : "Todavía sin estado de pago"}>
      <div className="flex flex-wrap gap-2.5">
        <select className={`w-auto ${campo}`} value={estado} onChange={(e) => setEstado(e.target.value as EstadoPago)} aria-label="Nuevo estado del pago">
          {opciones.map((o) => (
            <option key={o} value={o}>
              {ESTADOS_PAGO[o]}
            </option>
          ))}
        </select>
        <input
          className={`min-w-50 flex-1 ${campo}`}
          value={detalle}
          onChange={(e) => setDetalle(e.target.value)}
          placeholder={estado === "observado_analisis" ? "Qué observó Análisis y Registro" : "Detalle (banco, operación…)"}
        />
        <button type="button" className={`text-[13px] ${botonPrincipal}`} disabled={trabajando || !estado} onClick={registrar}>
          Registrar
        </button>
      </div>
      {estado === "pagado" && memo.rendicion_id && (
        <p className="mt-2 text-[12.5px] text-ink-2">Al marcarlo pagado, la rendición de la que salió queda cerrada.</p>
      )}
      {falla && (
        <p className="mt-2 text-[13px] text-danger-strong" role="alert">
          {falla}
        </p>
      )}
    </Tarjeta>
  );
}
