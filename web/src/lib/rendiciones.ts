"use client";

import { useSyncExternalStore } from "react";
import { leerRendiciones, type RendicionConResumen } from "./datos";

/**
 * Las rendiciones visibles, compartidas entre la barra lateral, el inicio y la
 * bandeja: se leen una vez y se vuelven a leer cuando algo cambia, en vez de
 * que cada pantalla pida lo mismo por su lado.
 */

type Estado = { rendiciones: RendicionConResumen[] | null; error: string | null; sinSenal?: boolean };

const CLAVE = "inroscan.rendiciones";

// Lo último que se vio, para mostrar algo (y poder capturar) sin señal.
function guardada(): RendicionConResumen[] | null {
  try {
    return JSON.parse(localStorage.getItem(CLAVE) ?? "null");
  } catch {
    return null;
  }
}

let actual: Estado = { rendiciones: null, error: null };
let enCurso: Promise<void> | null = null;
const oyentes = new Set<() => void>();

function avisar(nuevo: Estado) {
  actual = nuevo;
  oyentes.forEach((f) => f());
}

export function recargarRendiciones(): Promise<void> {
  enCurso = leerRendiciones()
    .then(
      (rendiciones) => {
        try {
          localStorage.setItem(CLAVE, JSON.stringify(rendiciones));
        } catch {
          // lleno o bloqueado: se sigue sin copia
        }
        avisar({ rendiciones, error: null });
      },
      (e: Error) => {
        const copia = actual.rendiciones ?? guardada();
        if (copia && /^Sin conexión/.test(e.message)) avisar({ rendiciones: copia, error: null, sinSenal: true });
        else avisar({ ...actual, error: e.message });
      },
    )
    .finally(() => {
      enCurso = null;
    });
  return enCurso;
}

function suscribir(f: () => void) {
  oyentes.add(f);
  if (!actual.rendiciones && !enCurso) recargarRendiciones();
  return () => oyentes.delete(f);
}

const sinDatos: Estado = { rendiciones: null, error: null };

export function useRendiciones(): Estado {
  return useSyncExternalStore(suscribir, () => actual, () => sinDatos);
}

export const EN_CURSO = ["abierta", "enviada", "observada"] as const;
export const ABIERTAS = ["abierta", "observada"] as const;
export const CERRADAS = ["aprobada", "repuesta", "liquidada"] as const;

export function tituloRendicion(r: {
  tipo: string;
  numero_memo: string | null;
  correlativo: number | null;
  caja?: { numero: string } | null;
  beneficiario?: string | null;
}): string {
  if (r.tipo !== "memo") return `Caja ${r.caja?.numero ?? "?"} · Reposición ${r.correlativo}`;
  // Varias personas de una misma entrega: cada rendición dice de quién es.
  return r.beneficiario ? `Memo ${r.numero_memo} · ${r.beneficiario}` : `Memo ${r.numero_memo}`;
}
