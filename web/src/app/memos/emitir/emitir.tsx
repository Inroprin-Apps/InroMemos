"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { crearBorrador, useContextoMemos, type TipoMemo } from "@/lib/memos";
import type { Persona } from "@/lib/sesion";
import { IconoBuscar } from "../../iconos";
import { ConSesion } from "../../marco";
import { Aviso, botonPrincipal, campo } from "../../piezas";
import { AvisoCorte, ChipPropuesta, Encabezado, Tarjeta } from "../piezas-memo";

export function EmitirMemo() {
  return <ConSesion activo="emitir">{(persona) => <Contenido persona={persona} />}</ConSesion>;
}

const CONFIDENCIAL = { normal: "", restringido: "Restringido", confidencial: "Confidencial" } as const;

function describir(t: TipoMemo): string {
  const partes = [t.lleva_pago ? "Lleva pago" : "Sin pago"];
  if (t.pasa_analisis) partes.push("pasa a Análisis y Registro");
  if (t.modo_lineas === "detalle") partes.push(`una línea por persona (se agrupa desde ${t.agrupa_desde ?? 15})`);
  if (t.modo_lineas === "por_documento") partes.push("una línea por comprobante");
  if (t.modo_lineas === "agrupado_cc") partes.push("una línea por concepto y centro de costo");
  if (t.confidencialidad !== "normal") partes.push(`${CONFIDENCIAL[t.confidencialidad].toLowerCase()}: el PDF no lista personas`);
  return partes.join(" · ");
}

function Contenido({ persona }: { persona: Persona }) {
  const router = useRouter();
  const { contexto, error } = useContextoMemos(persona.correo);
  const [unidad, setUnidad] = useState<number | null>(null);
  const [tipo, setTipo] = useState<string | null>(null);
  const [buscar, setBuscar] = useState("");
  const [creando, setCreando] = useState(false);
  const [falla, setFalla] = useState<string | null>(null);

  if (error) return <Aviso>{error}</Aviso>;
  if (!contexto) return <p className="text-ink-3">Abriendo…</p>;

  const { catalogos, permisos } = contexto;
  const mias = catalogos.unidades.filter((u) => u.activo && (persona.es_administracion || permisos.emite.includes(u.id)));
  const elegida = unidad ?? (mias.length === 1 ? mias[0].id : null);
  const u = mias.find((x) => x.id === elegida) ?? null;

  if (mias.length === 0) {
    return (
      <div className="space-y-4">
        <Encabezado titulo="Emitir memo" />
        <Aviso tono="info">Emiten memos quienes están en un área. Si necesitas uno, usa «Solicitar memo» en el menú: le llega a la jefatura del área y el área lo emite.</Aviso>
      </div>
    );
  }

  const q = buscar.trim().toLowerCase();
  const tipos = catalogos.tipos.filter(
    (t) => t.activo && (!q || `${t.nombre} ${t.familia} ${t.codigo}`.toLowerCase().includes(q)),
  );
  const familias = [...new Set(tipos.map((t) => t.familia))];
  const t = catalogos.tipos.find((x) => x.codigo === tipo) ?? null;

  const crear = async () => {
    if (!elegida || !tipo) return;
    setCreando(true);
    setFalla(null);
    try {
      const m = await crearBorrador({ unidad_id: elegida, tipo_codigo: tipo });
      router.push(`/memos/memo/?id=${m.id}`);
    } catch (e) {
      setFalla((e as Error).message);
      setCreando(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Encabezado
        titulo="Emitir memo"
        descripcion="Solo lo esencial: el área, qué tipo de memo es y, después, qué quieres decir. El número, la fecha y el papel salen solos."
      />

      <Tarjeta paso={1} titulo="Quién emite" nota="Tomado de tu sesión">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">De (emisor)</p>
            <p className="rounded-control border border-dashed border-control px-3 py-2 text-ink">{persona.nombre || persona.correo}</p>
          </div>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">Empresa y área</span>
            <select className={campo} value={elegida ?? ""} onChange={(e) => setUnidad(Number(e.target.value) || null)}>
              {mias.length > 1 && <option value="">Elige el área</option>}
              {mias.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.empresa?.nombre} · {x.nombre}
                </option>
              ))}
            </select>
          </label>
        </div>
        {u && (
          <p className="mt-3 rounded-row bg-primary-soft px-3 py-2 text-[13px] text-primary-strong">
            El número lo asigna la base al enviar (serie {u.empresa?.codigo ?? "—"} · {u.codigo}); nadie lo escribe ni lo repite.
            {u.requiere_aprobacion
              ? " Esta área exige aprobación del jefe o suplente. Los memos con pago siempre los aprueba otra persona: nadie se aprueba sus propios pagos."
              : " Esta área no exige aprobación: se aprueba al emitir."}
          </p>
        )}
      </Tarjeta>

      <Tarjeta paso={2} titulo="¿Qué quieres decir? Primero, el tipo de memo" nota={`${catalogos.tipos.length} tipos, agrupados por cómo se comportan`}>
        <label className="relative mb-3 block">
          <span className="sr-only">Buscar tipo</span>
          <IconoBuscar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
          <input
            type="search"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            placeholder="Escribe una palabra: vacaciones, proveedor, fianza, reembolso…"
            className={`pl-9 ${campo}`}
          />
        </label>
        <div className="max-h-[46dvh] space-y-3 overflow-y-auto pr-1">
          {familias.map((f) => (
            <div key={f}>
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.07em] text-ink-3">{f}</p>
              <div className="flex flex-wrap gap-1.5">
                {tipos
                  .filter((x) => x.familia === f)
                  .map((x) => (
                    <button
                      key={x.codigo}
                      type="button"
                      aria-pressed={tipo === x.codigo}
                      onClick={() => setTipo(x.codigo)}
                      className={`rounded-full border px-3 py-1.5 text-[12.5px] font-semibold ${
                        tipo === x.codigo ? "border-ink bg-ink text-on-fill" : "border-control bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink"
                      }`}
                    >
                      {x.nombre}
                      {x.propuesto_inromemos ? (
                        <ChipPropuesta className="ml-1.5" />
                      ) : (
                        !x.confirmado && <span className={tipo === x.codigo ? "" : "text-ink-3"}> · propuesto</span>
                      )}
                    </button>
                  ))}
              </div>
            </div>
          ))}
          {tipos.length === 0 && <p className="text-[13px] text-ink-3">Ningún tipo coincide. Prueba con otra palabra, o elige «Otros / no catalogado».</p>}
        </div>
        {t && (
          <p className="mt-3 rounded-row border border-line bg-surface-2 px-3 py-2 text-[13px] text-ink-2">
            <b className="font-semibold">
              {t.nombre} · {t.codigo}
            </b>
            <br />
            {describir(t)}
          </p>
        )}
      </Tarjeta>

      {t?.lleva_pago && <AvisoCorte />}
      {falla && <Aviso>{falla}</Aviso>}

      <div className="flex justify-end">
        <button type="button" className={botonPrincipal} disabled={!elegida || !tipo || creando} onClick={crear}>
          {creando ? "Creando…" : "Continuar con el memo"}
        </button>
      </div>
    </div>
  );
}
