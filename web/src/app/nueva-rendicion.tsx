"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useCatalogos } from "@/lib/catalogos";
import { aNumero, soles } from "@/lib/cuentas";
import { crearMemo, crearReposicion, leerMisCajas } from "@/lib/datos";
import { guardarMiDni, memosParaRendir, miDni, type MemoParaRendir } from "@/lib/memos";
import { EN_CURSO, recargarRendiciones, useRendiciones } from "@/lib/rendiciones";
import type { Persona } from "@/lib/sesion";
import type { Caja } from "@/lib/tipos";
import { IconoCerrar } from "./iconos";
import { Aviso, botonPrincipal, botonSecundario, campo } from "./piezas";

const hoy = () => new Date().toLocaleDateString("en-CA"); // AAAA-MM-DD en la hora local

/** Abrir un memo de viáticos o la reposición que sigue de una caja propia. */
export function NuevaRendicion({ persona, onCerrar }: { persona: Persona; onCerrar: () => void }) {
  const router = useRouter();
  const { catalogos } = useCatalogos();
  const { rendiciones } = useRendiciones();
  const [cajas, setCajas] = useState<Caja[]>([]);
  const [error, setError] = useState<string | null>(null);
  const dialogo = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let vigente = true;
    leerMisCajas(persona.id).then(
      (c) => vigente && setCajas(c),
      () => {},
    );
    dialogo.current?.querySelector<HTMLInputElement>("input")?.focus();
    const alTeclear = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    window.addEventListener("keydown", alTeclear);
    return () => {
      vigente = false;
      window.removeEventListener("keydown", alTeclear);
    };
  }, [persona.id, onCerrar]);

  const abrir = async (id: string) => {
    await recargarRendiciones();
    onCerrar();
    router.push(`/rendicion/?id=${id}`);
  };

  // Una caja con su ciclo en curso no ofrece abrir otro: la base no lo permitiría.
  const ocupadas = new Set(
    (rendiciones ?? []).filter((r) => (EN_CURSO as readonly string[]).includes(r.estado)).map((r) => r.caja_id),
  );

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4" onClick={onCerrar}>
      <div
        ref={dialogo}
        role="dialog"
        aria-modal="true"
        aria-labelledby="nueva-titulo"
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-card bg-surface p-5 shadow-card sm:rounded-card sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="nueva-titulo" className="text-lg font-bold text-ink">
            Nueva rendición
          </h2>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="rounded-control p-2 text-ink-2 hover:bg-surface-2">
            <IconoCerrar />
          </button>
        </div>

        {cajas.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-sm font-medium text-ink-2">Caja chica que administras</p>
            {cajas.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={ocupadas.has(c.id)}
                onClick={async () => {
                  setError(null);
                  try {
                    await abrir(await crearReposicion(c, persona.id));
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
                className={`flex w-full items-center justify-between gap-3 text-left ${botonSecundario}`}
              >
                <span>Nueva reposición · Caja {c.numero}</span>
                <span className="text-sm text-ink-2">
                  {ocupadas.has(c.id) ? "Tiene una en curso" : `Fondo ${soles(c.monto_fondo)}`}
                </span>
              </button>
            ))}
          </div>
        )}

        <FormularioMemo
          persona={persona}
          empresas={(catalogos?.empresas ?? []).filter((e) => e.activo)}
          onCreado={abrir}
          conCajas={cajas.length > 0}
        />
        {error && (
          <div className="mt-3">
            <Aviso>{error}</Aviso>
          </div>
        )}
      </div>
    </div>
  );
}

function FormularioMemo({
  persona,
  empresas,
  onCreado,
  conCajas,
}: {
  persona: Persona;
  empresas: { id: number; nombre: string }[];
  onCreado: (id: string) => Promise<void>;
  conCajas: boolean;
}) {
  const [numero, setNumero] = useState("");
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState(hoy());
  const [empresaElegida, setEmpresa] = useState<number | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Con una sola empresa activa no hay nada que elegir.
  const empresa = empresaElegida ?? (empresas.length === 1 ? empresas[0].id : null);

  // Los memos de viáticos de la plataforma que me entregaron dinero y no rendí.
  const [dni, setDni] = useState<string | null | undefined>(undefined);
  const [nuevoDni, setNuevoDni] = useState("");
  const [paraRendir, setParaRendir] = useState<MemoParaRendir[]>([]);
  useEffect(() => {
    miDni().then(setDni, () => setDni(null));
    memosParaRendir().then(setParaRendir, () => setParaRendir([]));
  }, []);

  const rendirMemo = async (m: MemoParaRendir) => {
    setGuardando(true);
    setError(null);
    try {
      await onCreado(
        await crearMemo({
          numero_memo: m.numero_visible,
          monto: Number(m.monto),
          fecha_solicitud: fecha,
          empresa_id: m.empresa_id,
          responsable_id: persona.id,
          memo_entrega_id: m.id,
        }),
      );
    } catch (err) {
      setError((err as Error).message);
      setGuardando(false);
    }
  };

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    const importe = aNumero(monto);
    if (!numero.trim()) return setError("Escribe el número de memo.");
    if (!(importe > 0)) return setError("Escribe el monto que recibiste.");
    if (empresa == null) return setError("Elige la empresa.");
    setGuardando(true);
    setError(null);
    try {
      await onCreado(
        await crearMemo({
          numero_memo: numero.trim(),
          monto: importe,
          fecha_solicitud: fecha,
          empresa_id: empresa,
          responsable_id: persona.id,
        }),
      );
    } catch (err) {
      setError((err as Error).message);
      setGuardando(false);
    }
  };

  return (
    <form onSubmit={crear} className={`space-y-4 ${conCajas ? "mt-6 border-t border-line pt-5" : "mt-4"}`}>
      <p className="text-sm font-medium text-ink-2">Memo de viáticos</p>
      {paraRendir.length > 0 && (
        <div className="space-y-2">
          <p className="text-[13px] text-ink-2">Tus memos de viáticos aprobados, listos para rendir:</p>
          {paraRendir.map((m) => (
            <button
              key={m.id}
              type="button"
              disabled={guardando}
              onClick={() => rendirMemo(m)}
              className="flex w-full items-center justify-between gap-3 rounded-control border border-primary-line bg-primary-soft px-3 py-2.5 text-left hover:bg-surface-2"
            >
              <span className="min-w-0">
                <b className="block text-[13.5px] font-semibold text-primary-strong">Rendir el memo {m.numero_visible}</b>
                <span className="block truncate text-[12px] text-ink-2">{m.asunto}</span>
              </span>
              <span className="whitespace-nowrap text-[13px] font-semibold tabular-nums text-ink">{soles(Number(m.monto))}</span>
            </button>
          ))}
          <p className="text-[12px] text-ink-3">O escribe uno emitido fuera de la plataforma:</p>
        </div>
      )}
      {dni === null && (
        <div className="flex flex-wrap items-end gap-2 rounded-control bg-surface-2 px-3 py-2.5">
          <label className="min-w-40 flex-1 text-[12.5px] text-ink-2">
            Tu DNI: con él aparecen aquí tus memos de viáticos de la plataforma
            <input className={`mt-1 ${campo}`} inputMode="numeric" maxLength={8} value={nuevoDni} onChange={(e) => setNuevoDni(e.target.value.replace(/\D/g, ""))} />
          </label>
          <button
            type="button"
            className={botonSecundario}
            disabled={nuevoDni.length !== 8}
            onClick={() =>
              guardarMiDni(nuevoDni).then(
                () => (setDni(nuevoDni), memosParaRendir().then(setParaRendir, () => {})),
                (e: Error) => setError(e.message),
              )
            }
          >
            Guardar DNI
          </button>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block text-sm font-medium text-ink-2">
          N° de memo
          <input className={`mt-1 ${campo}`} value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="675-2026" />
        </label>
        <label className="block text-sm font-medium text-ink-2">
          Monto recibido
          <input
            className={`mt-1 ${campo}`}
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            inputMode="decimal"
          />
        </label>
        <label className="block text-sm font-medium text-ink-2">
          Fecha de solicitud
          <input className={`mt-1 ${campo}`} type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </label>
        {empresas.length > 1 && (
          <label className="block text-sm font-medium text-ink-2 sm:col-span-3">
            Empresa
            <select className={`mt-1 ${campo}`} value={empresa ?? ""} onChange={(e) => setEmpresa(Number(e.target.value) || null)}>
              <option value="">Elige…</option>
              {empresas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {error && <Aviso>{error}</Aviso>}
      <button type="submit" className={`w-full ${botonPrincipal}`} disabled={guardando}>
        {guardando ? "Creando…" : "Crear memo"}
      </button>
    </form>
  );
}
