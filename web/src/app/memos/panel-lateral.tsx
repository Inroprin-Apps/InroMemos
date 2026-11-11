"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { periodoViaje } from "@/lib/memo-reglas";
import { corrido, lineaDeTiempo, type Paso } from "@/lib/memo-linea";
import {
  ENTREGA_VIATICOS,
  dinero,
  enlaceSustento,
  leerMemo,
  leerSustentos,
  type Contexto,
  type Evento,
  type Linea,
  type Memo,
  type MemoSustento,
} from "@/lib/memos";
import { IconoCerrar } from "../iconos";
import { Aviso, botonPrincipal, botonSecundario } from "../piezas";
import { ChipEstado, ChipPago } from "./piezas-memo";

type Detalle = { memo: Memo; lineas: Linea[]; eventos: Evento[]; sustentos: MemoSustento[] };

// Lo ya leído queda a mano: subir y bajar por la lista no vuelve a esperar.
const leidos = new Map<string, Detalle>();

async function leerDetalle(id: string): Promise<Detalle> {
  const [m, sustentos] = await Promise.all([leerMemo(id), leerSustentos(id).catch(() => [])]);
  const d = { ...m, sustentos };
  leidos.set(id, d);
  return d;
}

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-PE", { day: "numeric", month: "short", timeZone: "America/Lima" }).replace(".", "");
const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "America/Lima" });
const drive = (id: string, carpeta = false) => (carpeta ? `https://drive.google.com/drive/folders/${id}` : `https://drive.google.com/file/d/${id}/view`);

/**
 * El memo en un panel al costado del panel de memos: lo esencial, sus
 * archivos y la línea de tiempo desde la emisión hasta el pago. Se abre al
 * hacer clic en una fila; ↑ ↓ pasan al anterior o al siguiente; Esc cierra.
 */
export function PanelLateral({
  resumen,
  contexto,
  onCerrar,
  onMover,
}: {
  /** La fila de la lista (sin cuerpo): se muestra al instante mientras llega el resto. */
  resumen: Memo;
  contexto: Contexto | null;
  onCerrar: () => void;
  onMover: (paso: -1 | 1) => void;
}) {
  // Lo leído se guarda con su id: al pasar a otro memo se muestra lo que ya
  // se tenga de él (o huecos) hasta que llegue lo suyo.
  const [cargado, setCargado] = useState<{ id: string; d: Detalle | null; falla: string | null }>(() => ({
    id: resumen.id,
    d: leidos.get(resumen.id) ?? null,
    falla: null,
  }));
  const d = cargado.id === resumen.id ? cargado.d : (leidos.get(resumen.id) ?? null);
  const falla = cargado.id === resumen.id ? cargado.falla : null;
  const [saliendo, setSaliendo] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    let vigente = true;
    const id = resumen.id;
    leerDetalle(id).then(
      (x) => vigente && setCargado({ id, d: x, falla: null }),
      (e: Error) => vigente && setCargado({ id, d: leidos.get(id) ?? null, falla: e.message }),
    );
    return () => {
      vigente = false;
    };
  }, [resumen.id]);

  const cerrar = useCallback(() => {
    setSaliendo(true);
    setTimeout(onCerrar, 170);
  }, [onCerrar]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input, textarea, select")) return;
      if (e.key === "Escape") {
        cerrar();
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        onMover(e.key === "ArrowDown" ? 1 : -1);
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [cerrar, onMover]);

  useEffect(() => panel.current?.focus({ preventScroll: true }), []);

  const m = d?.memo ?? resumen;
  const unidad = contexto?.catalogos.unidades.find((u) => u.id === m.unidad_id);
  const tipo = contexto?.catalogos.tipos.find((t) => t.codigo === m.tipo_codigo);
  const linea = d ? lineaDeTiempo(m, d.eventos) : null;

  const copiar = async () => {
    const texto = [
      `MEMO ${m.numero_visible ?? "(borrador)"} · ${m.asunto}`,
      `${unidad?.empresa?.nombre ?? ""} · ${unidad?.nombre ?? ""} · ${tipo?.nombre ?? m.tipo_codigo}`,
      `De: ${m.emisor_nombre} · Para: ${m.destinatario_nombre || m.destinatario_correo}`,
      m.requiere_pago ? `Monto: ${dinero(m.total, m.moneda)}` : "",
      `Estado: ${m.estado}${m.estado_pago ? ` · pago: ${m.estado_pago}` : ""}${linea?.siguiente ? ` · siguiente: ${linea.siguiente}` : ""}`,
      m.pdf_drive_id ? `PDF: ${drive(m.pdf_drive_id)}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1600);
    } catch {
      // sin portapapeles: no pasa nada
    }
  };

  return (
    <>
      {/* En teléfono, el panel tapa la lista: el velo ayuda a cerrarlo. */}
      <div className={`fixed inset-0 z-30 bg-ink/30 md:hidden ${saliendo ? "opacity-0 transition-opacity duration-150" : "animar-velo"}`} onClick={cerrar} />
      <aside
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-label={`Memo ${m.numero_visible ?? "borrador"}`}
        className={`fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-line bg-surface shadow-card outline-none sm:w-105 ${
          saliendo ? "animar-panel-sale" : "animar-panel"
        }`}
      >
        <header className="border-b border-line px-5 pb-4 pt-3.5">
          <div className="flex items-center gap-1">
            <p className="min-w-0 flex-1 truncate text-[10.5px] font-bold uppercase tracking-[0.07em] text-ink-3">
              {tipo?.nombre ?? m.tipo_codigo} · {unidad?.empresa?.codigo ?? ""} · {unidad?.nombre ?? ""}
            </p>
            <button type="button" onClick={() => onMover(-1)} aria-label="Memo anterior" title="Anterior (↑)" className="flex h-7 w-7 items-center justify-center rounded-row text-ink-2 hover:bg-surface-2">
              <span aria-hidden="true">↑</span>
            </button>
            <button type="button" onClick={() => onMover(1)} aria-label="Memo siguiente" title="Siguiente (↓)" className="flex h-7 w-7 items-center justify-center rounded-row text-ink-2 hover:bg-surface-2">
              <span aria-hidden="true">↓</span>
            </button>
            <button type="button" onClick={cerrar} aria-label="Cerrar" title="Cerrar (Esc)" className="flex h-7 w-7 items-center justify-center rounded-row text-ink-2 hover:bg-surface-2">
              <IconoCerrar className="h-4 w-4" />
            </button>
          </div>
          <h2 className="mt-1.5 text-[17px] font-extrabold tabular-nums text-ink">{m.numero_visible ?? "Borrador"}</h2>
          <p className="mt-0.5 text-[13px] font-semibold text-ink-2">{m.asunto || "Sin asunto"}</p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {m.requiere_pago && <span className="mr-1 text-[20px] font-extrabold tabular-nums tracking-[-0.02em] text-ink">{dinero(m.total, m.moneda)}</span>}
            <ChipEstado estado={m.estado} />
            <ChipPago estado={m.estado_pago} />
          </div>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {falla && <Aviso>{falla}</Aviso>}

          {/* En qué va: el paso siguiente y el avance, como en InroPay. */}
          <section className="flex items-center gap-3 rounded-card bg-primary-soft px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-bold text-primary-strong">
                {!linea ? <span className="hueco h-4 w-40" /> : linea.siguiente ? `Siguiente: ${linea.siguiente}` : m.estado === "anulado" ? "Anulado" : "Completo"}
              </p>
              <p className="text-[12px] text-primary-strong/80">
                {m.estado === "observado" && m.ultima_observacion ? `Observado: ${m.ultima_observacion}` : `De ${m.emisor_nombre} para ${m.destinatario_nombre || m.destinatario_correo || "—"}`}
              </p>
            </div>
            {linea && <Avance hechos={linea.hechos} total={linea.total} />}
          </section>

          <section aria-label="Línea de tiempo">
            <h3 className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.07em] text-ink-3">
              Línea de tiempo <span className="font-semibold normal-case tracking-normal">· tiempo entre pasos</span>
            </h3>
            {!linea ? (
              <div className="space-y-3" aria-busy="true">
                {[0, 1, 2, 3].map((i) => (
                  <span key={i} className="hueco block h-5 w-full" />
                ))}
              </div>
            ) : (
              <LineaDeTiempo pasos={linea.pasos} />
            )}
          </section>

          {d && d.lineas.length > 0 && m.confidencialidad === "normal" && (
            <section>
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.07em] text-ink-3">Pagos ({d.lineas.length})</h3>
              <ul className="divide-y divide-line rounded-row border border-line">
                {d.lineas.slice(0, 8).map((l) => (
                  <li key={l.id} className="flex items-start justify-between gap-3 px-3 py-2 text-[12.5px]">
                    <span className="min-w-0">
                      <b className="block truncate font-semibold text-ink">{l.beneficiario || "—"}</b>
                      <span className="text-ink-3">
                        {m.tipo_codigo === ENTREGA_VIATICOS
                          ? periodoViaje(l.viaje_desde, l.viaje_hasta) || l.beneficiario_doc
                          : l.numero
                            ? `${l.serie}-${l.numero}`
                            : l.beneficiario_doc}
                      </span>
                    </span>
                    <span className="whitespace-nowrap font-semibold tabular-nums text-ink">{dinero(l.monto, l.moneda)}</span>
                  </li>
                ))}
              </ul>
              {d.lineas.length > 8 && <p className="mt-1 text-[12px] text-ink-3">y {d.lineas.length - 8} más en el memo.</p>}
            </section>
          )}

          <section>
            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.07em] text-ink-3">Archivos</h3>
            <ul className="space-y-1.5 text-[13px]">
              {m.pdf_drive_id ? (
                <li>
                  <a href={drive(m.pdf_drive_id)} target="_blank" rel="noreferrer" className="font-semibold text-primary hover:underline">
                    PDF del memo aprobado
                  </a>
                </li>
              ) : (
                <li className="text-ink-3">{["aprobado", "enviado", "recibido"].includes(m.estado) ? "El PDF se está generando." : "El PDF sale al aprobarse."}</li>
              )}
              {m.drive_carpeta_id && (
                <li>
                  <a href={drive(m.drive_carpeta_id, true)} target="_blank" rel="noreferrer" className="font-semibold text-primary hover:underline">
                    Carpeta del legajo
                  </a>
                </li>
              )}
              {(d?.sustentos ?? []).map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className="text-left font-semibold text-primary hover:underline"
                    onClick={async () => window.open(s.drive_id ? drive(s.drive_id) : await enlaceSustento(s.ruta), "_blank", "noopener")}
                  >
                    {s.nombre}
                  </button>
                </li>
              ))}
              {d && d.sustentos.length === 0 && <li className="text-ink-3">Sin sustentos adjuntos.</li>}
            </ul>
          </section>
        </div>

        <footer className="flex items-center gap-2 border-t border-line px-5 py-3">
          <Link href={`/memos/memo/?id=${m.id}`} className={`text-[13px] ${botonPrincipal}`}>
            Abrir el memo
          </Link>
          <button type="button" onClick={copiar} className={`text-[13px] ${botonSecundario}`}>
            {copiado ? "Copiado ✓" : "Copiar resumen"}
          </button>
        </footer>
      </aside>
    </>
  );
}

/** El anillo de avance: pasos cumplidos de los que tiene el camino. */
function Avance({ hechos, total }: { hechos: number; total: number }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative flex h-10 w-10 shrink-0 items-center justify-center" aria-label={`${hechos} de ${total} pasos`}>
      <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90">
        <circle cx="18" cy="18" r={r} fill="none" strokeWidth="3.5" className="stroke-surface" />
        <circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          strokeWidth="3.5"
          strokeLinecap="round"
          className="stroke-primary transition-[stroke-dashoffset] duration-500"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - hechos / Math.max(total, 1))}
        />
      </svg>
      <span className="text-[10.5px] font-bold tabular-nums text-primary-strong">
        {hechos}/{total}
      </span>
    </span>
  );
}

export function LineaDeTiempo({ pasos }: { pasos: Paso[] }) {
  const hoyEn = pasos.findIndex((p) => p.estado === "siguiente" || p.estado === "pendiente");
  return (
    <ol className="relative">
      {pasos.map((p, i) => {
        const anterior = i > 0 ? pasos[i - 1] : null;
        const lapso = p.fecha && anterior?.fecha ? corrido(anterior.fecha, p.fecha) : null;
        const punto =
          p.estado === "hecho"
            ? "border-success bg-success text-on-fill"
            : p.estado === "alerta"
              ? "border-danger bg-danger text-on-fill"
              : p.estado === "siguiente"
                ? "border-primary bg-surface text-primary"
                : "border-control bg-surface text-ink-3";
        return (
          <li key={p.clave}>
            {i === hoyEn && (
              <div className="my-1.5 flex items-center gap-2 pl-14 text-[10.5px] font-bold uppercase tracking-[0.07em] text-ink">
                Hoy <span className="h-px flex-1 bg-ink/40" />
              </div>
            )}
            {lapso && <p className="pb-0.5 pl-[4.75rem] text-[10.5px] font-semibold text-ink-3">{lapso}</p>}
            <div className="grid grid-cols-[2.75rem_1.25rem_1fr] items-start gap-x-2.5 pb-3">
              <span className="pt-0.5 text-right text-[11px] leading-tight tabular-nums text-ink-2">
                {p.fecha ? (
                  <>
                    <b className="font-semibold text-ink">{fecha(p.fecha)}</b>
                    <span className="block text-[10px] text-ink-3">{hora(p.fecha)}</span>
                  </>
                ) : null}
              </span>
              <span className={`relative z-10 mt-0.5 flex h-4.5 w-4.5 items-center justify-center rounded-full border-2 text-[9px] font-bold ${punto}`}>
                {p.estado === "hecho" ? "✓" : p.estado === "alerta" ? "!" : ""}
              </span>
              <span className="min-w-0">
                <span className={`block text-[13px] font-semibold ${p.estado === "pendiente" ? "text-ink-3" : p.estado === "alerta" ? "text-danger-strong" : "text-ink"}`}>
                  {p.titulo}
                  {p.estado === "siguiente" && (
                    <span className="ml-2 rounded-full bg-primary-soft px-2 py-0.5 text-[10.5px] font-bold text-primary-strong">Siguiente</span>
                  )}
                </span>
                {(p.quien || p.detalle) && (
                  <span className="block text-[11.5px] text-ink-3">{[p.quien, p.detalle].filter(Boolean).join(" · ")}</span>
                )}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
