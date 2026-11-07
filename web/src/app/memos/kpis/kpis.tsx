"use client";

import { useEffect, useState } from "react";
import { dinero, leerKpis, useContextoMemos, type Kpis } from "@/lib/memos";
import type { Persona } from "@/lib/sesion";
import { ConSesion } from "../../marco";
import { Aviso, campoSuelto } from "../../piezas";
import { Encabezado, Kpi, Tarjeta } from "../piezas-memo";

export function KpisMemos() {
  return <ConSesion activo="kpis">{(persona) => <Contenido persona={persona} />}</ConSesion>;
}

const hoy = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
const haceDias = (n: number) => new Date(Date.now() - n * 864e5).toLocaleDateString("en-CA", { timeZone: "America/Lima" });
const horas = (h: number | null) => (h == null ? "—" : h < 1 ? `${Math.round(h * 60)} min` : `${h.toLocaleString("es-PE")} h`);
const pct = (p: number | null) => (p == null ? "—" : `${p}%`);

/** Indicadores de los memos: tiempo, calidad y felicidad. Solo con el permiso «Ver KPIs». */
function Contenido({ persona }: { persona: Persona }) {
  const { contexto } = useContextoMemos(persona.correo);
  const [desde, setDesde] = useState(haceDias(90));
  const [hasta, setHasta] = useState(hoy());
  const [k, setK] = useState<Kpis | null>(null);
  const [falla, setFalla] = useState<string | null>(null);
  const permitido = persona.es_administracion || contexto?.permisos.verKpis;

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
        <Aviso tono="info">Los indicadores son solo para quien tiene el permiso «Ver KPIs». Pídeselo a administración.</Aviso>
      </div>
    );
  }
  const max = Math.max(1, ...(k?.por_area ?? []).map((a) => a.emitidos));
  const hueco = <span className="hueco h-6.5 w-20" />;

  return (
    <div className="space-y-4">
      <Encabezado titulo="Métricas y KPIs" descripcion="Tiempo, calidad de respuesta y felicidad, sobre los memos emitidos en el período.">
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

      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <Kpi etiqueta="Emitidos" valor={k ? k.emitidos : hueco} nota={k ? `${k.anulados} anulados · ${k.pendientes} por aprobar` : undefined} />
        <Kpi
          etiqueta="Aprobados a la primera"
          valor={k ? pct(k.a_la_primera_pct) : hueco}
          nota={k ? `${k.observados_alguna_vez} observados alguna vez` : undefined}
          riesgo={!!k && k.a_la_primera_pct != null && k.a_la_primera_pct < 80}
        />
        <Kpi
          etiqueta="Tiempo de aprobación"
          valor={k ? horas(k.horas_aprobacion_mediana) : hueco}
          nota={k ? `mediana · promedio ${horas(k.horas_aprobacion)}` : undefined}
        />
        <Kpi
          etiqueta={`Cargo en meta (${k?.meta_horas ?? 3} h)`}
          valor={k ? pct(k.cargo_en_meta_pct) : hueco}
          nota={k ? `promedio ${horas(k.horas_cargo)}` : undefined}
          riesgo={!!k && k.cargo_en_meta_pct != null && k.cargo_en_meta_pct < 80}
        />
        <Kpi etiqueta="Felicidad" valor={k ? (k.valoracion ?? "—") : hueco} nota="valoración promedio del cargo, de 1 a 5" />
        <Kpi etiqueta="Monto pedido" valor={k ? dinero(k.monto_pen, "PEN") : hueco} nota="en soles, sin anulados" />
        <Kpi etiqueta="Pagados" valor={k ? k.pagados : hueco} nota="según Tesorería o InroPay" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Tarjeta titulo="Por área" nota="Memos emitidos en el período">
          {!k ? (
            <span className="hueco h-24 w-full" />
          ) : k.por_area.length === 0 ? (
            <p className="text-[13px] text-ink-3">Sin memos en el período.</p>
          ) : (
            <ul className="space-y-3">
              {k.por_area.map((a) => (
                <li key={`${a.empresa}-${a.area}`}>
                  <div className="mb-1 flex items-baseline justify-between gap-2.5">
                    <span className="truncate text-[13.5px] font-semibold text-ink">
                      {a.empresa} · {a.area}
                    </span>
                    <span className="whitespace-nowrap text-[12.5px] text-ink-2">
                      {a.emitidos} · {a.observados} observados · {dinero(a.monto, "PEN")}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-bar bg-surface-3">
                    <span className="block h-full rounded-bar bg-primary" style={{ width: `${(a.emitidos / max) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
        <Tarjeta titulo="Felicidad del cargo" nota="Cuántas valoraciones de cada puntaje">
          {!k ? (
            <span className="hueco h-24 w-full" />
          ) : (
            <ul className="space-y-2">
              {[5, 4, 3, 2, 1].map((n) => {
                const c = k.valoraciones[String(n)] ?? 0;
                const total = Math.max(1, Object.values(k.valoraciones).reduce((s, x) => s + x, 0));
                return (
                  <li key={n} className="flex items-center gap-3 text-[13px]">
                    <span className="w-4 font-bold text-ink">{n}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-bar bg-surface-3">
                      <span className={`block h-full rounded-bar ${n >= 4 ? "bg-success" : n === 3 ? "bg-warning" : "bg-danger"}`} style={{ width: `${(c / total) * 100}%` }} />
                    </span>
                    <span className="w-8 text-right tabular-nums text-ink-2">{c}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Tarjeta>
      </div>
    </div>
  );
}
