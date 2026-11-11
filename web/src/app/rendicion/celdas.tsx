"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { recargarCatalogos } from "@/lib/catalogos";
import type { EstadoFila } from "@/lib/comprobante";
import { proponerProyecto } from "@/lib/datos";
import { enlacesDeArchivos } from "@/lib/subida";
import type { Archivo, Proyecto } from "@/lib/tipos";
import { Aviso, botonPrincipal, botonSecundario, campo } from "../piezas";

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

/** El color del estado de una fila, el mismo en la hoja y al revisar con imagen. */
export const TONOS_FILA: Record<EstadoFila["clave"], string> = {
  listo: "text-success-strong",
  leyendo: "text-primary-strong",
  falta: "text-warning-strong",
  repetido: "text-warning-strong",
  fuera: "text-warning-strong",
  fallido: "text-danger-strong",
  observado: "text-danger-strong",
  descartado: "text-ink-3",
};

/** `grupo`: bajo qué título va en la lista (los conceptos, por su categoría). */
export type Opcion = { id: string | number; nombre: string; activo: boolean; grupo?: string };

/** Los conceptos como opciones agrupadas por categoría: 34 en fila cuestan leerse. */
export const opcionesDeConceptos = (conceptos: { id: number; nombre: string; activo: boolean; categoria: string }[]): Opcion[] =>
  [...conceptos].sort((a, b) => a.categoria.localeCompare(b.categoria) || a.nombre.localeCompare(b.nombre)).map((c) => ({ ...c, grupo: c.categoria }));

export function Lista({
  valor,
  etiqueta,
  opciones,
  onGuardar,
  disabled,
  className = celda,
  vacio = "—",
  otra,
}: {
  valor: string | number | null;
  etiqueta: string;
  opciones: Opcion[];
  onGuardar: (v: string) => void;
  disabled?: boolean;
  className?: string;
  vacio?: string;
  /** Una última opción que no es un valor: abre algo (proponer un proyecto). */
  otra?: { texto: string; onElegir: () => void };
}) {
  // Lo desactivado no se ofrece, salvo que esta fila ya lo use.
  const visibles = opciones.filter((o) => o.activo || String(o.id) === String(valor));
  const grupos = [...new Set(visibles.map((o) => o.grupo).filter((g): g is string => Boolean(g)))];
  const opcion = (o: Opcion) => (
    <option key={o.id} value={o.id}>
      {o.nombre}
    </option>
  );
  return (
    <select
      aria-label={etiqueta}
      className={`${className} ${disabled ? "appearance-none" : ""}`}
      value={valor ?? ""}
      disabled={disabled}
      onChange={(e) => (e.target.value === OTRA ? otra?.onElegir() : onGuardar(e.target.value))}
    >
      <option value="">{vacio}</option>
      {grupos.length
        ? grupos.map((g) => (
            <optgroup key={g} label={g}>
              {visibles.filter((o) => o.grupo === g).map(opcion)}
            </optgroup>
          ))
        : visibles.map(opcion)}
      {otra && !disabled && <option value={OTRA}>{otra.texto}</option>}
    </select>
  );
}

const OTRA = "__otra";

/**
 * La lista de proyectos. Si el proyecto no está, quien rinde lo propone ahí
 * mismo y sigue: queda «por confirmar» hasta que administración lo revise.
 */
export function ListaProyecto({
  valor,
  proyectos,
  onGuardar,
  disabled,
  className = celda,
  vacio = "Elegir…",
}: {
  valor: number | null;
  proyectos: Proyecto[];
  onGuardar: (id: number | null) => void;
  disabled?: boolean;
  className?: string;
  vacio?: string;
}) {
  const [proponiendo, setProponiendo] = useState(false);
  return (
    <>
      <Lista
        valor={valor}
        etiqueta="Proyecto"
        opciones={proyectos.map((p) => (p.confirmado === false ? { ...p, nombre: `${p.nombre} (por confirmar)` } : p))}
        disabled={disabled}
        className={className}
        vacio={vacio}
        onGuardar={(v) => onGuardar(v ? Number(v) : null)}
        otra={{ texto: "＋ No está en la lista…", onElegir: () => setProponiendo(true) }}
      />
      {proponiendo && (
        <ProponerProyecto
          onCerrar={() => setProponiendo(false)}
          onListo={(id) => {
            setProponiendo(false);
            onGuardar(id);
          }}
        />
      )}
    </>
  );
}

function ProponerProyecto({ onCerrar, onListo }: { onCerrar: () => void; onListo: (id: number) => void }) {
  const [nombre, setNombre] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [falla, setFalla] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);
  useEffect(() => {
    entrada.current?.focus();
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [onCerrar]);

  const proponer = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setGuardando(true);
    setFalla(null);
    try {
      const id = await proponerProyecto(nombre);
      await recargarCatalogos();
      onListo(id);
    } catch (err) {
      setFalla((err as Error).message);
      setGuardando(false);
    }
  };

  // En el cuerpo de la página, no dentro de la celda: la lista puede vivir en un <label>.
  return createPortal(
    <div className="animar-velo fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center sm:p-4" onClick={onCerrar}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="proponer-titulo"
        onSubmit={proponer}
        onClick={(e) => e.stopPropagation()}
        className="animar-dialogo w-full max-w-md rounded-t-card bg-surface p-5 text-left shadow-card sm:rounded-card sm:p-6"
      >
        <h2 id="proponer-titulo" className="text-lg font-bold normal-case tracking-normal text-ink">
          ¿Tu proyecto no está en la lista?
        </h2>
        <p className="mt-1 text-[13px] font-normal normal-case tracking-normal text-ink-2">
          Escríbelo y sigue con tu rendición. Queda «por confirmar» hasta que administración lo revise; si ya existía con otro nombre, lo corrigen ellos.
        </p>
        <label className="mt-4 block text-[12.5px] font-semibold normal-case tracking-normal text-ink-2">
          Nombre del proyecto o centro de costo
          <input
            ref={entrada}
            className={`mt-1 uppercase ${campo}`}
            value={nombre}
            maxLength={80}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="PAQ 10 CHINA CIVIL"
          />
        </label>
        {falla && (
          <div className="mt-3">
            <Aviso>{falla}</Aviso>
          </div>
        )}
        <div className="mt-5 flex gap-2">
          <button type="submit" disabled={guardando || nombre.trim().length < 3} className={`flex-1 ${botonPrincipal}`}>
            {guardando ? "Guardando…" : "Usar este proyecto"}
          </button>
          <button type="button" onClick={onCerrar} className={botonSecundario}>
            Cancelar
          </button>
        </div>
      </form>
    </div>,
    document.body,
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
