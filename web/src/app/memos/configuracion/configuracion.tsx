"use client";

import { useCallback, useEffect, useState } from "react";
import { recargarContexto, useContextoMemos, type Unidad } from "@/lib/memos";
import {
  agregarUsuario,
  guardarSemilla,
  guardarUnidad,
  guardarUsuario,
  leerConfiguracion,
  leerInroconta,
  ponerEnUnidad,
  sacarDeUnidad,
  traerDeInroconta,
  type Correlativo,
  type EstadoInroconta,
  type UsuarioMemo,
} from "@/lib/memos-admin";
import type { Persona } from "@/lib/sesion";
import { Interruptor, PaginaAdmin } from "../../administracion";
import { Aviso, botonPrincipal, campoSuelto } from "../../piezas";
import { Tarjeta } from "../piezas-memo";

export function ConfiguracionMemos() {
  return (
    <PaginaAdmin
      activo="memos-config"
      titulo="Áreas y permisos de memos"
      descripcion="Quién aprueba en cada área, quién emite, quién ve KPIs o memos de otras áreas, y desde qué número sigue cada serie."
    >
      {(persona) => <Contenido persona={persona} />}
    </PaginaAdmin>
  );
}

const anioLima = () => Number(new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }).slice(0, 4));

function Contenido({ persona }: { persona: Persona }) {
  const { contexto, error } = useContextoMemos(persona.correo);
  const [config, setConfig] = useState<{ usuarios: UsuarioMemo[]; correlativos: Correlativo[] } | null>(null);
  const [falla, setFalla] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);

  const recargar = useCallback(() => {
    leerConfiguracion().then(setConfig, (e: Error) => setFalla(e.message));
  }, []);
  useEffect(recargar, [recargar]);

  const hacer = async (f: () => Promise<unknown>, ok: string) => {
    setFalla(null);
    setHecho(null);
    try {
      await f();
      setHecho(ok);
      recargar();
      recargarContexto(persona.correo);
    } catch (e) {
      setFalla((e as Error).message);
    }
  };

  if (error) return <Aviso>{error}</Aviso>;
  if (!contexto || !config) return <p className="text-ink-3">Abriendo…</p>;

  const unidades = contexto.catalogos.unidades;
  const anio = anioLima();

  return (
    <div className="space-y-4">
      {falla && <Aviso>{falla}</Aviso>}
      {hecho && <Aviso tono="info">{hecho}</Aviso>}

      <Tarjeta titulo="Áreas emisoras" nota={`Cada una con su serie: empresa + área + año. Semilla = último número ya emitido en ${anio}.`}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13.5px]">
            <thead>
              <tr className="border-b border-control text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-3">
                <th className="py-2.5 pr-3 font-semibold">Área</th>
                <th className="py-2.5 pr-3 font-semibold">Aprobación</th>
                <th className="py-2.5 pr-3 font-semibold">Jefe que aprueba</th>
                <th className="py-2.5 pr-3 font-semibold">Suplente</th>
                <th className="py-2.5 font-semibold">Último N° {anio}</th>
              </tr>
            </thead>
            <tbody>
              {unidades.map((u) => (
                <FilaUnidad
                  key={u.id}
                  u={u}
                  ultimo={config.correlativos.find((c) => c.unidad_id === u.id && c.anio === anio)?.ultimo ?? 0}
                  onUnidad={(c) => hacer(() => guardarUnidad(u.id, c), `${u.nombre}: guardado.`)}
                  onSemilla={(n) => hacer(() => guardarSemilla(u.id, anio, n), `${u.nombre}: el siguiente memo será el ${String(n + 1).padStart(3, "0")}.`)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>

      <Personas usuarios={config.usuarios} unidades={unidades} hacer={hacer} />
      <DatosInroconta />
    </div>
  );
}

const NOMBRES = { padron: "Padrón de RUC", ssco: "Lista SSCO", sire: "Registro de compras (SIRE)" } as const;

/**
 * La copia local de INROCONTA: lo que los memos consultan para avisar de un
 * proveedor SSCO, no habido, o de una factura que SUNAT no registra.
 */
function DatosInroconta() {
  const [estado, setEstado] = useState<EstadoInroconta | null>(null);
  const [trayendo, setTrayendo] = useState(false);
  const [falla, setFalla] = useState<string | null>(null);

  const leer = useCallback(() => {
    leerInroconta().then(setEstado, (e: Error) => setFalla(e.message));
  }, []);
  useEffect(leer, [leer]);

  const traer = async () => {
    setTrayendo(true);
    setFalla(null);
    try {
      await traerDeInroconta();
    } catch (e) {
      setFalla((e as Error).message);
    } finally {
      setTrayendo(false);
      leer();
    }
  };

  const cifras = estado && { padron: estado.contribuyentes, ssco: estado.ssco, sire: estado.sire };
  return (
    <Tarjeta titulo="Datos de INROCONTA" nota="Padrón de RUC, lista SSCO y registro de compras de SUNAT, para revisar cada pago">
      <div className="grid gap-3.5 sm:grid-cols-3">
        {(["padron", "ssco", "sire"] as const).map((c) => {
          const u = estado?.ultimas[c];
          return (
            <div key={c} className="rounded-row bg-surface-2 px-4 py-3">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                {u?.resultado === "ERROR" && <span className="h-2 w-2 rounded-full bg-danger" aria-label="Hay algo que revisar" />}
                {NOMBRES[c]}
              </p>
              <p className="mt-1 text-xl font-extrabold tabular-nums text-ink">
                {cifras ? cifras[c].toLocaleString("en-US") : <span className="hueco h-6 w-16" />}
              </p>
              <p className="mt-0.5 text-xs text-ink-2">
                {!estado
                  ? " "
                  : !u
                    ? "Todavía no se trajo"
                    : u.resultado === "ERROR"
                      ? u.error
                      : `Traído ${new Date(u.terminada_en ?? u.iniciada_en).toLocaleString("es-PE", { timeZone: "America/Lima", dateStyle: "short", timeStyle: "short" })}`}
              </p>
            </div>
          );
        })}
      </div>
      {falla && <p className="mt-3 text-[13px] text-danger-strong" role="alert">{falla}</p>}
      <button type="button" onClick={traer} disabled={trayendo} className={`mt-3.5 text-[13px] ${botonPrincipal}`}>
        {trayendo ? "Trayendo…" : "Traer ahora"}
      </button>
    </Tarjeta>
  );
}

function FilaUnidad({
  u,
  ultimo,
  onUnidad,
  onSemilla,
}: {
  u: Unidad;
  ultimo: number;
  onUnidad: (c: { requiere_aprobacion?: boolean; jefe_correo?: string | null; suplente_correo?: string | null }) => void;
  onSemilla: (n: number) => void;
}) {
  const [jefe, setJefe] = useState(u.jefe_correo ?? "");
  const [suplente, setSuplente] = useState(u.suplente_correo ?? "");
  const [semilla, setSemilla] = useState(String(ultimo));
  const correo = (s: string) => s.trim().toLowerCase() || null;
  return (
    <tr className="border-b border-line align-middle last:border-0">
      <td className="py-2.5 pr-3">
        <b className="font-semibold text-ink">{u.nombre}</b>
        <span className="block text-[11.5px] text-ink-3">
          {u.empresa?.nombre} · serie {u.codigo}
        </span>
      </td>
      <td className="py-2.5 pr-3">
        <span className="flex items-center gap-2">
          <Interruptor activo={u.requiere_aprobacion} etiqueta={`${u.nombre} exige aprobación`} onCambiar={(v) => onUnidad({ requiere_aprobacion: v })} />
          <span className="text-[12.5px] text-ink-2">{u.requiere_aprobacion ? "La exige" : "No"}</span>
        </span>
      </td>
      <td className="py-2.5 pr-3">
        <input
          className={`w-52 text-[13px] ${campoSuelto}`}
          type="email"
          value={jefe}
          placeholder="jefe@inroprin.com"
          onChange={(e) => setJefe(e.target.value)}
          onBlur={() => correo(jefe) !== u.jefe_correo && onUnidad({ jefe_correo: correo(jefe) })}
        />
      </td>
      <td className="py-2.5 pr-3">
        <input
          className={`w-52 text-[13px] ${campoSuelto}`}
          type="email"
          value={suplente}
          placeholder="suplente@inroprin.com"
          onChange={(e) => setSuplente(e.target.value)}
          onBlur={() => correo(suplente) !== u.suplente_correo && onUnidad({ suplente_correo: correo(suplente) })}
        />
      </td>
      <td className="py-2.5">
        <input
          className={`w-20 text-right text-[13px] tabular-nums ${campoSuelto}`}
          inputMode="numeric"
          value={semilla}
          onChange={(e) => setSemilla(e.target.value.replace(/\D/g, ""))}
          onBlur={() => Number(semilla) !== ultimo && onSemilla(Number(semilla))}
        />
      </td>
    </tr>
  );
}

function Personas({
  usuarios,
  unidades,
  hacer,
}: {
  usuarios: UsuarioMemo[];
  unidades: Unidad[];
  hacer: (f: () => Promise<unknown>, ok: string) => void;
}) {
  const [nuevo, setNuevo] = useState("");
  const nombre = (id: number) => {
    const u = unidades.find((x) => x.id === id);
    return u ? `${u.empresa?.codigo ?? ""} · ${u.nombre}` : String(id);
  };
  return (
    <Tarjeta titulo="Personas" nota="Por correo: se puede configurar antes de que la persona entre por primera vez">
      <form
        className="mb-3.5 flex flex-wrap gap-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          const c = nuevo.trim().toLowerCase();
          if (!c) return;
          hacer(() => agregarUsuario(c), `${c}: agregado. Ahora elige sus áreas.`);
          setNuevo("");
        }}
      >
        <input className={`min-w-60 flex-1 ${campoSuelto}`} type="email" value={nuevo} onChange={(e) => setNuevo(e.target.value)} placeholder="nombre@inroprin.com" />
        <button type="submit" className={`text-[13px] ${botonPrincipal}`}>
          Agregar persona
        </button>
      </form>
      {usuarios.length === 0 ? (
        <p className="text-[13px] text-ink-3">Nadie todavía. Agrega a quienes emiten memos.</p>
      ) : (
        <ul className="divide-y divide-line">
          {usuarios.map((u) => (
            <li key={u.correo} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
              <span className="min-w-56 font-semibold text-ink">{u.correo}</span>
              <span className="flex flex-1 flex-wrap items-center gap-1.5">
                {u.unidades.map((id) => (
                  <span key={id} className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-1 text-[12px] font-semibold text-primary-strong">
                    {nombre(id)}
                    <button
                      type="button"
                      aria-label={`Sacar de ${nombre(id)}`}
                      className="ml-0.5 text-primary-strong hover:text-ink"
                      onClick={() => hacer(() => sacarDeUnidad(u.correo, id), `${u.correo}: ya no emite en ${nombre(id)}.`)}
                    >
                      ×
                    </button>
                  </span>
                ))}
                <select
                  aria-label={`Agregar área a ${u.correo}`}
                  className={`text-[12.5px] ${campoSuelto}`}
                  value=""
                  onChange={(e) => {
                    const id = Number(e.target.value);
                    if (id) hacer(() => ponerEnUnidad(u.correo, id), `${u.correo}: emite en ${nombre(id)}.`);
                  }}
                >
                  <option value="">+ Área donde emite</option>
                  {unidades
                    .filter((x) => !u.unidades.includes(x.id))
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.empresa?.codigo} · {x.nombre}
                      </option>
                    ))}
                </select>
              </span>
              <span className="flex items-center gap-2 text-[12.5px] text-ink-2">
                <Interruptor activo={u.ver_kpis} etiqueta={`${u.correo} ve KPIs`} onCambiar={(v) => hacer(() => guardarUsuario(u.correo, { ver_kpis: v }), "Guardado.")} />
                KPIs
              </span>
              <span className="flex items-center gap-2 text-[12.5px] text-ink-2">
                <Interruptor
                  activo={u.interarea_todas}
                  etiqueta={`${u.correo} ve memos de todas las áreas`}
                  onCambiar={(v) => hacer(() => guardarUsuario(u.correo, { interarea_todas: v }), "Guardado.")}
                />
                Interárea
              </span>
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  );
}
