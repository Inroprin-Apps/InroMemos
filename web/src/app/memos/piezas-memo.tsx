"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { ruta } from "@/lib/base";
import { enmascarar, proximoCiclo, textoCorte, textoDia } from "@/lib/memo-reglas";
import { ESTADOS_MEMO, ESTADOS_PAGO, dinero, type EstadoMemo, type EstadoPago, type Linea, type Memo } from "@/lib/memos";
import { IconoReloj } from "../iconos";

/** Chip de estado: la palabra y el color dicen lo mismo. */
export function ChipEstado({ estado }: { estado: EstadoMemo }) {
  const e = ESTADOS_MEMO[estado];
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[12.5px] font-semibold ${e.clase}`}>{e.texto}</span>;
}

export function ChipPago({ estado }: { estado: EstadoPago | null }) {
  if (!estado) return null;
  const clase = estado === "pagado" ? "bg-success-soft text-success-strong" : estado === "observado_analisis" ? "bg-danger-soft text-danger-strong" : "bg-primary-soft text-primary-strong";
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[12.5px] font-semibold ${clase}`}>{ESTADOS_PAGO[estado]}</span>;
}

/** El título de cada pantalla, con su explicación y, a la derecha, sus acciones. */
export function Encabezado({ titulo, descripcion, children }: { titulo: string; descripcion?: string; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[21px] font-extrabold text-ink">{titulo}</h1>
        {descripcion && <p className="mt-0.5 text-ink-2">{descripcion}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2.5">{children}</div>}
    </header>
  );
}

/** Una cifra clave: etiqueta, número grande, nota; punto rojo si hay algo que revisar. */
export function Kpi({
  etiqueta,
  valor,
  nota,
  riesgo,
  className = "",
}: {
  etiqueta: string;
  valor: ReactNode;
  nota?: string;
  riesgo?: boolean;
  className?: string;
}) {
  return (
    <div className={`min-w-0 rounded-card border border-control bg-surface px-4.5 pb-3.5 pt-4 ${className}`}>
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
        {riesgo && <span className="h-2 w-2 shrink-0 rounded-full bg-danger" aria-label="Hay algo que revisar" />}
        {etiqueta}
      </p>
      <p className="truncate text-2xl font-extrabold leading-tight tracking-[-0.025em] text-ink tabular-nums">{valor}</p>
      {nota && <p className="mt-1.5 text-xs text-ink-2">{nota}</p>}
    </div>
  );
}

export function Tarjeta({ titulo, nota, children, className = "" }: { titulo?: string; nota?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 rounded-card border border-control bg-surface px-5.5 py-5 ${className}`}>
      {(titulo || nota) && (
        <div className="mb-3.5 flex flex-wrap items-baseline justify-between gap-2.5">
          {titulo && <h2 className="text-[15px] font-bold text-ink">{titulo}</h2>}
          {nota && <span className="text-xs text-ink-3">{nota}</span>}
        </div>
      )}
      {children}
    </section>
  );
}

/** Próximo corte de memos (lun/mié 16:00) y su día de pago (mar/jue). */
export function AvisoCorte({ ahora = new Date() }: { ahora?: Date }) {
  const c = proximoCiclo(ahora);
  return (
    <p className="flex flex-wrap items-center gap-2 rounded-card bg-warning-soft px-4 py-3 text-[13px] text-warning-strong">
      <IconoReloj className="h-4.5 w-4.5 shrink-0" />
      <b className="font-semibold">Próximo corte: {textoCorte(c.corte)}</b>
      <span>· se paga el {textoDia(c.pago)}. Lo aprobado a las 4:00 pm exactas ya pasa al siguiente.</span>
    </p>
  );
}

/** La base ya guarda «••••4521»; si llegara algo sin enmascarar, se enmascara acá. */
const cuentaVisible = (c: string) => (!c ? "" : c.startsWith("••••") ? c : enmascarar(c).padStart(8, "•"));

/** Fecha del papel: «Lima, 6 de noviembre de 2026». */
function fechaPapel(iso: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  return `Lima, ${d.toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Lima" })}`;
}

/**
 * El memo como sale en el PDF: membrete, A / DE / ASUNTO / FECHA, cuerpo,
 * líneas de pago con la cuenta enmascarada y el bloque de aprobación. Si es
 * restringido o confidencial, sin personas: solo el total.
 */
export function Papel({
  memo,
  lineas,
  empresa,
  unidad,
  firmante,
}: {
  memo: Memo;
  lineas: Linea[];
  empresa: string;
  unidad: string;
  firmante?: string;
}) {
  const reservado = memo.confidencialidad !== "normal";
  const total = lineas.reduce((s, l) => s + (Number(l.monto) || 0), 0);
  const numero = memo.numero_visible ?? "se asigna al enviar";
  return (
    <article className="rounded-row border border-line bg-surface px-7 py-7 text-[13px] leading-relaxed text-ink" aria-label="Vista previa del memo">
      <header className="flex items-center justify-between gap-4 border-b-2 border-primary pb-3">
        {empresa.toUpperCase() === "INROPRIN" ? (
          <Image src={ruta("inroprin.svg")} alt="INROPRIN · Roland Print" width={150} height={34} className="h-8.5 w-auto" />
        ) : (
          <span className="text-lg font-extrabold">{empresa}</span>
        )}
        <span className="text-right text-[11px] text-ink-3">{unidad}</span>
      </header>
      <h3 className="mt-5 text-[15px] font-extrabold tracking-wide">MEMORÁNDUM {numero}</h3>
      <dl className="mt-3 grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-1">
        <dt className="font-bold">A:</dt>
        <dd>{memo.destinatario_nombre || memo.destinatario_correo || "—"}</dd>
        <dt className="font-bold">DE:</dt>
        <dd>{memo.emisor_nombre}</dd>
        <dt className="font-bold">ASUNTO:</dt>
        <dd>{memo.asunto || "—"}</dd>
        <dt className="font-bold">FECHA:</dt>
        <dd>{fechaPapel(memo.emitido_en)}</dd>
      </dl>
      <div className="mt-4 whitespace-pre-line">{memo.cuerpo || <span className="text-ink-3">El cuerpo del memo aparece acá.</span>}</div>

      {memo.requiere_pago && lineas.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          {reservado ? (
            <p className="rounded-row bg-surface-2 px-3 py-2">
              Total: <b className="tabular-nums">{dinero(total, memo.moneda)}</b> en {lineas.length} pago{lineas.length === 1 ? "" : "s"}. El detalle va en un
              anexo de acceso restringido.
            </p>
          ) : (
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr className="border-b border-control text-left text-[10.5px] uppercase tracking-wide text-ink-3">
                  <th className="py-1.5 pr-2 font-semibold">Beneficiario</th>
                  <th className="py-1.5 pr-2 font-semibold">Comprobante</th>
                  <th className="py-1.5 pr-2 font-semibold">Banco · cuenta</th>
                  <th className="py-1.5 text-right font-semibold">Monto</th>
                </tr>
              </thead>
              <tbody>
                {lineas.map((l) => (
                  <tr key={l.id} className="border-b border-line align-top">
                    <td className="py-1.5 pr-2">
                      {l.beneficiario || "—"}
                      <span className="block text-[11px] text-ink-3">{l.beneficiario_doc}</span>
                    </td>
                    <td className="whitespace-nowrap py-1.5 pr-2 tabular-nums">{l.numero ? `${l.serie}-${l.numero}` : "—"}</td>
                    <td className="whitespace-nowrap py-1.5 pr-2 tabular-nums">{l.banco ? `${l.banco} ${cuentaVisible(l.cuenta || l.cci)}` : "—"}</td>
                    <td className="whitespace-nowrap py-1.5 text-right tabular-nums">{dinero(l.monto, l.moneda)}</td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={3} className="py-1.5 text-right font-bold">
                    Total
                  </td>
                  <td className="whitespace-nowrap py-1.5 text-right font-bold tabular-nums">{dinero(total, memo.moneda)}</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      )}

      <p className="mt-5">Atentamente,</p>

      <div
        className={`mt-5 rounded-row border-2 px-4 py-3 ${memo.codigo_sello ? "border-success text-success-strong" : "border-dashed border-control text-ink-3"}`}
      >
        {memo.codigo_sello ? (
          <>
            <p className="font-extrabold tracking-wide">APROBADO</p>
            <p className="text-[12px]">
              {firmante ? `${firmante} · ` : ""}
              {memo.aprobado_en && new Date(memo.aprobado_en).toLocaleString("es-PE", { timeZone: "America/Lima", dateStyle: "short", timeStyle: "short" })} ·
              código <span className="font-semibold tabular-nums">{memo.codigo_sello}</span>
            </p>
          </>
        ) : (
          <p className="text-[12px]">El sello de aprobación aparece acá al aprobar.</p>
        )}
      </div>
    </article>
  );
}
