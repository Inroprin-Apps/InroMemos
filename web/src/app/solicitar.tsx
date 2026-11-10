"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { aNumero } from "@/lib/cuentas";
import { ENTREGA_VIATICOS, useContextoMemos } from "@/lib/memos";
import type { Persona } from "@/lib/sesion";
import { solicitarMemo } from "@/lib/solicitudes";
import { IconoCerrar } from "./iconos";
import { Aviso, botonPrincipal, botonSecundario, campo } from "./piezas";

/**
 * Pedir un memo a un área. Desde Rendiciones se abre como «Solicitar
 * viáticos» (tipo Entrega de viáticos ya elegido). La solicitud llega a la
 * jefatura del área; el memo lo emite el área.
 */
export function Solicitar({ persona, origen, onCerrar }: { persona: Persona; origen: "memos" | "rendiciones"; onCerrar: () => void }) {
  const { contexto } = useContextoMemos(persona.correo);
  const viaticos = origen === "rendiciones";
  const [unidad, setUnidad] = useState<number | null>(null);
  const [tipo, setTipo] = useState<string>(viaticos ? ENTREGA_VIATICOS : "");
  const [que, setQue] = useState("");
  const [monto, setMonto] = useState("");
  const [moneda, setMoneda] = useState<"PEN" | "USD" | "EUR">("PEN");
  const [beneficiario, setBeneficiario] = useState(viaticos ? persona.nombre : "");
  const [doc, setDoc] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState(false);
  const [falla, setFalla] = useState<string | null>(null);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [onCerrar]);

  const unidades = (contexto?.catalogos.unidades ?? []).filter((u) => u.activo);
  const elegida = unidades.find((u) => u.id === unidad);
  const tipos = (contexto?.catalogos.tipos ?? []).filter((t) => t.activo);
  const t = tipos.find((x) => x.codigo === tipo);
  const conPago = !t || t.lleva_pago;
  const familias = [...new Set(tipos.map((x) => x.familia))];

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unidad) return setFalla("Elige a qué área le pides el memo.");
    if (que.trim().length < 5) return setFalla("Cuenta en una frase qué necesitas.");
    setEnviando(true);
    setFalla(null);
    try {
      await solicitarMemo({
        unidad_id: unidad,
        tipo_codigo: tipo || null,
        que: que.trim(),
        monto: conPago && monto.trim() ? aNumero(monto) : null,
        moneda,
        beneficiario: conPago ? beneficiario.trim() : "",
        beneficiario_doc: conPago ? doc.replace(/\s/g, "") : "",
        viaje_desde: tipo === ENTREGA_VIATICOS ? desde || null : null,
        viaje_hasta: tipo === ENTREGA_VIATICOS ? hasta || null : null,
        origen,
      });
      setListo(true);
    } catch (err) {
      setFalla((err as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  const etiqueta = "block text-[12.5px] font-semibold text-ink-2";

  return (
    <div className="animar-velo fixed inset-0 z-40 flex items-end justify-center bg-ink/40 sm:items-center sm:p-4" onClick={onCerrar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="solicitar-titulo"
        className="animar-dialogo max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-card bg-surface p-5 shadow-card sm:rounded-card sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <h2 id="solicitar-titulo" className="text-lg font-bold text-ink">
              {viaticos ? "Solicitar viáticos" : "Solicitar un memo"}
            </h2>
            <p className="mt-0.5 text-[13px] text-ink-2">
              Llega a la jefatura del área. El memo lo emite el área; tú quedas en copia y te enteras de cada paso.
            </p>
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="flex h-8 w-8 items-center justify-center rounded-control text-ink-2 hover:bg-surface-2">
            <IconoCerrar className="h-4 w-4" />
          </button>
        </div>

        {listo ? (
          <div className="animar-entrada mt-5 space-y-4">
            <Aviso tono="info">
              Listo: tu solicitud llegó a {elegida ? `${elegida.empresa?.codigo ?? ""} · ${elegida.nombre}` : "el área"}. Puedes seguirla en Solicitudes.
            </Aviso>
            <div className="flex gap-2">
              <Link href="/memos/solicitudes/?ver=mias" onClick={onCerrar} className={`flex-1 text-center ${botonPrincipal}`}>
                Ver mis solicitudes
              </Link>
              <button type="button" onClick={onCerrar} className={botonSecundario}>
                Cerrar
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={enviar} className="mt-5 space-y-4">
            <label className={etiqueta}>
              ¿A qué área se lo pides?
              <select className={`mt-1 ${campo}`} value={unidad ?? ""} onChange={(e) => setUnidad(Number(e.target.value) || null)}>
                <option value="">Elige el área…</option>
                {unidades.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.empresa?.codigo ?? ""} · {u.nombre}
                  </option>
                ))}
              </select>
              {elegida && !elegida.jefe_correo && (
                <span className="mt-1 block text-[12px] font-normal text-warning-strong">Esa área todavía no tiene jefatura configurada: la verán quienes emiten ahí.</span>
              )}
            </label>

            {!viaticos && (
              <label className={etiqueta}>
                Tipo de memo
                <select className={`mt-1 ${campo}`} value={tipo} onChange={(e) => setTipo(e.target.value)}>
                  <option value="">No sé: que lo decida el área</option>
                  {familias.map((f) => (
                    <optgroup key={f} label={f}>
                      {tipos
                        .filter((x) => x.familia === f)
                        .map((x) => (
                          <option key={x.codigo} value={x.codigo}>
                            {x.nombre}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </label>
            )}

            <label className={etiqueta}>
              ¿Qué necesitas?
              <textarea
                className={`mt-1 min-h-20 ${campo}`}
                value={que}
                maxLength={1000}
                onChange={(e) => setQue(e.target.value)}
                placeholder={viaticos ? "Viáticos para la instalación del paquete 8 en Puno (hospedaje, alimentación, transporte)" : "Pago a proveedor por el servicio de mantenimiento de octubre"}
              />
            </label>

            {conPago && (
              <>
                <div className="grid grid-cols-[1fr_auto] gap-2.5">
                  <label className={etiqueta}>
                    Monto aproximado (opcional)
                    <input className={`mt-1 ${campo}`} inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="1,017.00" />
                  </label>
                  <label className={etiqueta}>
                    Moneda
                    <select className={`mt-1 ${campo}`} value={moneda} onChange={(e) => setMoneda(e.target.value as "PEN" | "USD" | "EUR")}>
                      <option value="PEN">S/</option>
                      <option value="USD">US$</option>
                      <option value="EUR">€</option>
                    </select>
                  </label>
                </div>
                <div className="grid gap-2.5 sm:grid-cols-[1fr_10rem]">
                  <label className={etiqueta}>
                    {viaticos || tipo === ENTREGA_VIATICOS ? "¿Para quién? (quien viaja)" : "Beneficiario o proveedor (opcional)"}
                    <input className={`mt-1 ${campo}`} value={beneficiario} maxLength={200} onChange={(e) => setBeneficiario(e.target.value)} />
                  </label>
                  <label className={etiqueta}>
                    DNI o RUC
                    <input className={`mt-1 ${campo}`} inputMode="numeric" value={doc} maxLength={20} onChange={(e) => setDoc(e.target.value)} />
                  </label>
                </div>
              </>
            )}

            {tipo === ENTREGA_VIATICOS && (
              <div className="grid grid-cols-2 gap-2.5">
                <label className={etiqueta}>
                  Viaje desde
                  <input type="date" className={`mt-1 ${campo}`} value={desde} onChange={(e) => setDesde(e.target.value)} />
                </label>
                <label className={etiqueta}>
                  Hasta
                  <input type="date" className={`mt-1 ${campo}`} min={desde || undefined} value={hasta} onChange={(e) => setHasta(e.target.value)} />
                </label>
              </div>
            )}

            {falla && <Aviso>{falla}</Aviso>}
            <button type="submit" disabled={enviando} className={`w-full ${botonPrincipal}`}>
              {enviando ? "Enviando…" : "Enviar la solicitud"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
