"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { tipoCorto } from "@/lib/comprobante";
import { aNumero, soles, type cuentas } from "@/lib/cuentas";
import type { cambiarRendicion } from "@/lib/datos";
import { periodoViaje } from "@/lib/memo-reglas";
import { tituloRendicion } from "@/lib/rendiciones";
import type { Caja, Catalogos, Rendicion } from "@/lib/tipos";
import { Estado } from "../piezas";
import { Texto, celdaBase } from "./celdas";

type Cuentas = ReturnType<typeof cuentas>;
type CambiosRendicion = Parameters<typeof cambiarRendicion>[1];

const rotulo = "text-[11px] font-bold uppercase tracking-wider text-ink-3";

/** Título, estado y acciones de la rendición. */
export function Cabecera({ r, caja, acciones }: { r: Rendicion; caja: Caja | null; acciones: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3 md:pr-12">
      <div className="min-w-0">
        <Link href="/" className="text-[13px] font-medium text-primary-strong hover:underline">
          Mis rendiciones
        </Link>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-[21px] font-extrabold text-ink">{tituloRendicion({ ...r, caja })}</h1>
          <Estado estado={r.estado} />
          {r.version > 0 && <span className="text-[13px] text-ink-3">Versión {r.version}</span>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">{acciones}</div>
    </header>
  );
}

/** Las cuatro primeras columnas de la hoja, las cuentas y qué sustenta, en una sola tarjeta. */
export function Resumen({
  r,
  caja,
  responsable,
  catalogos,
  c,
  porProyecto,
  editable,
  intento,
  onGuardar,
}: {
  r: Rendicion;
  caja: Caja | null;
  responsable: string;
  catalogos: Catalogos;
  c: Cuentas;
  /** Cuánto se gastó en cada proyecto, el mayor primero. */
  porProyecto: { proyecto_id: number | null; cuantos: number; importe: number }[];
  editable: boolean;
  intento: number;
  onGuardar: (cambios: CambiosRendicion) => void;
}) {
  const empresa = catalogos.empresas.find((e) => e.id === r.empresa_id)?.nombre ?? "—";
  // Lo que viene de una entrega de la plataforma no se cambia a mano.
  const memoEditable = editable && r.tipo === "memo" && !r.linea_entrega_id;
  const k = (campo: string, valor: unknown) => `${campo}-${String(valor)}-${intento}`;
  const fuera = new Set(r.no_sustentan ?? []);
  const pasado = c.consumo != null && c.consumo > 100;
  // En teléfono los datos de cabecera se pliegan: ahí lo primero es capturar.
  const [verDatos, setVerDatos] = useState(false);
  const plegable = verDatos ? "" : "hidden md:block";

  return (
    <section aria-label="Resumen" className="grid grid-cols-2 gap-x-6 gap-y-4 rounded-card border border-control bg-surface p-4 sm:px-5 lg:grid-cols-4">
      <button type="button" onClick={() => setVerDatos((v) => !v)} className="col-span-full -mb-1 text-left text-[13px] font-semibold text-primary-strong md:hidden">
        {verDatos ? "Ocultar datos de la rendición" : "Ver datos de la rendición"}
      </button>
      <Dato titulo={r.tipo === "caja" ? "N° de caja" : "N° de memo"} className={plegable}>
        {memoEditable ? (
          <Texto
            key={k("memo", r.numero_memo)}
            valor={r.numero_memo ?? ""}
            etiqueta="N° de memo"
            className={`${celdaBase} -ml-2 text-[15px] font-semibold`}
            onGuardar={(v) => v && onGuardar({ numero_memo: v })}
          />
        ) : (
          <span className="font-semibold">{(r.tipo === "caja" ? caja?.numero : r.numero_memo) ?? "—"}</span>
        )}
      </Dato>
      <Dato titulo="Fecha de solicitud" className={plegable}>
        {editable ? (
          <input
            key={k("fecha", r.fecha_solicitud)}
            type="date"
            aria-label="Fecha de solicitud"
            className={`${celdaBase} -ml-2 text-[15px] font-semibold`}
            defaultValue={r.fecha_solicitud}
            onBlur={(e) => e.target.value && e.target.value !== r.fecha_solicitud && onGuardar({ fecha_solicitud: e.target.value })}
          />
        ) : (
          <span className="font-semibold">{new Date(`${r.fecha_solicitud}T00:00`).toLocaleDateString("es-PE")}</span>
        )}
        {(r.entrega?.viaje_desde || r.entrega?.viaje_hasta) && <span className="block text-xs text-ink-3">Viaje: {periodoViaje(r.entrega.viaje_desde, r.entrega.viaje_hasta)}</span>}
      </Dato>
      <Dato titulo="Empresa" className={plegable}>
        <span className="font-semibold">{empresa}</span>
      </Dato>
      <Dato titulo={r.tipo === "caja" ? "Administrador de caja" : r.beneficiario ? "A nombre de" : "Responsable"} className={plegable}>
        <span className="font-semibold">{r.beneficiario || responsable}</span>
        {r.beneficiario && r.beneficiario_doc !== undefined && (
          <span className="block text-xs text-ink-3">
            DNI {r.beneficiario_doc} · rinde {responsable}
          </span>
        )}
      </Dato>

      <div className={`col-span-full h-px bg-line ${plegable}`} />

      <Dato titulo={r.tipo === "caja" ? "Fondo" : "Recibido"}>
        {memoEditable ? (
          <Texto
            key={k("monto", r.monto)}
            valor={aNumero(r.monto).toFixed(2)}
            etiqueta="Monto recibido"
            inputMode="decimal"
            className={`${celdaBase} -ml-2 text-xl font-bold`}
            onGuardar={(v) => {
              const n = aNumero(v);
              if (n > 0) onGuardar({ monto: n });
            }}
          />
        ) : (
          <Cifra>{soles(r.monto)}</Cifra>
        )}
      </Dato>
      <Dato titulo="Gastado">
        <Cifra>{soles(c.gastado)}</Cifra>
        {c.dolares > 0 && <span className="block text-xs text-ink-3">y US$ {c.dolares.toFixed(2)} sin convertir</span>}
      </Dato>
      <Dato titulo="Sustentado">
        <Cifra>{soles(c.sustentado)}</Cifra>
      </Dato>
      <Dato titulo={c.saldo < 0 ? "A reembolsar" : r.tipo === "caja" ? "Queda en caja" : "Por devolver"}>
        <Cifra tono={c.saldo < 0 ? "text-danger-strong" : undefined}>{soles(Math.abs(c.saldo))}</Cifra>
      </Dato>

      <div className="col-span-full flex flex-wrap items-center gap-x-5 gap-y-2.5">
        <div
          className="flex min-w-60 flex-1 items-center gap-2.5"
          role="progressbar"
          aria-label="Gastado del monto"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.min(c.consumo ?? 0, 100)}
        >
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-line">
            <span className={`block h-full ${pasado ? "bg-danger" : "bg-primary"}`} style={{ width: `${Math.min(c.consumo ?? 0, 100)}%` }} />
          </span>
          <span className={`text-[13px] font-semibold ${pasado ? "text-danger-strong" : "text-ink-2"}`}>{c.consumo == null ? "—" : `${c.consumo} %`}</span>
        </div>
        {c.porTipo.some((t) => t.tipo !== "SIN_TIPO") && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-ink-3">Sustentan:</span>
            {c.porTipo
              .filter((t) => t.tipo !== "SIN_TIPO")
              .map((t) => {
                const cuenta = !fuera.has(t.tipo);
                const nombre = tipoCorto(t.tipo, catalogos.tipos.find((x) => x.id === t.tipo)?.nombre);
                return (
                  <button
                    key={t.tipo}
                    type="button"
                    aria-pressed={cuenta}
                    disabled={!editable}
                    title={`${nombre}: ${t.cuantos} por ${soles(t.importe)}`}
                    onClick={() => onGuardar({ no_sustentan: cuenta ? [...fuera, t.tipo] : [...fuera].filter((x) => x !== t.tipo) })}
                    className={`h-7 rounded-full border px-2.5 text-xs font-medium transition disabled:cursor-default ${
                      cuenta ? "border-primary bg-primary-soft text-primary-strong" : "border-control text-ink-3 line-through"
                    }`}
                  >
                    {nombre} · {t.cuantos}
                  </button>
                );
              })}
          </div>
        )}
      </div>

      {/* En qué proyectos se gastó: lo que administración mira primero cuando un viaje cubre más de uno. */}
      {porProyecto.length > 1 && (
        <div className="col-span-full flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-3 text-[13px]">
          <span className="text-xs text-ink-3">Por proyecto:</span>
          {porProyecto.map((p) => (
            <span key={p.proyecto_id ?? "sin"} className="whitespace-nowrap">
              <span className={p.proyecto_id == null ? "text-warning-strong" : "text-ink-2"}>
                {p.proyecto_id == null ? "Sin proyecto" : (catalogos.proyectos.find((x) => x.id === p.proyecto_id)?.nombre ?? "—")}
              </span>{" "}
              <b className="font-semibold tabular-nums text-ink">{soles(p.importe)}</b>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

function Dato({ titulo, children, className = "" }: { titulo: string; children: ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <p className={rotulo}>{titulo}</p>
      <div className="mt-1 text-[15px] text-ink">{children}</div>
    </div>
  );
}

function Cifra({ children, tono }: { children: ReactNode; tono?: string }) {
  return <span className={`text-xl font-bold ${tono ?? "text-ink"}`}>{children}</span>;
}
