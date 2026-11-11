"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  descartarSustento,
  enlaceSustento,
  leerSustentoIA,
  leerSustentos,
  subirSustento,
  type Contexto,
  type MemoSustento,
} from "@/lib/memos";
import { IconoSubir } from "../../iconos";
import { Etiqueta } from "../../piezas";
import { Tarjeta } from "../piezas-memo";

const ACEPTA = ".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.xls,.docx";

/**
 * Los sustentos del memo: los que pide el tipo (obligatorios bloquean el
 * envío) y otros de apoyo. Al subir un PDF o una foto, la IA lo lee y lo
 * cruza con las líneas (RUC, número y monto). Se copian al legajo de Drive al
 * aprobarse.
 */
export function Sustentos({
  memoId,
  tipoCodigo,
  contexto,
  editable,
  onCambio,
  paso,
}: {
  memoId: string;
  tipoCodigo: string;
  contexto: Contexto;
  editable: boolean;
  onCambio?: () => void;
  paso?: number;
}) {
  const pedidos = contexto.catalogos.sustentos.filter((s) => s.tipo_codigo === tipoCodigo);
  const [lista, setLista] = useState<MemoSustento[] | null>(null);
  const [subiendo, setSubiendo] = useState<number | "otro" | null>(null);
  const [falla, setFalla] = useState<string | null>(null);

  const recargar = useCallback(() => {
    leerSustentos(memoId).then(setLista, (e: Error) => setFalla(e.message));
  }, [memoId, setFalla]);
  useEffect(recargar, [recargar]);

  const subir = async (archivos: FileList | null, sustentoId: number | null) => {
    if (!archivos?.length) return;
    setSubiendo(sustentoId ?? "otro");
    setFalla(null);
    try {
      for (const a of Array.from(archivos)) {
        if (a.size > 20 * 1024 * 1024) throw new Error(`${a.name} pesa más de 20 MB.`);
        const s = await subirSustento(memoId, a, sustentoId);
        leerSustentoIA(s.id).then(recargar, () => {});
      }
      recargar();
      onCambio?.();
    } catch (e) {
      setFalla((e as Error).message);
    } finally {
      setSubiendo(null);
    }
  };

  if (!editable && !lista?.length && !pedidos.length) return null;
  const de = (id: number | null) => (lista ?? []).filter((s) => s.sustento_id === id);

  return (
    <Tarjeta paso={paso} titulo={editable ? "Sustentos" : "Sustentos y validación"} nota={editable ? "PDF, foto, Excel o Word · hasta 20 MB" : "Se copian al legajo de Drive"}>
      <ul className="space-y-2.5">
        {pedidos.map((p) => (
          <Fila
            key={p.id}
            titulo={p.documento}
            nivel={p.nivel}
            condicion={p.condicion}
            archivos={de(p.id)}
            editable={editable}
            subiendo={subiendo === p.id}
            onSubir={(f) => subir(f, p.id)}
            onQuitar={async (s) => {
              await descartarSustento(s.id).catch((e) => setFalla(e.message));
              recargar();
              onCambio?.();
            }}
          />
        ))}
        {(editable || de(null).length > 0) && (
          <Fila
            titulo="Otros documentos de apoyo"
            archivos={de(null)}
            editable={editable}
            subiendo={subiendo === "otro"}
            onSubir={(f) => subir(f, null)}
            onQuitar={async (s) => {
              await descartarSustento(s.id).catch((e) => setFalla(e.message));
              recargar();
            }}
          />
        )}
      </ul>
      {falla && (
        <p className="mt-2 text-[13px] text-danger-strong" role="alert">
          {falla}
        </p>
      )}
    </Tarjeta>
  );
}

function Fila({
  titulo,
  nivel,
  condicion,
  archivos,
  editable,
  subiendo,
  onSubir,
  onQuitar,
}: {
  titulo: string;
  nivel?: "obligatorio" | "condicional" | "recomendado";
  condicion?: string;
  archivos: MemoSustento[];
  editable: boolean;
  subiendo: boolean;
  onSubir: (f: FileList | null) => void;
  onQuitar: (s: MemoSustento) => void;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const falta = nivel === "obligatorio" && archivos.length === 0;
  return (
    <li className="rounded-row border border-line px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        {nivel && (
          <Etiqueta tono={nivel === "obligatorio" ? (falta ? "peligro" : "ok") : nivel === "condicional" ? "aviso" : "neutro"}>
            {nivel === "obligatorio" ? (falta ? "Falta" : "Listo") : nivel === "condicional" ? "Si aplica" : "Recomendado"}
          </Etiqueta>
        )}
        <span className="text-[13.5px] font-semibold text-ink">{titulo}</span>
        {condicion && <span className="text-[12px] text-ink-3">· {condicion}</span>}
        {editable && (
          <>
            <input ref={entrada} type="file" accept={ACEPTA} multiple className="hidden" onChange={(e) => onSubir(e.target.files)} />
            <button
              type="button"
              onClick={() => entrada.current?.click()}
              disabled={subiendo}
              className="ml-auto inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-primary hover:text-primary-strong disabled:text-disabled-ink"
            >
              <IconoSubir className="h-4 w-4" />
              {subiendo ? "Subiendo…" : "Adjuntar"}
            </button>
          </>
        )}
      </div>
      {archivos.length > 0 && (
        <ul className="mt-1.5 space-y-1">
          {archivos.map((s) => (
            <li key={s.id} className="text-[12.5px]">
              <span className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="truncate font-semibold text-primary hover:underline"
                  onClick={async () => window.open(await enlaceSustento(s.ruta), "_blank", "noopener")}
                >
                  {s.nombre}
                </button>
                <span className="text-ink-3">{Math.max(1, Math.round(s.tamano / 1024))} KB</span>
                {s.drive_id && <span className="text-success-strong">en el legajo</span>}
                {editable && (
                  <button type="button" onClick={() => onQuitar(s)} className="font-semibold text-danger-strong hover:underline">
                    Quitar
                  </button>
                )}
              </span>
              {s.lectura?.avisos?.map((a) => (
                <span key={a} className="mt-0.5 block text-warning-strong">
                  La IA leyó el documento: {a}
                </span>
              ))}
              {s.lectura?.avisos && s.lectura.avisos.length === 0 && s.lectura.total != null && (
                <span className="mt-0.5 block text-success-strong">La IA lo leyó y coincide con la línea.</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
