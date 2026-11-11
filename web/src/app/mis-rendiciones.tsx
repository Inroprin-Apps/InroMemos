"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { faltan } from "@/lib/comprobante";
import { aNumero, cuentas, soles } from "@/lib/cuentas";
import type { RendicionConResumen } from "@/lib/datos";
import { cuando, fechaCorta } from "@/lib/fechas";
import { ABIERTAS, CERRADAS, tituloRendicion, useRendiciones } from "@/lib/rendiciones";
import type { Persona } from "@/lib/sesion";
import { NuevaRendicion } from "./nueva-rendicion";
import { Aviso, Estado, botonPrincipal } from "./piezas";

type Pestana = "abiertas" | "revision" | "cerradas";

const en = (lista: readonly string[], estado: string) => lista.includes(estado);

/** Cómo va una rendición, listo para mostrar. */
function resumen(r: RendicionConResumen) {
  const c = cuentas(r.comprobantes, r.monto, r.no_sustentan ?? []);
  const porCompletar = r.comprobantes.filter((x) => faltan(x).length > 0).length;
  const saldo =
    c.saldo < 0 ? `${soles(-c.saldo)} a reembolsar` : `${soles(c.saldo)} ${r.tipo === "caja" ? "en caja" : "por devolver"}`;
  return { c, porCompletar, saldo };
}

export function MisRendiciones({ persona }: { persona: Persona }) {
  const { rendiciones, error, sinSenal } = useRendiciones();
  const [pestana, setPestana] = useState<Pestana | null>(null);
  const [nueva, setNueva] = useState(false);
  const cerrarNueva = useCallback(() => setNueva(false), []);

  const mias = (rendiciones ?? []).filter((r) => r.responsable_id === persona.id);
  const abiertas = mias.filter((r) => en(ABIERTAS, r.estado));
  const enRevision = mias.filter((r) => r.estado === "enviada");
  const cerradas = mias.filter((r) => en(CERRADAS, r.estado));
  const observadas = mias.filter((r) => r.estado === "observada");

  // Sin elección, se abre la primera pestaña que tenga algo.
  const vista: Pestana = pestana ?? (abiertas.length ? "abiertas" : enRevision.length ? "revision" : "abiertas");
  const lista = { abiertas, revision: enRevision, cerradas }[vista];

  const sumar = (l: RendicionConResumen[], f: (r: RendicionConResumen) => number) => l.reduce((s, r) => s + f(r), 0);
  const gastadoAbiertas = sumar(abiertas, (r) => resumen(r).c.gastado);
  const montoAbiertas = sumar(abiertas, (r) => aNumero(r.monto));
  const porDevolver = sumar(abiertas, (r) => Math.max(resumen(r).c.saldo, 0));
  const aReembolsar = sumar(abiertas, (r) => Math.max(-resumen(r).c.saldo, 0));

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3 md:pr-12">
        <div>
          <h1 className="text-[21px] font-extrabold text-ink">Mis rendiciones</h1>
          <p className="mt-1 text-ink-2">Tus memos de viáticos y las cajas chicas que administras.</p>
        </div>
        <button type="button" onClick={() => setNueva(true)} className={botonPrincipal}>
          Nueva rendición
        </button>
      </header>

      {error && <Aviso>{error}</Aviso>}
      {sinSenal && <Aviso tono="aviso">Sin conexión: ves lo último guardado en este equipo.</Aviso>}
      {rendiciones == null && !error && (
        <p className="text-ink-3" role="status">
          Cargando…
        </p>
      )}

      {rendiciones && (
        <section aria-label="Resumen" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Indicador titulo="En curso" valor={String(abiertas.length)} detalle={`${soles(gastadoAbiertas)} de ${soles(montoAbiertas)}`} />
          <Indicador titulo="En revisión" valor={String(enRevision.length)} detalle="Esperando a administración" />
          <Indicador
            titulo="Observadas"
            valor={String(observadas.length)}
            detalle={observadas[0] ? `${tituloRendicion(observadas[0])}: ${observadas[0].observacion || "revisa las filas marcadas"}` : "Nada pendiente"}
            alerta={observadas.length > 0}
          />
          <Indicador
            titulo="Por devolver"
            valor={soles(porDevolver)}
            detalle={aReembolsar > 0 ? `y ${soles(aReembolsar)} a reembolsarte` : "De lo que sigue abierto"}
          />
        </section>
      )}

      {rendiciones && (
        <section className="rounded-card border border-control bg-surface p-4">
          <div role="tablist" aria-label="Estado" className="flex flex-wrap gap-1.5">
            <Pestanita activa={vista === "abiertas"} onClick={() => setPestana("abiertas")}>
              Abiertas · {abiertas.length}
            </Pestanita>
            <Pestanita activa={vista === "revision"} onClick={() => setPestana("revision")}>
              En revisión · {enRevision.length}
            </Pestanita>
            <Pestanita activa={vista === "cerradas"} onClick={() => setPestana("cerradas")}>
              Cerradas · {cerradas.length}
            </Pestanita>
          </div>

          {lista.length === 0 ? (
            <p className="mt-4 text-ink-2">
              {vista === "abiertas" ? (
                <>
                  No tienes rendiciones abiertas. Empieza con{" "}
                  <button type="button" onClick={() => setNueva(true)} className="font-semibold text-primary-strong underline">
                    Nueva rendición
                  </button>{" "}
                  cuando recibas el dinero de un viaje o repongas una caja.
                </>
              ) : vista === "revision" ? (
                "Nada esperando revisión."
              ) : (
                "Todavía no hay rendiciones cerradas."
              )}
            </p>
          ) : (
            <>
              <div className="mt-3 hidden overflow-x-auto rounded-control border border-line md:block">
                <table className="w-full min-w-[860px] border-collapse text-sm">
                  <thead>
                    <tr className="bg-surface-2 text-left text-[11px] font-bold uppercase tracking-wider text-ink-3">
                      <th scope="col" className="px-3 py-2.5">Rendición</th>
                      <th scope="col" className="px-3 py-2.5">Solicitada</th>
                      <th scope="col" className="px-3 py-2.5">Comprobantes</th>
                      <th scope="col" className="w-[30%] px-3 py-2.5">Avance</th>
                      <th scope="col" className="px-3 py-2.5 text-right">Saldo</th>
                      <th scope="col" className="px-3 py-2.5">Estado</th>
                      <th scope="col" className="px-3 py-2.5">Último cambio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map((r) => {
                      const { c, porCompletar, saldo } = resumen(r);
                      return (
                        <tr key={r.id} className="border-t border-line">
                          <td className="px-3 py-3">
                            <Link href={`/rendicion/?id=${r.id}`} className="font-semibold text-primary-strong hover:underline">
                              {tituloRendicion(r)}
                            </Link>
                            <span className="block text-xs text-ink-3">{r.tipo === "memo" ? "Memo de viáticos" : "Caja chica"}</span>
                          </td>
                          <td className="px-3 py-3">{fechaCorta(r.fecha_solicitud)}</td>
                          <td className="px-3 py-3">
                            {c.comprobantes}
                            <span className={`block text-xs ${porCompletar ? "font-semibold text-warning-strong" : "text-ink-3"}`}>
                              {porCompletar ? `${porCompletar} por completar` : c.comprobantes ? "Todo completo" : "Sin comprobantes"}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <Avance consumo={c.consumo} texto={`${soles(c.gastado)} de ${soles(r.monto)}`} rojo={r.estado === "observada"} />
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{saldo}</td>
                          <td className="px-3 py-3">
                            <Estado estado={r.estado} />
                          </td>
                          <td className="px-3 py-3 text-[13px] text-ink-3">{cuando(r.actualizado_en ?? r.creado_en)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <ul className="mt-3 space-y-2 md:hidden">
                {lista.map((r) => {
                  const { c, porCompletar, saldo } = resumen(r);
                  return (
                    <li key={r.id}>
                      <Link href={`/rendicion/?id=${r.id}`} className="block rounded-card border border-line p-3.5">
                        <span className="flex items-start justify-between gap-2">
                          <span className="font-semibold text-ink">{tituloRendicion(r)}</span>
                          <Estado estado={r.estado} />
                        </span>
                        <span className="mt-1 block text-xs text-ink-3">
                          {c.comprobantes} comprobante{c.comprobantes === 1 ? "" : "s"}
                          {porCompletar ? ` · ${porCompletar} por completar` : ""} · {saldo}
                        </span>
                        <span className="mt-2.5 block">
                          <Avance consumo={c.consumo} texto={`${soles(c.gastado)} de ${soles(r.monto)}`} rojo={r.estado === "observada"} />
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
      )}

      {nueva && <NuevaRendicion persona={persona} onCerrar={cerrarNueva} />}
    </div>
  );
}

export function Indicador({
  titulo,
  valor,
  detalle,
  alerta,
}: {
  titulo: string;
  valor: string;
  detalle: string;
  alerta?: boolean;
}) {
  return (
    <div className={`rounded-card border border-control p-4 ${alerta ? "bg-danger-soft text-danger-strong" : "bg-surface"}`}>
      <p className={`text-xs font-bold uppercase tracking-wider ${alerta ? "" : "text-ink-3"}`}>{titulo}</p>
      <p className="mt-1.5 text-2xl font-bold">{valor}</p>
      <p className={`mt-0.5 line-clamp-2 text-[13px] ${alerta ? "" : "text-ink-3"}`}>{detalle}</p>
    </div>
  );
}

export function Pestanita({ activa, onClick, children }: { activa: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={activa}
      onClick={onClick}
      className={`h-8.5 rounded-full px-3 text-[13px] transition ${
        activa ? "bg-ink font-semibold text-on-fill" : "border border-control bg-surface font-medium text-ink-2 hover:bg-surface-2"
      }`}
    >
      {children}
    </button>
  );
}

function Avance({ consumo, texto, rojo }: { consumo: number | null; texto: string; rojo?: boolean }) {
  const pasado = consumo != null && consumo > 100;
  return (
    <span className="flex items-center gap-2.5">
      <span
        className="h-2 flex-1 overflow-hidden rounded-full bg-line"
        role="progressbar"
        aria-label="Gastado del monto"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(consumo ?? 0, 100)}
      >
        <span className={`block h-full ${rojo || pasado ? "bg-danger" : "bg-primary"}`} style={{ width: `${Math.min(consumo ?? 0, 100)}%` }} />
      </span>
      <span className="whitespace-nowrap text-[13px] text-ink-2">{texto}</span>
    </span>
  );
}
