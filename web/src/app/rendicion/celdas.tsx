"use client";

import { useEffect, useState } from "react";
import { enlacesDeArchivos } from "@/lib/subida";
import type { Archivo } from "@/lib/tipos";

/**
 * Celdas tipo planilla: se leen como texto y se editan al hacer clic. Guardan
 * al salir, y solo si el valor cambió.
 */

/** La celda sin tamaño de letra, para usarla también en cifras grandes. */
export const celdaBase =
  "w-full min-w-0 rounded-md border border-transparent bg-transparent px-2 py-1 text-ink outline-none transition " +
  "hover:border-control focus:border-primary focus:bg-surface focus:ring-2 focus:ring-primary-soft " +
  "disabled:cursor-default disabled:hover:border-transparent disabled:text-ink";

export const celda = `${celdaBase} text-[13.5px]`;

export const celdaChica = `${celdaBase} text-xs !text-ink-3`;

/** Una celda vacía que hace falta llenar. */
export const celdaFalta = "border-warning/50 bg-warning-soft/60";

export function Texto({
  valor,
  etiqueta,
  onGuardar,
  disabled,
  inputMode,
  className = celda,
  placeholder,
}: {
  valor: string;
  etiqueta: string;
  onGuardar: (v: string) => void;
  disabled?: boolean;
  inputMode?: "decimal" | "numeric" | "text";
  className?: string;
  placeholder?: string;
}) {
  return (
    <input
      aria-label={etiqueta}
      title={valor || undefined}
      className={className}
      defaultValue={valor}
      disabled={disabled}
      inputMode={inputMode}
      placeholder={placeholder}
      onKeyDown={(e) => {
        // Enter confirma como en una planilla.
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      onBlur={(e) => {
        const v = e.target.value.trim();
        if (v !== valor) onGuardar(v);
      }}
    />
  );
}

export type Opcion = { id: string | number; nombre: string; activo: boolean };

export function Lista({
  valor,
  etiqueta,
  opciones,
  onGuardar,
  disabled,
  className = celda,
  vacio = "—",
}: {
  valor: string | number | null;
  etiqueta: string;
  opciones: Opcion[];
  onGuardar: (v: string) => void;
  disabled?: boolean;
  className?: string;
  vacio?: string;
}) {
  return (
    <select
      aria-label={etiqueta}
      className={`${className} ${disabled ? "appearance-none" : ""}`}
      value={valor ?? ""}
      disabled={disabled}
      onChange={(e) => onGuardar(e.target.value)}
    >
      <option value="">{vacio}</option>
      {/* Lo desactivado no se ofrece, salvo que esta fila ya lo use. */}
      {opciones
        .filter((o) => o.activo || String(o.id) === String(valor))
        .map((o) => (
          <option key={o.id} value={o.id}>
            {o.nombre}
          </option>
        ))}
    </select>
  );
}

/** Enlaces firmados (una hora) a las imágenes de la rendición, pedidos de una vez. */
export function useEnlaces(archivos: Archivo[]): Record<string, string> {
  const [enlaces, setEnlaces] = useState<Record<string, string>>({});
  const rutas = archivos
    .filter((a) => a.ruta)
    .map((a) => `${a.id}:${a.ruta}`)
    .join("|");
  useEffect(() => {
    if (!rutas) return;
    let vigente = true;
    const pares = rutas.split("|").map((p) => p.split(":") as [string, string]);
    enlacesDeArchivos(pares.map(([, ruta]) => ruta))
      .then((urls) => vigente && setEnlaces(Object.fromEntries(pares.map(([id], i) => [id, urls[i]]))))
      .catch(() => {});
    return () => {
      vigente = false;
    };
  }, [rutas]);
  return enlaces;
}

/** La miniatura de la imagen de una fila; un PDF se muestra como tal, con su página. */
export function Miniatura({
  archivo,
  pagina,
  enlace,
  className = "h-11 w-9",
}: {
  archivo: Archivo | undefined;
  pagina: number;
  enlace: string | undefined;
  className?: string;
}) {
  if (!archivo) {
    return (
      <span className={`flex ${className} items-center justify-center rounded-md border border-dashed border-control text-[10px] text-ink-3`}>
        a mano
      </span>
    );
  }
  const pdf = archivo.tipo_mime === "application/pdf";
  // Aprobada la rendición, la imagen vive en Drive (la copia se verificó antes
  // de borrarla de la app): la miniatura sale de ahí.
  if (!archivo.ruta && archivo.drive_id) return <MiniaturaDrive id={archivo.drive_id} pdf={pdf} pagina={pagina} className={className} />;
  if (!enlace) return <span className={`block ${className} animate-pulse rounded-md bg-surface-2`} />;
  if (pdf) {
    return (
      <span className={`flex ${className} items-center justify-center rounded-md border border-control bg-surface-2 text-[10px] font-bold text-ink-2`}>
        PDF{pagina > 1 ? ` ${pagina}` : ""}
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- enlace firmado y temporal: no pasa por el optimizador
  return <img src={enlace} alt="Comprobante" className={`${className} rounded-md border border-control object-cover`} />;
}

/** La miniatura de una imagen archivada en Drive; si Drive no la da (sin acceso), un rótulo. */
function MiniaturaDrive({ id, pdf, pagina, className }: { id: string; pdf: boolean; pagina: number; className: string }) {
  const [falla, setFalla] = useState(false);
  if (falla || pdf) {
    return (
      <span title="Archivada en Drive" className={`flex ${className} items-center justify-center rounded-md border border-control bg-surface-2 text-[10px] font-bold text-ink-2`}>
        {pdf ? `PDF${pagina > 1 ? ` ${pagina}` : ""}` : "Drive"}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- miniatura de Drive: no pasa por el optimizador
    <img
      src={`https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w160`}
      alt="Comprobante (en Drive)"
      title="Archivada en Drive"
      referrerPolicy="no-referrer"
      onError={() => setFalla(true)}
      className={`${className} rounded-md border border-control object-cover`}
    />
  );
}

/** La imagen archivada, para abrirla aparte o verla dentro de la app. */
export const enlaceDrive = (id: string) => `https://drive.google.com/file/d/${encodeURIComponent(id)}/view`;
export const vistaDrive = (id: string) => `https://drive.google.com/file/d/${encodeURIComponent(id)}/preview`;
