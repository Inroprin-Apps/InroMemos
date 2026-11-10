"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { cuando } from "@/lib/fechas";
import { periodoViaje } from "@/lib/memo-reglas";
import { dinero, useContextoMemos, type Contexto } from "@/lib/memos";
import type { Persona } from "@/lib/sesion";
import { atenderSolicitud, cancelarSolicitud, ESTADOS_SOLICITUD, rechazarSolicitud, useSolicitudes, type Solicitud } from "@/lib/solicitudes";
import { ConSesion } from "../../marco";
import { Aviso, botonPrincipal, botonSecundario, campo } from "../../piezas";
import { Encabezado } from "../piezas-memo";

export function SolicitudesMemo() {
  return <ConSesion activo="solicitudes">{(persona) => <Contenido persona={persona} />}</ConSesion>;
}

type Vista = "recibidas" | "mias";

/** Las solicitudes que llegan a mis áreas (si emito o soy jefatura) y las que pedí yo. */
function Contenido({ persona }: { persona: Persona }) {
  const { solicitudes, error } = useSolicitudes();
  const { contexto } = useContextoMemos(persona.correo);
  const [vista, setVista] = useState<Vista>(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("ver") === "mias" ? "mias" : "recibidas",
  );
  const [verCerradas, setVerCerradas] = useState(false);

  const todas = solicitudes ?? [];
  const recibidas = todas.filter((s) => s.solicitante_id !== persona.id);
  const mias = todas.filter((s) => s.solicitante_id === persona.id);
  const lista = (vista === "recibidas" ? recibidas : mias).filter((s) => verCerradas || s.estado === "pendiente");
  const pendientesRecibidas = recibidas.filter((s) => s.estado === "pendiente").length;
  const atiende = (contexto?.permisos.emite.length ?? 0) > 0 || persona.es_administracion;

  return (
    <div className="space-y-4">
      <Encabezado
        titulo="Solicitudes de memo"
        descripcion="Lo que piden a tus áreas, y lo que pediste tú. El memo lo emite el área; la jefatura puede rechazar con su motivo."
      />
      {error && <Aviso>{error}</Aviso>}

      <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" className="inline-flex rounded-control border border-control bg-surface p-0.75">
          {(atiende ? (["recibidas", "mias"] as Vista[]) : (["mias"] as Vista[])).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={vista === v}
              onClick={() => setVista(v)}
              className={`flex items-center gap-1.5 rounded-segment px-3 py-1.5 text-[12.5px] font-semibold transition-colors duration-150 ${
                vista === v ? "bg-ink text-on-fill" : "text-ink-2 hover:bg-surface-2 hover:text-ink"
              }`}
            >
              {v === "recibidas" ? "Recibidas" : "Mías"}
              {v === "recibidas" && pendientesRecibidas > 0 && (
                <span className="rounded-full bg-danger px-1.5 text-[10.5px] font-bold text-on-fill">{pendientesRecibidas}</span>
              )}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-[13px] text-ink-2">
          <input type="checkbox" checked={verCerradas} onChange={(e) => setVerCerradas(e.target.checked)} />
          Ver también las atendidas, rechazadas y canceladas
        </label>
      </div>

      {!solicitudes ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1].map((i) => (
            <span key={i} className="hueco block h-24 w-full" />
          ))}
        </div>
      ) : lista.length === 0 ? (
        <p className="rounded-card border border-control bg-surface px-5 py-8 text-center text-[13px] text-ink-3">
          {vista === "recibidas" ? "No hay solicitudes pendientes para tus áreas." : "No tienes solicitudes pendientes."}
        </p>
      ) : (
        <ul className="space-y-3">
          {lista.map((s) => (
            <Tarjeta key={s.id} s={s} persona={persona} contexto={contexto} recibida={vista === "recibidas"} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Tarjeta({ s, persona, contexto, recibida }: { s: Solicitud; persona: Persona; contexto: Contexto | null; recibida: boolean }) {
  const router = useRouter();
  const [trabajando, setTrabajando] = useState(false);
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [falla, setFalla] = useState<string | null>(null);
  const u = contexto?.catalogos.unidades.find((x) => x.id === s.unidad_id);
  const t = contexto?.catalogos.tipos.find((x) => x.codigo === s.tipo_codigo);
  const permisos = contexto?.permisos;
  const puedeAtender = recibida && s.estado === "pendiente" && (persona.es_administracion || (permisos?.emite ?? []).includes(s.unidad_id));
  const puedeRechazar = recibida && s.estado === "pendiente" && (persona.es_administracion || (permisos?.aprueba ?? []).includes(s.unidad_id));
  const e = ESTADOS_SOLICITUD[s.estado];

  const hacer = async (f: () => Promise<void>) => {
    setTrabajando(true);
    setFalla(null);
    try {
      await f();
    } catch (err) {
      setFalla((err as Error).message);
      setTrabajando(false);
    }
  };

  return (
    <li className="animar-entrada rounded-card border border-control bg-surface px-5 py-4">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-3">
            {u ? `${u.empresa?.codigo ?? ""} · ${u.nombre}` : "Área"} · {t?.nombre ?? "Tipo a decidir por el área"}
          </p>
          <p className="mt-1 whitespace-pre-line text-[14px] font-semibold text-ink">{s.que}</p>
          <p className="mt-1 text-[12.5px] text-ink-2">
            {[
              recibida ? `Pide ${s.solicitante_nombre}` : null,
              s.monto != null ? dinero(s.monto, s.moneda) : null,
              s.beneficiario ? `${s.beneficiario}${s.beneficiario_doc ? ` (${s.beneficiario_doc})` : ""}` : null,
              periodoViaje(s.viaje_desde, s.viaje_hasta) || null,
              cuando(s.creado_en),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {s.estado === "rechazada" && s.motivo_rechazo && <p className="mt-1.5 text-[12.5px] text-danger-strong">Motivo: {s.motivo_rechazo}</p>}
        </div>
        <span className={`inline-flex rounded-full px-2.5 py-1 text-[12px] font-semibold ${e.clase}`}>{e.texto}</span>
      </div>

      {falla && (
        <div className="mt-3">
          <Aviso>{falla}</Aviso>
        </div>
      )}

      {(puedeAtender || puedeRechazar || (s.memo_id && s.estado === "aceptada") || (!recibida && s.estado === "pendiente")) && (
        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          {puedeAtender && (
            <button
              type="button"
              disabled={trabajando}
              onClick={() => hacer(async () => router.push(`/memos/memo/?id=${await atenderSolicitud(s.id)}`))}
              className={`text-[13px] ${botonPrincipal}`}
            >
              {trabajando ? "Creando el borrador…" : "Atender: crear el memo"}
            </button>
          )}
          {puedeRechazar && !rechazando && (
            <button type="button" disabled={trabajando} onClick={() => setRechazando(true)} className={`text-[13px] ${botonSecundario}`}>
              Rechazar
            </button>
          )}
          {s.memo_id && s.estado === "aceptada" && (
            <Link href={`/memos/memo/?id=${s.memo_id}`} className="text-[13px] font-semibold text-primary hover:underline">
              Ver el memo
            </Link>
          )}
          {!recibida && s.estado === "pendiente" && (
            <button type="button" disabled={trabajando} onClick={() => hacer(() => cancelarSolicitud(s.id))} className="text-[13px] font-semibold text-ink-2 hover:text-danger-strong">
              Cancelar mi solicitud
            </button>
          )}
        </div>
      )}

      {rechazando && (
        <form
          className="animar-entrada mt-3 flex flex-wrap gap-2"
          onSubmit={(ev) => {
            ev.preventDefault();
            hacer(() => rechazarSolicitud(s.id, motivo));
          }}
        >
          <input
            className={`min-w-60 flex-1 ${campo}`}
            value={motivo}
            onChange={(ev) => setMotivo(ev.target.value)}
            placeholder="¿Por qué se rechaza? (lo verá quien la pidió)"
            autoFocus
          />
          <button type="submit" disabled={trabajando || motivo.trim().length < 5} className={`text-[13px] ${botonPrincipal}`}>
            Rechazar
          </button>
          <button type="button" onClick={() => setRechazando(false)} className={`text-[13px] ${botonSecundario}`}>
            Volver
          </button>
        </form>
      )}
    </li>
  );
}
