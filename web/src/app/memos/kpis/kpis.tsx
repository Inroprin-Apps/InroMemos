"use client";

import { useEffect, useState } from "react";
import { dinero, leerKpis, useContextoMemos, type Kpis } from "@/lib/memos";
import type { Persona } from "@/lib/sesion";
import { TEXTO_ACCION, type Accion } from "@/lib/valoracion";
import { ConSesion, veKpis } from "../../marco";
import { Aviso, campoSuelto, Etiqueta } from "../../piezas";
import { Encabezado, Kpi, Tarjeta } from "../piezas-memo";

export function KpisMemos() {
  return <ConSesion activo="kpis">{(persona) => <Contenido persona={persona} />}</ConSesion>;
}

const hoy = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
const haceDias = (n: number) => new Date(Date.now() - n * 864e5).toLocaleDateString("en-CA", { timeZone: "America/Lima" });
const horas = (h: number | null) => (h == null ? "—" : h < 1 ? `${Math.round(h * 60)} min` : h >= 48 ? `${Math.round(h / 24)} d` : `${h.toLocaleString("es-PE")} h`);
const minutos = (m: number | null) => (m == null ? "—" : m < 1 ? "< 1 min" : `${m.toLocaleString("es-PE")} min`);
const pct = (p: number | null) => (p == null ? "—" : `${p}%`);
/** La escala de 1 a 5, en palabras (sin caritas). */
const ESCALA = ["", "Muy mal", "Mal", "Regular", "Bien", "Muy bien"];

/**
 * Indicadores de la plataforma, para las jefaturas (cada una ve sus áreas;
 * administración y «Ver KPIs», todas): calidad de respuesta, tiempos de
 * ejecución, acogida de los usuarios y la última auditoría externa.
 */
function Contenido({ persona }: { persona: Persona }) {
  const { contexto } = useContextoMemos(persona.correo);
  const [desde, setDesde] = useState(haceDias(90));
  const [hasta, setHasta] = useState(hoy());
  const [k, setK] = useState<Kpis | null>(null);
  const [falla, setFalla] = useState<string | null>(null);
  const permitido = veKpis(persona, contexto?.permisos);

  useEffect(() => {
    if (!permitido) return;
    let vigente = true;
    leerKpis(desde, hasta).then(
      (r) => vigente && (setK(r), setFalla(null)),
      (e: Error) => vigente && setFalla(e.message),
    );
    return () => {
      vigente = false;
    };
  }, [desde, hasta, permitido]);

  if (contexto && !permitido) {
    return (
      <div className="space-y-4">
        <Encabezado titulo="Métricas y KPIs" />
        <Aviso tono="info">Los indicadores son para las jefaturas de área. Si los necesitas, pídeselo a administración.</Aviso>
      </div>
    );
  }
  const hueco = <span className="hueco h-6.5 w-20" />;
  const totalAcogida = Math.max(1, Object.values(k?.acogida_dist ?? {}).reduce((s, x) => s + x, 0));

  return (
    <div className="space-y-5">
      <Encabezado
        titulo="Métricas y KPIs"
        descripcion={k ? (k.alcance === "todas" ? "Todas las áreas." : `Tus áreas: ${k.alcance}.`) : "Calidad, tiempos y acogida de la plataforma."}
      >
        <label className="flex items-center gap-2 text-[13px] text-ink-2">
          Desde
          <input type="date" className={campoSuelto} value={desde} onChange={(e) => setDesde(e.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-[13px] text-ink-2">
          Hasta
          <input type="date" className={campoSuelto} value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </label>
      </Encabezado>
      {falla && <Aviso>{falla}</Aviso>}

      <Seccion titulo="Calidad de respuesta" nota="Lo que sale bien a la primera, sin observaciones ni devoluciones">
        <Kpi
          etiqueta="Aprobados a la primera"
          valor={k ? pct(k.a_la_primera_pct) : hueco}
          nota={k ? `de ${k.emitidos} emitidos en el período` : undefined}
          riesgo={!!k && k.a_la_primera_pct != null && k.a_la_primera_pct < 80}
        />
        <Kpi etiqueta="Observaciones" valor={k ? k.observaciones : hueco} nota={k ? `${k.observados_alguna_vez} memos observados alguna vez` : undefined} />
        <Kpi
          etiqueta="Devueltos por Análisis"
          valor={k ? k.devueltos_analisis : hueco}
          nota="observados al revisar el pago"
          riesgo={!!k && k.devueltos_analisis > 0}
        />
        <Kpi etiqueta="Anulados" valor={k ? k.anulados : hueco} nota={k ? `${k.pendientes} esperan aprobación` : undefined} />
      </Seccion>

      <Seccion titulo="Tiempos de ejecución" nota="Medianas: la mitad de los casos tardó menos que esto">
        <Kpi etiqueta="Aprobar" valor={k ? horas(k.horas_aprobacion_mediana) : hueco} nota={k ? `promedio ${horas(k.horas_aprobacion)}` : undefined} />
        <Kpi
          etiqueta={`Cargo en meta (${k?.meta_horas ?? 3} h)`}
          valor={k ? pct(k.cargo_en_meta_pct) : hueco}
          nota={k ? `promedio ${horas(k.horas_cargo)}` : undefined}
          riesgo={!!k && k.cargo_en_meta_pct != null && k.cargo_en_meta_pct < 80}
        />
        <Kpi etiqueta="De aprobado a pagado" valor={k ? horas(k.horas_pago_mediana) : hueco} nota={k ? `${k.pagados} pagados` : undefined} />
        <Kpi
          etiqueta="Avisos por correo"
          valor={k ? minutos(k.correo_minutos_mediana) : hueco}
          nota={k ? `${k.correos} correos · ${k.correos_con_error} con error` : undefined}
          riesgo={!!k && k.correos_con_error > 0}
        />
      </Seccion>

      <div className="grid gap-4 lg:grid-cols-2">
        <Tarjeta titulo="Acogida de los usuarios" nota={k ? `${k.acogida_n} valoraciones de cada acción` : undefined}>
          {!k ? (
            <span className="hueco h-24 w-full" />
          ) : k.acogida_n === 0 ? (
            <p className="text-[13px] text-ink-3">Todavía nadie valoró. Después de cada acción la app pregunta «¿cómo te fue?» en una escala del 1 al 5.</p>
          ) : (
            <div className="space-y-4">
              <p className="flex items-baseline gap-2">
                <span className="text-[28px] font-extrabold tabular-nums text-ink">{k.acogida?.toLocaleString("es-PE")}</span>
                <span className="text-[13px] text-ink-2">de 5 · {ESCALA[Math.round(k.acogida ?? 0)]}</span>
              </p>
              <ul className="space-y-1.5">
                {[5, 4, 3, 2, 1].map((n) => {
                  const c = k.acogida_dist[String(n)] ?? 0;
                  return (
                    <li key={n} className="flex items-center gap-3 text-[13px]">
                      <span className="w-24 shrink-0 text-ink-2">
                        <b className="font-semibold tabular-nums text-ink">{n}</b> · {ESCALA[n]}
                      </span>
                      <span className="h-2 flex-1 overflow-hidden rounded-md bg-surface-3">
                        <span
                          className="block h-full rounded-bar bg-primary transition-[width] duration-500"
                          style={{ width: `${(c / totalAcogida) * 100}%` }}
                        />
                      </span>
                      <span className="w-8 text-right tabular-nums text-ink-2">{c}</span>
                    </li>
                  );
                })}
              </ul>
              <ul className="flex flex-wrap gap-1.5">
                {k.acogida_por_accion.map((a) => (
                  <li key={a.accion} className="rounded-full bg-surface-2 px-2.5 py-1 text-[12px] text-ink-2">
                    {TEXTO_ACCION[a.accion as Accion] ?? a.accion}: <b className="text-ink">{a.promedio}</b> ({a.n})
                  </li>
                ))}
              </ul>
              {k.comentarios.length > 0 && (
                <ul className="space-y-1.5 border-t border-line pt-3">
                  {k.comentarios.map((c, i) => (
                    <li key={i} className="text-[12.5px] text-ink-2">
                      <b className="mr-1.5 font-semibold tabular-nums text-ink">{c.puntaje}/5</b>«{c.comentario}»
                      <span className="text-ink-3"> · {TEXTO_ACCION[c.accion as Accion] ?? c.accion}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Tarjeta>

        <Tarjeta titulo="Auditoría externa" nota="Un revisor de afuera: no solo los números de la plataforma">
          {!k ? (
            <span className="hueco h-24 w-full" />
          ) : !k.auditoria ? (
            <p className="text-[13px] text-ink-3">
              Todavía no hay informes. La auditoría la hace un agente externo que revisa la base y Drive por su cuenta y deja aquí su informe.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="flex flex-wrap items-center gap-2">
                <Etiqueta tono={k.auditoria.nivel === "ok" ? "ok" : k.auditoria.nivel === "observaciones" ? "aviso" : "peligro"}>
                  {k.auditoria.nivel === "ok" ? "Sin hallazgos" : k.auditoria.nivel === "observaciones" ? `${k.auditoria.hallazgos} observaciones` : "Hallazgos críticos"}
                </Etiqueta>
                <span className="text-[12px] text-ink-3">
                  {new Date(k.auditoria.en).toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" })} · {k.auditoria.auditor}
                </span>
              </p>
              <p className="text-[13px] text-ink-2">{k.auditoria.resumen}</p>
            </div>
          )}
        </Tarjeta>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Tarjeta titulo="Por empresa y área" nota={k ? `${k.emitidos} memos · ${dinero(k.monto_pen, "PEN")} pedidos en soles` : undefined}>
          {!k ? (
            <span className="hueco h-24 w-full" />
          ) : k.por_area.length === 0 ? (
            <p className="text-[13px] text-ink-3">Sin memos en el período.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-control text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-3">
                    <th className="py-2 pr-3 font-semibold">Área</th>
                    <th className="py-2 pr-3 font-semibold">Empresa</th>
                    <th className="py-2 pr-3 text-right font-semibold">Memos</th>
                    <th className="py-2 pr-3 text-right font-semibold">Por aprobar</th>
                    <th className="py-2 pr-3 text-right font-semibold">Observados</th>
                    <th className="py-2 text-right font-semibold">Monto (S/)</th>
                  </tr>
                </thead>
                <tbody>
                  {k.por_area.map((a) => (
                    <tr key={`${a.empresa}-${a.area}`} className="border-b border-line last:border-0">
                      <td className="py-2 pr-3 font-semibold text-ink">{a.area}</td>
                      <td className="py-2 pr-3 text-ink-2">{a.empresa}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{a.emitidos}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{a.pendientes}</td>
                      <td className={`py-2 pr-3 text-right tabular-nums ${a.observados > 0 ? "font-semibold text-danger-strong" : ""}`}>{a.observados}</td>
                      <td className="py-2 text-right tabular-nums">{dinero(a.monto, "PEN")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Tarjeta>

        <Tarjeta titulo="Memos por semana" nota="Emitidos, últimas semanas del período">
          {!k ? (
            <span className="hueco h-24 w-full" />
          ) : k.por_semana.length === 0 ? (
            <p className="text-[13px] text-ink-3">Sin memos en el período.</p>
          ) : (
            <Semanas datos={k.por_semana.slice(-8)} />
          )}
        </Tarjeta>
      </div>
    </div>
  );
}

/** Barras de memos emitidos por semana (la última, más fuerte). */
function Semanas({ datos }: { datos: { semana: string; emitidos: number }[] }) {
  const max = Math.max(1, ...datos.map((d) => d.emitidos));
  return (
    <div className="flex h-40 items-end gap-2" role="img" aria-label={datos.map((d) => `${d.semana}: ${d.emitidos}`).join(", ")}>
      {datos.map((d, i) => (
        <div key={d.semana} className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <span className="text-[11px] font-semibold tabular-nums text-ink-2">{d.emitidos}</span>
          <span
            className={`block w-full rounded-t-[4px] transition-[height] duration-500 ${i === datos.length - 1 ? "bg-primary-strong" : "bg-primary/70"}`}
            style={{ height: `${Math.max(4, (d.emitidos / max) * 100)}px` }}
          />
          <span className="text-[10.5px] tabular-nums text-ink-3">{d.semana.slice(8, 10)}/{d.semana.slice(5, 7)}</span>
        </div>
      ))}
    </div>
  );
}

function Seccion({ titulo, nota, children }: { titulo: string; nota: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2.5">
        <h2 className="text-[15px] font-bold text-ink">{titulo}</h2>
        <span className="text-[12px] text-ink-3">{nota}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>
    </section>
  );
}
