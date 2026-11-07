"use client";

import { useEffect, useRef, useState } from "react";
import { quitar, usePendientes } from "@/lib/cola";
import { herencia } from "@/lib/comprobante";
import { useEnLinea } from "@/lib/conexion";
import { capturar, reintentar } from "@/lib/envio";
import type { Persona } from "@/lib/sesion";
import type { Comprobante, Rendicion } from "@/lib/tipos";
import { IconoCamara, IconoSinSenal, IconoSubir } from "../iconos";
import { Aviso, botonPrincipal, botonSecundario } from "../piezas";

/**
 * Lo que se captura va primero a la cola del teléfono (lib/cola.ts) y de ahí
 * al servidor: con señal sube enseguida; sin ella, espera.
 */
export function useSubidas({
  obtener,
  persona,
  filasActuales,
}: {
  /** La rendición al momento de subir (la pantalla puede no tenerla todavía). */
  obtener: () => Rendicion | null;
  persona: Persona;
  filasActuales: () => Comprobante[];
}) {
  const [errores, setErrores] = useState<string[]>([]);

  const recibir = async (lista: File[]) => {
    const rendicion = obtener();
    if (!lista.length || !rendicion) return;
    setErrores([]);
    // Lo que se hereda se calcula una vez: todo el lote va al mismo proyecto.
    const base = herencia(filasActuales(), rendicion.tipo, persona);
    setErrores(await capturar(rendicion.id, lista, base));
  };

  return { errores, recibir };
}

/**
 * En PC, «Subir fotos o PDF»; en teléfono (telefono), la cámara primero y en
 * grande, porque ahí se captura de pie y con una mano.
 */
export function BotonesSubida({ onArchivos, telefono }: { onArchivos: (l: File[]) => void; telefono?: boolean }) {
  const elegir = useRef<HTMLInputElement>(null);
  const camara = useRef<HTMLInputElement>(null);
  const tomar = (l: FileList | null) => l && onArchivos([...l]);
  return (
    <>
      {telefono ? (
        <>
          <button type="button" onClick={() => camara.current?.click()} className={`flex h-14 items-center justify-center gap-2.5 text-base ${botonPrincipal}`}>
            <IconoCamara className="h-6 w-6" />
            Tomar foto
          </button>
          <button type="button" onClick={() => elegir.current?.click()} className={`h-14 text-sm ${botonSecundario}`}>
            Galería o PDF
          </button>
        </>
      ) : (
        <button type="button" onClick={() => elegir.current?.click()} className={`flex items-center gap-2 ${botonPrincipal}`}>
          <IconoSubir className="h-4 w-4" />
          Subir fotos o PDF
        </button>
      )}
      {telefono && (
        <input
          ref={camara}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          aria-label="Tomar foto"
          onChange={(e) => {
            tomar(e.target.files);
            e.target.value = "";
          }}
        />
      )}
      <input
        ref={elegir}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="hidden"
        aria-label={telefono ? "Elegir de la galería o un PDF" : "Elegir fotos o PDF"}
        onChange={(e) => {
          tomar(e.target.files);
          e.target.value = "";
        }}
      />
    </>
  );
}

/** Lo que todavía está en el teléfono, y por qué. */
export function EnCola({ rendicionId, errores }: { rendicionId: string; errores: string[] }) {
  const pendientes = usePendientes(rendicionId);
  const enLinea = useEnLinea();
  const bloqueados = pendientes.filter((p) => p.bloqueado);
  const esperando = pendientes.filter((p) => !p.bloqueado);
  if (!pendientes.length && !errores.length) return null;
  return (
    <div className="space-y-2">
      {errores.map((e) => (
        <Aviso key={e}>{e}</Aviso>
      ))}
      {esperando.length > 0 &&
        (enLinea ? (
          <p role="status" className="rounded-control bg-primary-soft px-4 py-3 text-sm text-primary-strong">
            Subiendo {esperando.length} archivo{esperando.length === 1 ? "" : "s"}…
          </p>
        ) : (
          <div role="status" className="flex gap-3 rounded-control bg-warning-soft px-4 py-3 text-sm text-warning-strong">
            <IconoSinSenal className="mt-0.5 h-5 w-5 shrink-0" />
            <p>
              <b>Sin señal.</b> {esperando.length} foto{esperando.length === 1 ? "" : "s"} guardada{esperando.length === 1 ? "" : "s"} en
              el teléfono: se suben y se leen solas cuando vuelva la conexión.
              <span className="block text-[13px]">En iPhone, abre la app cuando tengas internet para que se suba todo.</span>
            </p>
          </div>
        ))}
      {bloqueados.map((p) => (
        <div key={p.clave} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-control bg-danger-soft px-4 py-2.5 text-sm text-danger-strong">
          <span className="font-semibold">{p.nombre}:</span>
          <span className="flex-1">{p.error}</span>
          <button type="button" className="font-semibold underline" onClick={() => reintentar(p)}>
            Reintentar
          </button>
          <button type="button" className="underline" onClick={() => quitar(p.clave)}>
            Quitar
          </button>
        </div>
      ))}
    </div>
  );
}

/** Mientras se arrastran archivos sobre la ventana, toda la pantalla los recibe. */
export function ZonaArrastre({ onArchivos }: { onArchivos: (l: File[]) => void }) {
  const [encima, setEncima] = useState(false);
  const alSoltar = useRef(onArchivos);
  useEffect(() => {
    alSoltar.current = onArchivos;
  }, [onArchivos]);

  useEffect(() => {
    let profundidad = 0;
    const conArchivos = (e: DragEvent) => !!e.dataTransfer?.types.includes("Files");
    const entra = (e: DragEvent) => {
      if (!conArchivos(e)) return;
      profundidad++;
      setEncima(true);
    };
    const sale = () => {
      profundidad = Math.max(0, profundidad - 1);
      if (!profundidad) setEncima(false);
    };
    const sobre = (e: DragEvent) => conArchivos(e) && e.preventDefault();
    const suelta = (e: DragEvent) => {
      if (!conArchivos(e)) return;
      e.preventDefault();
      profundidad = 0;
      setEncima(false);
      alSoltar.current([...(e.dataTransfer?.files ?? [])]);
    };
    window.addEventListener("dragenter", entra);
    window.addEventListener("dragleave", sale);
    window.addEventListener("dragover", sobre);
    window.addEventListener("drop", suelta);
    return () => {
      window.removeEventListener("dragenter", entra);
      window.removeEventListener("dragleave", sale);
      window.removeEventListener("dragover", sobre);
      window.removeEventListener("drop", suelta);
    };
  }, []);

  if (!encima) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-primary/15 p-6">
      <div className="rounded-card border-2 border-dashed border-primary bg-surface px-10 py-8 text-center shadow-card">
        <IconoSubir className="mx-auto h-8 w-8 text-primary-strong" />
        <p className="mt-2 text-lg font-bold text-ink">Suelta para subir</p>
        <p className="text-sm text-ink-2">Fotos o PDF: se leen solos.</p>
      </div>
    </div>
  );
}
