"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { memoDesdeRendicion, useContextoMemos, ESTADOS_MEMO, type Memo } from "@/lib/memos";
import type { Persona } from "@/lib/sesion";
import { supabase } from "@/lib/supabase";
import { Aviso, botonPrincipal, campoSuelto } from "../piezas";

/**
 * El puente entre una rendición y la Plataforma de Memorandums. Aprobada la
 * rendición, su pago se pide con un memo (reposición de caja chica o reembolso
 * de viáticos) que la base arma ya llenado: memo_desde_rendicion().
 */
export function PuenteMemo({ rendicionId, estado, persona }: { rendicionId: string; estado: string; persona: Persona }) {
  const router = useRouter();
  const { contexto } = useContextoMemos(persona.correo);
  const [memos, setMemos] = useState<Pick<Memo, "id" | "numero_visible" | "estado">[] | null>(null);
  const [unidad, setUnidad] = useState<number | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [falla, setFalla] = useState<string | null>(null);

  useEffect(() => {
    supabase()
      .from("memos")
      .select("id, numero_visible, estado")
      .eq("rendicion_id", rendicionId)
      .then(({ data }) => setMemos(data ?? []));
  }, [rendicionId]);

  if (!memos || !["aprobada", "repuesta", "liquidada"].includes(estado)) return null;

  const vigente = memos.find((m) => m.estado !== "anulado");
  if (vigente) {
    return (
      <Aviso tono="info">
        Su pago se pide con el memo{" "}
        <Link href={`/memos/memo/?id=${vigente.id}`} className="font-semibold underline">
          {vigente.numero_visible ?? "en borrador"}
        </Link>{" "}
        ({ESTADOS_MEMO[vigente.estado].texto.toLowerCase()}).
      </Aviso>
    );
  }
  if (estado !== "aprobada" || !persona.es_administracion || !contexto) return null;

  const unidades = contexto.catalogos.unidades.filter((u) => u.activo);
  const elegida = unidad ?? unidades.find((u) => u.codigo === "FINANZAS")?.id ?? null;

  const armar = async () => {
    if (!elegida) return;
    setTrabajando(true);
    setFalla(null);
    try {
      const m = await memoDesdeRendicion(rendicionId, elegida);
      router.push(`/memos/memo/?id=${m.id}`);
    } catch (e) {
      setFalla((e as Error).message);
      setTrabajando(false);
    }
  };

  return (
    <section className="flex flex-wrap items-center gap-2.5 rounded-card border border-primary-line bg-primary-soft px-4 py-3 text-[13px] text-primary-strong">
      <span className="min-w-60 flex-1">
        <b className="font-semibold">Aprobada.</b> Pide su pago con un memo: se arma solo con el monto y el beneficiario, y queda en borrador
        para revisarlo.
      </span>
      <select aria-label="Área que emite el memo" className={`text-[13px] ${campoSuelto}`} value={elegida ?? ""} onChange={(e) => setUnidad(Number(e.target.value) || null)}>
        {unidades.map((u) => (
          <option key={u.id} value={u.id}>
            {u.empresa?.codigo} · {u.nombre}
          </option>
        ))}
      </select>
      <button type="button" className={`text-[13px] ${botonPrincipal}`} disabled={!elegida || trabajando} onClick={armar}>
        {trabajando ? "Armando…" : "Pedir el pago con un memo"}
      </button>
      {falla && <p className="w-full text-danger-strong">{falla}</p>}
    </section>
  );
}
