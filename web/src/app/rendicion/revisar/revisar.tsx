"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useCatalogos } from "@/lib/catalogos";
import { estadoFila, numeroCompleto, partirNumero, tipoCorto, type EstadoFila } from "@/lib/comprobante";
import { aNumero } from "@/lib/cuentas";
import { decidirRendicion, type CambiosComprobante } from "@/lib/datos";
import { publicarEnDrive } from "@/lib/drive";
import { tituloRendicion } from "@/lib/rendiciones";
import type { Persona } from "@/lib/sesion";
import type { Archivo, Catalogos, Comprobante } from "@/lib/tipos";
import { IconoCheck, IconoGirar } from "../../iconos";
import { ConSesion } from "../../marco";
import { Aviso, Estado, botonPrincipal, botonSecundario, campo } from "../../piezas";
import { Lista, Texto, useEnlaces } from "../celdas";
import { useRendicion } from "../vista";

export function VistaRevisar() {
  const params = useSearchParams();
  const id = params.get("id");
  const inicial = params.get("c");
  return (
    <ConSesion activo={id ?? undefined} contraida>
      {(persona) =>
        id ? <Revisar id={id} inicial={inicial} persona={persona} /> : <Aviso>Falta indicar qué rendición revisar.</Aviso>
      }
    </ConSesion>
  );
}

const TONOS: Record<EstadoFila["clave"], string> = {
  listo: "text-success-strong",
  leyendo: "text-primary-strong",
  falta: "text-warning-strong",
  repetido: "text-warning-strong",
  fallido: "text-danger-strong",
  observado: "text-danger-strong",
  descartado: "text-ink-3",
};

function Revisar({ id, inicial, persona }: { id: string; inicial: string | null; persona: Persona }) {
  const { catalogos } = useCatalogos();
  const h = useRendicion(id, persona);
  const [elegido, setElegido] = useState<string | null>(inicial);
  const [observando, setObservando] = useState(false);

  const filas = h.datos?.comprobantes ?? [];
  const archivoDe = (c: Comprobante) => h.datos?.archivos.find((a) => a.id === c.archivo_id);
  const conEstado = filas.map((c) => ({ c, e: estadoFila(c, archivoDe(c), h.repetidos.has(c.id)) }));
  const indice = Math.max(
    0,
    conEstado.findIndex(({ c }) => c.id === elegido) >= 0
      ? conEstado.findIndex(({ c }) => c.id === elegido)
      : conEstado.findIndex(({ e }) => e.porRevisar),
  );
  const actual = conEstado[indice];

  const ir = (i: number) => {
    const destino = conEstado[Math.min(Math.max(i, 0), conEstado.length - 1)];
    if (!destino) return;
    setElegido(destino.c.id);
    // La dirección sigue a la fila: recargar o compartir el enlace abre la misma.
    window.history.replaceState(null, "", `?id=${id}&c=${destino.c.id}`);
  };
  const siguientePorRevisar = () => {
    const despues = conEstado.findIndex(({ e }, i) => i > indice && e.porRevisar);
    ir(despues >= 0 ? despues : indice + 1);
  };

  // ↑ y ↓ recorren los comprobantes, salvo mientras se escribe en un campo.
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (["INPUT", "SELECT", "TEXTAREA"].includes(t.tagName)) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        ir(indice + 1);
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        ir(indice - 1);
      }
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  });

  if (h.error && !h.datos) return <Aviso>{h.error}</Aviso>;
  if (!h.datos || !catalogos) {
    return (
      <p className="text-ink-3" role="status">
        Cargando…
      </p>
    );
  }

  const r = h.datos.rendicion;
  const esAdmin = persona.es_administracion;
  const puede = h.editable || (esAdmin && ["abierta", "enviada", "observada"].includes(r.estado));
  const porRevisar = conEstado.filter(({ e }) => e.porRevisar).length;
  const conObservacion = filas.filter((c) => c.observacion && !c.descartado).length;

  const aprobar = () => {
    const texto = conObservacion
      ? `Hay ${conObservacion} comprobante${conObservacion === 1 ? "" : "s"} con observación. ¿Aprobar igual?`
      : "¿Aprobar la rendición? Queda cerrada para cambios.";
    if (!window.confirm(texto)) return;
    h.ejecutar(async () => {
      h.conRendicion(await decidirRendicion(r.id, "aprobada", ""));
      // Aprobada: Drive verifica cada imagen copiada y la borra de InroScan.
      publicarEnDrive(r.id);
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-card border border-control bg-surface px-4 py-3">
        <Link href={`/rendicion/?id=${r.id}`} className="text-sm font-semibold text-primary-strong hover:underline">
          ← Volver a la hoja
        </Link>
        <h1 className="text-lg font-bold text-ink">{tituloRendicion({ ...r, caja: h.datos.caja })}</h1>
        <Estado estado={r.estado} />
        <span className="text-sm text-ink-2 lg:ml-auto">
          {filas.length ? `${indice + 1} de ${filas.length}` : "Sin comprobantes"}
          {porRevisar > 0 && (
            <>
              {" "}
              · <b className="text-warning-strong">{porRevisar} por revisar</b>
            </>
          )}
        </span>
        <span className="flex gap-1.5">
          <button type="button" aria-label="Anterior" title="Anterior (↑)" onClick={() => ir(indice - 1)} disabled={indice <= 0} className={`${botonSecundario} px-3`}>
            ↑
          </button>
          <button type="button" aria-label="Siguiente" title="Siguiente (↓)" onClick={() => ir(indice + 1)} disabled={indice >= filas.length - 1} className={`${botonSecundario} px-3`}>
            ↓
          </button>
        </span>
        {esAdmin && r.estado === "enviada" && (
          <span className="flex gap-2">
            <button type="button" onClick={() => setObservando((v) => !v)} className={`${botonSecundario} text-sm`}>
              Observar rendición
            </button>
            <button type="button" onClick={aprobar} className={`${botonPrincipal} text-sm`}>
              Aprobar
            </button>
          </span>
        )}
      </header>

      {h.error && <Aviso>{h.error}</Aviso>}
      {r.estado === "observada" && r.observacion && (
        <Aviso tono="aviso">
          <b>Observación de administración:</b> {r.observacion}
        </Aviso>
      )}
      {esAdmin && observando && r.estado === "enviada" && (
        <Observar
          conObservacion={conObservacion}
          onDevolver={(texto) =>
            h.ejecutar(async () => {
              h.conRendicion(await decidirRendicion(r.id, "observada", texto));
              setObservando(false);
            })
          }
        />
      )}

      {!actual ? (
        <p className="rounded-card border border-control bg-surface p-6 text-ink-2">Esta rendición no tiene comprobantes.</p>
      ) : (
        <div className="grid gap-3 lg:h-[calc(100dvh-10rem)] lg:min-h-[560px] lg:grid-cols-[17rem_minmax(0,1fr)_25rem]">
          <nav aria-label="Comprobantes" className="hidden flex-col gap-1 overflow-y-auto rounded-card border border-control bg-surface p-2 lg:flex">
            {conEstado.map(({ c, e }, i) => (
              <button
                key={c.id}
                type="button"
                onClick={() => ir(i)}
                aria-current={i === indice ? "true" : undefined}
                className={`flex justify-between gap-2 rounded-control p-2.5 text-left ${
                  i === indice ? "bg-primary-soft outline-2 outline-primary" : "hover:bg-surface-2"
                } ${e.clave === "descartado" ? "opacity-55" : ""}`}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-semibold">{c.proveedor || (e.clave === "leyendo" ? "Leyendo…" : "Sin proveedor")}</span>
                  <span className="text-xs text-ink-3">
                    {tipoCorto(c.tipo_comprobante_id)}
                    {c.fecha ? ` · ${c.fecha.slice(8, 10)}/${c.fecha.slice(5, 7)}` : ""}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end">
                  <span className="text-sm font-semibold tabular-nums">{c.total == null ? "—" : aNumero(c.total).toFixed(2)}</span>
                  <span className={`text-[11px] font-bold ${TONOS[e.clave]}`}>{e.clave === "listo" ? "Listo" : e.texto}</span>
                </span>
              </button>
            ))}
          </nav>

          <Visor archivo={archivoDe(actual.c)} archivos={h.datos.archivos} pagina={actual.c.pagina} />

          <Formulario
            key={actual.c.id}
            c={actual.c}
            e={actual.e}
            repetido={h.repetidos.has(actual.c.id)}
            catalogos={catalogos}
            puede={puede}
            esAdmin={esAdmin}
            intento={h.intento}
            onGuardar={h.acciones.guardarFila}
            onConfirmar={siguientePorRevisar}
            esUltimo={indice >= filas.length - 1}
          />
        </div>
      )}
    </div>
  );
}

function Observar({ conObservacion, onDevolver }: { conObservacion: number; onDevolver: (texto: string) => void }) {
  const [texto, setTexto] = useState("");
  return (
    <section className="rounded-card border border-warning/40 bg-warning-soft/50 p-4">
      <label className="block text-sm font-semibold text-ink">
        Observación general para quien rinde
        <textarea
          className={`mt-1.5 min-h-20 ${campo}`}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Por ejemplo: falta la boleta del almuerzo del 21; el hospedaje va al proyecto PAQ 08."
        />
      </label>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!texto.trim() && conObservacion === 0}
          onClick={() => onDevolver(texto.trim())}
          className={`${botonPrincipal} text-sm`}
        >
          Devolver con observaciones
        </button>
        <span className="text-[13px] text-ink-2">
          {conObservacion
            ? `Además van ${conObservacion} observación${conObservacion === 1 ? "" : "es"} en comprobantes.`
            : "También puedes observar cada comprobante en su ficha."}
        </span>
      </div>
    </section>
  );
}

function Visor({ archivo, archivos, pagina }: { archivo: Archivo | undefined; archivos: Archivo[]; pagina: number }) {
  const enlaces = useEnlaces(archivos);
  const [zoom, setZoom] = useState(1);
  const [giro, setGiro] = useState(0);
  const enlace = archivo ? enlaces[archivo.id] : undefined;
  const pdf = archivo?.tipo_mime === "application/pdf";
  const boton = "flex h-9 w-9 items-center justify-center rounded-lg border border-white/30 text-on-fill hover:bg-white/10 disabled:bg-disabled disabled:text-disabled-ink";

  return (
    <section aria-label="Imagen del comprobante" className="flex min-h-[55dvh] flex-col overflow-hidden rounded-card bg-[#3a4654] lg:min-h-0">
      <div className="flex items-center gap-2 px-3 py-2 text-[13px] text-on-fill">
        <span>{!archivo ? "Cargado a mano, sin imagen" : pdf ? `PDF · página ${pagina}` : "Foto"}</span>
        {archivo && !pdf && (
          <span className="ml-auto flex gap-1.5">
            <button type="button" aria-label="Alejar" className={boton} onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} disabled={zoom <= 0.5}>
              −
            </button>
            <button type="button" aria-label="Acercar" className={boton} onClick={() => setZoom((z) => Math.min(4, z + 0.25))} disabled={zoom >= 4}>
              +
            </button>
            <button type="button" aria-label="Girar" className={boton} onClick={() => setGiro((g) => (g + 90) % 360)}>
              <IconoGirar className="h-4 w-4" />
            </button>
          </span>
        )}
        {enlace && (
          <a href={pdf ? `${enlace}#page=${pagina}` : enlace} target="_blank" rel="noreferrer" className={`text-on-fill underline ${pdf ? "ml-auto" : ""}`}>
            Abrir aparte
          </a>
        )}
      </div>
      <div className="flex flex-1 items-start justify-center overflow-auto p-3">
        {!archivo ? (
          <p className="m-auto text-sm text-on-fill/80">Este comprobante se escribió a mano.</p>
        ) : !enlace ? (
          <span className="m-auto h-2/3 w-1/2 animate-pulse rounded-lg bg-white/10" />
        ) : pdf ? (
          <iframe title="PDF del comprobante" src={`${enlace}#page=${pagina}`} className="h-full min-h-[50dvh] w-full rounded-lg bg-white" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- enlace firmado y temporal: no pasa por el optimizador
          <img
            src={enlace}
            alt="Comprobante"
            style={{ width: `${zoom * 100}%`, transform: `rotate(${giro}deg)` }}
            className="max-w-none origin-center rounded-md object-contain shadow-2xl transition-transform"
          />
        )}
      </div>
    </section>
  );
}

function Formulario({
  c,
  e,
  repetido,
  catalogos,
  puede,
  esAdmin,
  intento,
  onGuardar,
  onConfirmar,
  esUltimo,
}: {
  c: Comprobante;
  e: EstadoFila;
  repetido: boolean;
  catalogos: Catalogos;
  puede: boolean;
  esAdmin: boolean;
  intento: number;
  onGuardar: (id: string, cambios: CambiosComprobante) => void;
  onConfirmar: () => void;
  esUltimo: boolean;
}) {
  const leidos = new Set(c.confianza?.campos ?? []);
  const editable = puede && !c.descartado;
  const k = (campo: string, valor: unknown) => `${campo}-${String(valor)}-${intento}`;
  const num = (v: string) => (v ? Number(v) : null);
  const rotulo = "flex flex-col gap-1 text-xs font-bold uppercase tracking-wide text-ink-3";
  const falta = (vacio: boolean) => (vacio && editable ? "border-warning bg-warning-soft/60" : "");

  return (
    <section aria-label="Datos del comprobante" className="flex flex-col gap-3 overflow-y-auto rounded-card border border-control bg-surface p-4">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-bold">
          {tipoCorto(c.tipo_comprobante_id)} {numeroCompleto(c)}
        </h2>
        <span className={`ml-auto text-xs font-bold ${TONOS[e.clave]}`}>{e.texto}</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className={rotulo}>
          <span>
            Fecha
            <MarcaIA leidos={leidos} campo="fecha" />
          </span>
          <input
            key={k("fecha", c.fecha)}
            type="date"
            className={`${campo} ${falta(!c.fecha)}`}
            defaultValue={c.fecha ?? ""}
            disabled={!editable}
            onBlur={(ev) => ev.target.value !== (c.fecha ?? "") && onGuardar(c.id, { fecha: ev.target.value || null })}
          />
        </label>
        <label className={rotulo}>
          <span>
            Tipo
            <MarcaIA leidos={leidos} campo="tipo_comprobante_id" />
          </span>
          <Lista
            valor={c.tipo_comprobante_id}
            etiqueta="Tipo de comprobante"
            opciones={catalogos.tipos}
            disabled={!editable}
            className={`${campo} ${falta(!c.tipo_comprobante_id)}`}
            onGuardar={(v) => onGuardar(c.id, { tipo_comprobante_id: v || null })}
          />
        </label>
        <label className={rotulo}>
          <span>
            N° comprobante
            <MarcaIA leidos={leidos} campo="numero" />
          </span>
          <Texto key={k("numero", numeroCompleto(c))} valor={numeroCompleto(c)} etiqueta="N° de comprobante" disabled={!editable} className={campo} onGuardar={(v) => onGuardar(c.id, partirNumero(v))} />
        </label>
        <label className={rotulo}>
          <span>
            RUC
            <MarcaIA leidos={leidos} campo="ruc" />
          </span>
          <Texto key={k("ruc", c.ruc)} valor={c.ruc} etiqueta="RUC" inputMode="numeric" disabled={!editable} className={campo} onGuardar={(v) => onGuardar(c.id, { ruc: v })} />
        </label>
        <label className={`${rotulo} col-span-2`}>
          <span>
            Proveedor
            <MarcaIA leidos={leidos} campo="proveedor" />
          </span>
          <Texto key={k("proveedor", c.proveedor)} valor={c.proveedor} etiqueta="Proveedor" disabled={!editable} className={campo} onGuardar={(v) => onGuardar(c.id, { proveedor: v })} />
        </label>
        <label className={`${rotulo} col-span-2`}>
          Proyecto
          <Lista
            valor={c.proyecto_id}
            etiqueta="Proyecto"
            opciones={catalogos.proyectos}
            disabled={!editable}
            vacio="Elegir proyecto…"
            className={`${campo} ${falta(c.proyecto_id == null)}`}
            onGuardar={(v) => onGuardar(c.id, { proyecto_id: num(v) })}
          />
        </label>
        <label className={rotulo}>
          Área
          <Lista valor={c.area_id} etiqueta="Área del solicitante" opciones={catalogos.areas} disabled={!editable} className={campo} onGuardar={(v) => onGuardar(c.id, { area_id: num(v) })} />
        </label>
        <label className={rotulo}>
          <span>
            Solicitante
            <MarcaIA leidos={leidos} campo="solicitante" />
          </span>
          <Texto key={k("solicitante", c.solicitante)} valor={c.solicitante} etiqueta="Solicitante" disabled={!editable} className={campo} onGuardar={(v) => onGuardar(c.id, { solicitante: v })} />
        </label>
        <label className={`${rotulo} col-span-2`}>
          <span>
            Concepto
            <MarcaIA leidos={leidos} campo="concepto_id" />
          </span>
          <Lista
            valor={c.concepto_id}
            etiqueta="Concepto"
            opciones={catalogos.conceptos}
            disabled={!editable}
            className={`${campo} ${falta(c.concepto_id == null)}`}
            onGuardar={(v) => onGuardar(c.id, { concepto_id: num(v) })}
          />
        </label>
        <label className={`${rotulo} col-span-2`}>
          <span>
            Descripción · motivo
            <MarcaIA leidos={leidos} campo="descripcion" />
          </span>
          <Texto key={k("descripcion", c.descripcion)} valor={c.descripcion} etiqueta="Descripción" disabled={!editable} className={campo} onGuardar={(v) => onGuardar(c.id, { descripcion: v })} />
        </label>
        <label className={rotulo}>
          <span>
            Total inc. IGV
            <MarcaIA leidos={leidos} campo="total" />
          </span>
          <Texto
            key={k("total", c.total)}
            valor={c.total == null ? "" : aNumero(c.total).toFixed(2)}
            etiqueta="Total"
            inputMode="decimal"
            disabled={!editable}
            className={`${campo} font-semibold ${falta(c.total == null)}`}
            onGuardar={(v) => onGuardar(c.id, { total: v === "" ? null : aNumero(v) })}
          />
        </label>
        <label className={rotulo}>
          Moneda
          <select className={campo} value={c.moneda} disabled={!editable} onChange={(ev) => onGuardar(c.id, { moneda: ev.target.value as "PEN" | "USD" })}>
            <option value="PEN">Soles</option>
            <option value="USD">Dólares</option>
          </select>
        </label>
      </div>

      {c.ruc && c.numero && (
        <p className={`flex gap-2 rounded-control px-3 py-2 text-[13px] ${repetido ? "bg-warning-soft text-warning-strong" : "bg-success-soft text-success-strong"}`}>
          {!repetido && <IconoCheck className="mt-0.5 h-4 w-4 shrink-0" />}
          {repetido ? "Este comprobante (RUC y número) ya está en otra rendición." : "No está registrado en otra rendición."}
        </p>
      )}

      {esAdmin && puede ? (
        <label className="block text-sm font-semibold text-ink">
          Observación para quien rinde
          <textarea
            key={k("observacion", c.observacion)}
            className={`mt-1.5 min-h-16 ${campo} ${c.observacion ? "border-danger" : ""}`}
            defaultValue={c.observacion}
            placeholder="Solo si algo de este comprobante está mal."
            onBlur={(ev) => ev.target.value.trim() !== c.observacion && onGuardar(c.id, { observacion: ev.target.value.trim() })}
          />
        </label>
      ) : (
        c.observacion && (
          <p className="rounded-control bg-danger-soft px-3 py-2 text-[13px] text-danger-strong">
            <b>Observación de administración:</b> {c.observacion}
          </p>
        )
      )}

      {c.total != null && c.moneda === "USD" && (
        <p className="text-[13px] text-ink-2">Importe en dólares: US$ {aNumero(c.total).toFixed(2)}. Administración lo convierte al tipo de cambio del día.</p>
      )}

      <div className="mt-auto flex flex-wrap gap-2 pt-2">
        <button type="button" onClick={onConfirmar} disabled={esUltimo && !e.porRevisar} className={`flex-1 ${botonPrincipal}`}>
          {puede ? "Confirmar y siguiente" : "Siguiente"}
        </button>
        {puede && (
          <button type="button" className={botonSecundario} onClick={() => onGuardar(c.id, { descartado: !c.descartado })}>
            {c.descartado ? "Recuperar" : "Descartar"}
          </button>
        )}
      </div>
    </section>
  );
}

/** «IA» junto a un campo que llenó la lectura automática: a revisar contra la imagen. */
function MarcaIA({ leidos, campo }: { leidos: Set<string>; campo: string }) {
  if (!leidos.has(campo)) return null;
  return (
    <span title="Lo llenó la lectura automática" className="ml-1.5 rounded bg-primary-soft px-1.5 py-px text-[10px] font-bold text-primary-strong">
      IA
    </span>
  );
}
