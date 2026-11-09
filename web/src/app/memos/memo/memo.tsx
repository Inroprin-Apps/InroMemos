"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { bancoCanonico, BANCOS, comprobante, revisarCci, rucValido, soloDigitos, tipoDocumento } from "@/lib/memo-reglas";
import {
  ENTREGA_VIATICOS,
  FORMAS_PAGO,
  agregarLinea,
  anularMemo,
  aprobarMemo,
  darCargo,
  dinero,
  emitirMemo,
  espera,
  fichaRuc,
  guardarLinea,
  guardarMemo,
  leerDirectorio,
  leerMemo,
  observarMemo,
  publicarMemo,
  quitarLinea,
  redactar,
  revisarMemo,
  verificarCuenta,
  useContextoMemos,
  type CambiosLinea,
  type CambiosMemo,
  type Contexto,
  type Contribuyente,
  type Evento,
  type FormaPago,
  type Linea,
  type Memo,
  type Revision,
} from "@/lib/memos";
import type { Persona } from "@/lib/sesion";
import { IconoAprobar, IconoEnviar, IconoMas } from "../../iconos";
import { ConSesion } from "../../marco";
import { Aviso, botonPrincipal, botonSecundario, campo } from "../../piezas";
import { ChipEstado, ChipPago, Encabezado, Papel, Tarjeta } from "../piezas-memo";
import { Sustentos } from "./sustentos";
import { PanelTesoreria } from "./tesoreria";

export function VistaMemo() {
  const id = useSearchParams().get("id") ?? "";
  return <ConSesion activo="memos">{(persona) => <Cargar id={id} persona={persona} />}</ConSesion>;
}

type Datos = { memo: Memo; lineas: Linea[]; eventos: Evento[] };

function Cargar({ id, persona }: { id: string; persona: Persona }) {
  const { contexto, error: errorCtx } = useContextoMemos(persona.correo);
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(() => {
    leerMemo(id).then(setDatos, (e: Error) => setError(e.message));
  }, [id]);
  useEffect(recargar, [recargar]);

  if (error || errorCtx) return <Aviso>{error ?? errorCtx}</Aviso>;
  if (!datos || !contexto) return <p className="text-ink-3">Abriendo el memo…</p>;
  return <Memo_ datos={datos} contexto={contexto} persona={persona} onCambio={recargar} setDatos={setDatos} />;
}

const etiqueta = "mb-1 block text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3";

function Memo_({
  datos,
  contexto,
  persona,
  onCambio,
  setDatos,
}: {
  datos: Datos;
  contexto: Contexto;
  persona: Persona;
  onCambio: () => void;
  setDatos: (d: Datos) => void;
}) {
  const { memo, lineas, eventos } = datos;
  const { catalogos, permisos } = contexto;
  const unidad = catalogos.unidades.find((u) => u.id === memo.unidad_id);
  const tipo = catalogos.tipos.find((t) => t.codigo === memo.tipo_codigo);
  const editable = memo.emisor_id === persona.id && (memo.estado === "borrador" || memo.estado === "observado");
  const [falla, setFalla] = useState<string | null>(null);
  const [revision, setRevision] = useState<Revision[] | null>(null);

  const revisar = useCallback(() => {
    if (editable) revisarMemo(memo.id).then(setRevision, () => setRevision(null));
  }, [editable, memo.id]);
  useEffect(revisar, [revisar, lineas]);

  const cambiarMemo = async (cambios: CambiosMemo) => {
    setFalla(null);
    setDatos({ ...datos, memo: { ...memo, ...cambios } });
    try {
      const m = await guardarMemo(memo.id, cambios);
      setDatos({ ...datos, memo: m });
      revisar();
    } catch (e) {
      setFalla((e as Error).message);
    }
  };

  const cambiarLinea = async (l: Linea, cambios: CambiosLinea) => {
    setFalla(null);
    try {
      const nueva = await guardarLinea(l.id, cambios);
      setDatos({ ...datos, lineas: lineas.map((x) => (x.id === l.id ? nueva : x)) });
    } catch (e) {
      setFalla((e as Error).message);
    }
  };

  const titulo = memo.numero_visible ? `Memo ${memo.numero_visible}` : "Memo en borrador";

  return (
    <div className="space-y-4">
      <Encabezado titulo={titulo} descripcion={`${unidad?.empresa?.nombre ?? ""} · ${unidad?.nombre ?? ""} · ${tipo?.nombre ?? memo.tipo_codigo}`}>
        <ChipEstado estado={memo.estado} />
        <ChipPago estado={memo.estado_pago} />
        <Link href="/memos/" className={`text-[13px] ${botonSecundario}`}>
          Volver al panel
        </Link>
      </Encabezado>

      {memo.estado === "observado" && (
        <Aviso>
          <b className="font-semibold">Observado:</b> {memo.ultima_observacion}
          {editable && " Corrige y vuelve a enviar: conserva el mismo número."}
        </Aviso>
      )}
      {memo.estado === "anulado" && <Aviso tono="aviso">Anulado: {memo.motivo_anulacion}. Su número no se vuelve a usar.</Aviso>}
      {memo.rendicion_id && (
        <Aviso tono="info">
          Este memo pide el pago de una rendición.{" "}
          <Link href={`/rendicion/?id=${memo.rendicion_id}`} className="font-semibold underline">
            Ver la rendición
          </Link>
        </Aviso>
      )}
      {falla && <Aviso>{falla}</Aviso>}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]">
        <div className="min-w-0 space-y-4">
          {editable ? (
            <>
              <Redaccion memo={memo} persona={persona} onCambiar={cambiarMemo} />
              {memo.requiere_pago && (
                <LineasEditables
                  memo={memo}
                  lineas={lineas}
                  contexto={contexto}
                  onCambiar={cambiarLinea}
                  onLineas={(ls) => setDatos({ ...datos, lineas: ls })}
                  onFalla={setFalla}
                />
              )}
              <Sustentos memoId={memo.id} tipoCodigo={memo.tipo_codigo} contexto={contexto} editable onCambio={revisar} />
            </>
          ) : (
            <>
              <Acciones memo={memo} persona={persona} contexto={contexto} onHecho={onCambio} />
              {permisos.registraPagos && <PanelTesoreria memo={memo} onHecho={onCambio} />}
              <Legajo memo={memo} />
              <Resumen memo={memo} lineas={lineas} contexto={contexto} />
              <Sustentos memoId={memo.id} tipoCodigo={memo.tipo_codigo} contexto={contexto} editable={false} />
            </>
          )}
          <Bitacora eventos={eventos} />
        </div>

        <aside className="min-w-0 space-y-4 lg:sticky lg:top-4">
          {editable && <Enviar memo={memo} revision={revision} esAprobador={permisos.aprueba.includes(memo.unidad_id)} onHecho={onCambio} />}
          <Tarjeta titulo="Vista previa" nota={memo.confidencialidad !== "normal" ? "Sin personas: es reservado" : "Así sale el PDF"}>
            <Papel memo={memo} lineas={lineas} empresa={unidad?.empresa?.nombre ?? ""} unidad={unidad?.nombre ?? ""} />
          </Tarjeta>
        </aside>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Redacción
// ---------------------------------------------------------------------------

function plantilla(memo: Memo): string {
  if (memo.tipo_codigo === ENTREGA_VIATICOS) {
    return `Me dirijo a usted a fin de solicitar la asignación de viáticos para ${memo.asunto ? memo.asunto.charAt(0).toLowerCase() + memo.asunto.slice(1) : "…"}, según el detalle de personas, fechas y montos que se indica. Los gastos se rendirán con sus comprobantes al término del viaje.\n\nFavor de proceder con el depósito de los montos indicados.`;
  }
  const pago = memo.requiere_pago
    ? "\n\nSu despacho servirá para disponer el pago correspondiente."
    : "";
  return `Me dirijo a usted a fin de ${memo.requiere_pago ? "solicitar el pago de " : "comunicarle "}${memo.asunto ? memo.asunto.charAt(0).toLowerCase() + memo.asunto.slice(1) : "…"}, según el detalle y los documentos adjuntos.${pago}`;
}

function Redaccion({ memo, persona, onCambiar }: { memo: Memo; persona: Persona; onCambiar: (c: CambiosMemo) => void }) {
  const [asunto, setAsunto] = useState(memo.asunto);
  const [cuerpo, setCuerpo] = useState(memo.cuerpo);
  const [destinatario, setDestinatario] = useState(memo.destinatario_correo);
  const [copias, setCopias] = useState(memo.copias.join(", "));
  const [directorio, setDirectorio] = useState<{ correo: string; nombre: string }[]>([]);

  const [idea, setIdea] = useState("");
  const [redactando, setRedactando] = useState(false);
  const [avisoIA, setAvisoIA] = useState<string | null>(null);

  useEffect(() => {
    leerDirectorio().then(setDirectorio, () => setDirectorio([]));
  }, []);

  const conIA = async () => {
    setRedactando(true);
    setAvisoIA(null);
    try {
      const r = await redactar(memo.id, idea);
      setAsunto(r.asunto);
      setCuerpo(r.cuerpo);
      onCambiar({ asunto: r.asunto, cuerpo: r.cuerpo });
      setAvisoIA(r.aviso ?? (r.fuente === "IA" ? "Redactado con IA: revísalo y ajústalo a tu gusto." : null));
    } catch (e) {
      setAvisoIA((e as Error).message);
    } finally {
      setRedactando(false);
    }
  };

  return (
    <>
      <Tarjeta titulo="¿Qué quieres decir?" nota="Se guarda solo al salir de cada campo">
        <div className="mb-3.5 rounded-row bg-primary-soft p-3">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.06em] text-primary-strong">
            Escribe una frase y la IA redacta el asunto y el cuerpo
          </span>
          <div className="flex flex-wrap gap-2">
            <input
              className={`min-w-50 flex-1 ${campo}`}
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && idea.trim().length >= 3 && conIA()}
              placeholder="pago primas CESCE talleres Medrano"
            />
            <button type="button" onClick={conIA} disabled={redactando || idea.trim().length < 3} className={`text-[13px] ${botonPrincipal}`}>
              {redactando ? "Redactando…" : "Redactar"}
            </button>
          </div>
          {avisoIA && <p className="mt-1.5 text-[12.5px] text-primary-strong">{avisoIA}</p>}
        </div>
        <label className="block">
          <span className={etiqueta}>Asunto</span>
          <input
            className={campo}
            maxLength={200}
            value={asunto}
            onChange={(e) => setAsunto(e.target.value)}
            onBlur={() => asunto !== memo.asunto && onCambiar({ asunto })}
            placeholder="Pago de prima por renovación de carta fianza…"
          />
        </label>
        <label className="mt-3 block">
          <span className="mb-1 flex items-end justify-between gap-2">
            <span className={etiqueta}>Cuerpo</span>
            <button
              type="button"
              className="mb-1 text-[12.5px] font-semibold text-primary hover:text-primary-strong"
              onClick={() => {
                const t = plantilla({ ...memo, asunto });
                setCuerpo(t);
                onCambiar({ cuerpo: t });
              }}
            >
              Usar la plantilla base
            </button>
          </span>
          <textarea
            className={`${campo} min-h-40`}
            maxLength={4000}
            value={cuerpo}
            onChange={(e) => setCuerpo(e.target.value)}
            onBlur={() => cuerpo !== memo.cuerpo && onCambiar({ cuerpo })}
          />
        </label>
      </Tarjeta>

      <Tarjeta titulo="A quién va">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={etiqueta}>Destinatario principal (da el cargo)</span>
            <input
              className={campo}
              type="email"
              list="directorio"
              value={destinatario}
              onChange={(e) => setDestinatario(e.target.value)}
              onBlur={() => destinatario !== memo.destinatario_correo && onCambiar({ destinatario_correo: destinatario })}
              placeholder="nombre@inroprin.com"
            />
          </label>
          <label className="block">
            <span className={etiqueta}>Con copia (separados por coma)</span>
            <input
              className={campo}
              list="directorio"
              value={copias}
              onChange={(e) => setCopias(e.target.value)}
              onBlur={() => {
                const lista = copias.split(/[,;\s]+/).map((c) => c.trim().toLowerCase()).filter(Boolean);
                if (lista.join(",") !== memo.copias.join(",")) onCambiar({ copias: lista });
              }}
            />
          </label>
        </div>
        <datalist id="directorio">
          {directorio
            .filter((d) => d.correo !== persona.correo)
            .map((d) => (
              <option key={d.correo} value={d.correo}>
                {d.nombre}
              </option>
            ))}
        </datalist>
      </Tarjeta>
    </>
  );
}

// ---------------------------------------------------------------------------
// Líneas de pago
// ---------------------------------------------------------------------------

function LineasEditables({
  memo,
  lineas,
  contexto,
  onCambiar,
  onLineas,
  onFalla,
}: {
  memo: Memo;
  lineas: Linea[];
  contexto: Contexto;
  onCambiar: (l: Linea, c: CambiosLinea) => void;
  onLineas: (ls: Linea[]) => void;
  onFalla: (f: string | null) => void;
}) {
  const [agregando, setAgregando] = useState(false);
  const tipo = contexto.catalogos.tipos.find((t) => t.codigo === memo.tipo_codigo);
  const total = lineas.reduce((s, l) => s + (Number(l.monto) || 0), 0);

  const agregar = async () => {
    setAgregando(true);
    onFalla(null);
    try {
      const l = await agregarLinea(memo.id, (lineas.at(-1)?.orden ?? 0) + 1, memo.empresa_id, lineas[0]?.moneda ?? "PEN");
      onLineas([...lineas, l]);
    } catch (e) {
      onFalla((e as Error).message);
    } finally {
      setAgregando(false);
    }
  };

  const quitar = async (l: Linea) => {
    onFalla(null);
    try {
      await quitarLinea(l.id);
      onLineas(lineas.filter((x) => x.id !== l.id));
    } catch (e) {
      onFalla((e as Error).message);
    }
  };

  return (
    <Tarjeta
      titulo="Datos de pago"
      nota={
        tipo?.modo_lineas === "por_documento"
          ? "Una línea por comprobante"
          : tipo?.modo_lineas === "agrupado_cc"
            ? "Una línea por concepto y centro de costo"
            : `Una línea por persona · se agrupa desde ${tipo?.agrupa_desde ?? 15}`
      }
    >
      {memo.tipo_codigo === ENTREGA_VIATICOS && (
        <p className="mb-3 rounded-row bg-primary-soft px-3 py-2 text-[13px] text-primary-strong">
          Una línea por persona que viaja, con las fechas del viaje. Los comprobantes no van acá: después del viaje se escanean en{" "}
          <b>Mis rendiciones</b>. Si la persona no tiene cuenta en INROMEMOS, rinde quien emite este memo.
        </p>
      )}
      <div className="space-y-3">
        {lineas.map((l, i) => (
          <LineaEditable
            key={l.id}
            n={i + 1}
            linea={l}
            contexto={contexto}
            modo={tipo?.modo_lineas ?? "detalle"}
            entrega={memo.tipo_codigo === ENTREGA_VIATICOS}
            onCambiar={onCambiar}
            onQuitar={quitar}
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2.5">
        <button type="button" onClick={agregar} disabled={agregando} className={`inline-flex items-center gap-2 text-[13px] ${botonSecundario}`}>
          <IconoMas className="h-4 w-4" />
          Agregar línea
        </button>
        <span className="text-[13.5px] text-ink-2">
          Total <b className="text-ink tabular-nums">{dinero(total, lineas[0]?.moneda ?? "PEN")}</b>
        </span>
      </div>
    </Tarjeta>
  );
}

const ESTADO_CUENTA: Record<string, [string, "ok" | "warn" | "danger" | "muted"]> = {
  coincide: ["Cuenta verificada: coincide con la base", "ok"],
  pendiente: ["Cuenta nueva: queda pendiente de verificación", "warn"],
  distinta: ["Distinta a la registrada: la revisa el verificador", "warn"],
  rechazada: ["Cuenta rechazada por el verificador", "danger"],
  datos_incompletos: ["Faltan datos de la cuenta", "muted"],
};

function Chip({ tono, children }: { tono: "ok" | "warn" | "danger" | "muted"; children: React.ReactNode }) {
  const c = {
    ok: "bg-success-soft text-success-strong",
    warn: "bg-warning-soft text-warning-strong",
    danger: "bg-danger-soft text-danger-strong",
    muted: "bg-surface-3 text-ink-2",
  }[tono];
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${c}`}>{children}</span>;
}

function LineaEditable({
  n,
  linea,
  contexto,
  modo,
  entrega,
  onCambiar,
  onQuitar,
}: {
  n: number;
  linea: Linea;
  contexto: Contexto;
  modo: string;
  /** Entrega de viáticos: en vez del comprobante, las fechas del viaje. */
  entrega: boolean;
  onCambiar: (l: Linea, c: CambiosLinea) => void;
  onQuitar: (l: Linea) => void;
}) {
  const [l, setL] = useState(linea);
  const [cuenta, setCuenta] = useState("");
  const [cci, setCci] = useState("");
  const [comp, setComp] = useState(linea.numero ? `${linea.serie}-${linea.numero}` : "");
  const [ficha, setFicha] = useState<Contribuyente | null>(null);
  const [errorCuenta, setErrorCuenta] = useState<string | null>(null);
  const guardar = (c: CambiosLinea) => onCambiar(linea, c);

  // La cuenta completa va solo a la función: vuelve enmascarada y con su estado.
  const verificar = async (datos: { cuenta?: string; cci?: string; banco?: string }) => {
    setErrorCuenta(null);
    try {
      const r = await verificarCuenta(linea.id, datos);
      setL({ ...l, ...r });
      setCuenta("");
      setCci("");
    } catch (e) {
      setErrorCuenta((e as Error).message);
    }
  };

  // La ficha SUNAT del RUC (copia local de INROCONTA): completa la razón
  // social si falta y avisa lo que importa antes de pagar.
  useEffect(() => {
    let vigente = true;
    fichaRuc(linea.beneficiario_doc).then((f) => vigente && setFicha(f), () => vigente && setFicha(null));
    return () => {
      vigente = false;
    };
  }, [linea.beneficiario_doc]);
  const doc = tipoDocumento(l.beneficiario_doc);
  const revCci = cci ? revisarCci(cci, l.banco) : null;
  const { catalogos } = contexto;

  return (
    <fieldset className="rounded-row border border-line bg-surface-2 p-3.5">
      <legend className="sr-only">Línea {n}</legend>
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-bold text-ink">Línea {n}</span>
        {l.beneficiario_doc &&
          (doc === "RUC" ? (
            rucValido(l.beneficiario_doc) ? <Chip tono="ok">RUC válido</Chip> : <Chip tono="danger">RUC con dígito equivocado</Chip>
          ) : doc === "DNI" ? (
            <Chip tono="ok">DNI</Chip>
          ) : (
            <Chip tono="warn">Documento no reconocido</Chip>
          ))}
        {ficha?.ssco && <Chip tono="danger">En la lista SSCO de SUNAT: no se le paga</Chip>}
        {ficha && !ficha.ssco && (ficha.estado ?? "ACTIVO") !== "ACTIVO" && <Chip tono="danger">{ficha.estado}</Chip>}
        {ficha && (ficha.condicion ?? "HABIDO") !== "HABIDO" && <Chip tono="warn">{ficha.condicion}</Chip>}
        {ficha?.buen_contribuyente && <Chip tono="muted">Buen contribuyente</Chip>}
        {ficha?.agente_retencion && <Chip tono="muted">Agente de retención</Chip>}
        <button type="button" onClick={() => onQuitar(linea)} className="ml-auto text-[12.5px] font-semibold text-danger-strong hover:underline">
          Quitar
        </button>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2">
        {modo !== "agrupado_cc" && (
          <>
            <label className="block">
              <span className={etiqueta}>RUC o DNI</span>
              <input
                className={campo}
                inputMode="numeric"
                value={l.beneficiario_doc}
                onChange={(e) => setL({ ...l, beneficiario_doc: e.target.value.replace(/\s/g, "") })}
                onBlur={async () => {
                  if (l.beneficiario_doc === linea.beneficiario_doc) return;
                  const f = await fichaRuc(l.beneficiario_doc).catch(() => null);
                  const nombre = !l.beneficiario.trim() && f?.razon_social ? f.razon_social : null;
                  if (nombre) setL({ ...l, beneficiario: nombre });
                  guardar({ beneficiario_doc: l.beneficiario_doc, ...(nombre ? { beneficiario: nombre } : {}) });
                }}
              />
            </label>
            <label className="block">
              <span className={etiqueta}>Beneficiario{ficha?.razon_social ? " (SUNAT)" : ""}</span>
              <input
                className={campo}
                value={l.beneficiario}
                onChange={(e) => setL({ ...l, beneficiario: e.target.value })}
                onBlur={() => l.beneficiario !== linea.beneficiario && guardar({ beneficiario: l.beneficiario.trim() })}
              />
            </label>
          </>
        )}
        <label className="block">
          <span className={etiqueta}>Concepto</span>
          <select
            className={campo}
            value={l.concepto_id ?? ""}
            onChange={(e) => {
              const v = e.target.value ? Number(e.target.value) : null;
              setL({ ...l, concepto_id: v });
              guardar({ concepto_id: v });
            }}
          >
            <option value="">Elige</option>
            {catalogos.conceptos
              .filter((c) => c.activo)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
          </select>
        </label>
        <label className="block">
          <span className={etiqueta}>Proyecto o centro de costo</span>
          <select
            className={campo}
            value={l.proyecto_id ?? ""}
            onChange={(e) => {
              const v = e.target.value ? Number(e.target.value) : null;
              setL({ ...l, proyecto_id: v });
              guardar({ proyecto_id: v });
            }}
          >
            <option value="">Sin proyecto</option>
            {catalogos.proyectos
              .filter((p) => p.activo)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
          </select>
        </label>
        <label className="block">
          <span className={etiqueta}>Empresa que paga</span>
          <select
            className={campo}
            value={l.empresa_pagadora_id ?? ""}
            onChange={(e) => {
              const v = e.target.value ? Number(e.target.value) : null;
              setL({ ...l, empresa_pagadora_id: v });
              guardar({ empresa_pagadora_id: v });
            }}
          >
            {catalogos.empresas
              .filter((e) => e.activo)
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre}
                </option>
              ))}
          </select>
        </label>
        <div className="grid grid-cols-[1fr_5.5rem] gap-2">
          <label className="block">
            <span className={etiqueta}>Monto</span>
            <input
              className={`${campo} text-right tabular-nums`}
              inputMode="decimal"
              value={l.monto === 0 || l.monto === "0" ? "" : String(l.monto)}
              onChange={(e) => setL({ ...l, monto: e.target.value })}
              onBlur={() => {
                const v = Math.round((Number(String(l.monto).replace(/,/g, "")) || 0) * 100) / 100;
                setL({ ...l, monto: v });
                if (v !== Number(linea.monto)) guardar({ monto: v });
              }}
            />
          </label>
          <label className="block">
            <span className={etiqueta}>Moneda</span>
            <select
              className={campo}
              value={l.moneda}
              onChange={(e) => {
                const v = e.target.value as Linea["moneda"];
                setL({ ...l, moneda: v });
                guardar({ moneda: v });
              }}
            >
              <option value="PEN">S/</option>
              <option value="USD">US$</option>
              <option value="EUR">€</option>
            </select>
          </label>
        </div>
        <label className="block">
          <span className={etiqueta}>Forma de pago</span>
          <select
            className={campo}
            value={l.forma_pago}
            onChange={(e) => {
              const v = e.target.value as FormaPago;
              setL({ ...l, forma_pago: v });
              guardar({ forma_pago: v });
            }}
          >
            {Object.entries(FORMAS_PAGO).map(([k, t]) => (
              <option key={k} value={k}>
                {t}
              </option>
            ))}
          </select>
        </label>
        {(l.forma_pago === "adelanto" || l.forma_pago === "saldo") && (
          <label className="block">
            <span className={etiqueta}>% de adelanto o saldo</span>
            <input
              className={campo}
              inputMode="decimal"
              value={l.pct_adelanto_saldo ?? ""}
              onChange={(e) => setL({ ...l, pct_adelanto_saldo: e.target.value })}
              onBlur={() => guardar({ pct_adelanto_saldo: Number(l.pct_adelanto_saldo) || null })}
            />
          </label>
        )}
        {l.forma_pago === "credito_factura" && (
          <label className="block">
            <span className={etiqueta}>Días de crédito</span>
            <input
              className={campo}
              inputMode="numeric"
              value={l.dias_credito ?? ""}
              onChange={(e) => setL({ ...l, dias_credito: Number(soloDigitos(e.target.value)) || null })}
              onBlur={() => guardar({ dias_credito: l.dias_credito })}
            />
          </label>
        )}
      </div>

      {entrega && (
        <>
          <p className="mb-1.5 mt-3.5 text-[11px] font-bold uppercase tracking-[0.07em] text-ink-3">Fechas del viaje</p>
          <div className="grid gap-2.5 sm:grid-cols-3">
            <label className="block">
              <span className={etiqueta}>Desde</span>
              <input
                className={campo}
                type="date"
                value={l.viaje_desde ?? ""}
                onChange={(e) => {
                  setL({ ...l, viaje_desde: e.target.value || null });
                  guardar({ viaje_desde: e.target.value || null });
                }}
              />
            </label>
            <label className="block">
              <span className={etiqueta}>Hasta</span>
              <input
                className={campo}
                type="date"
                min={l.viaje_desde ?? undefined}
                value={l.viaje_hasta ?? ""}
                onChange={(e) => {
                  setL({ ...l, viaje_hasta: e.target.value || null });
                  guardar({ viaje_hasta: e.target.value || null });
                }}
              />
            </label>
          </div>
        </>
      )}

      {modo !== "agrupado_cc" && (
        <>
          {!entrega && (
            <>
          <p className="mb-1.5 mt-3.5 text-[11px] font-bold uppercase tracking-[0.07em] text-ink-3">
            Comprobante {modo === "por_documento" ? "" : "(si lo hay)"}
          </p>
          <div className="grid gap-2.5 sm:grid-cols-3">
            <label className="block">
              <span className={etiqueta}>Tipo</span>
              <select
                className={campo}
                value={l.tipo_comprobante}
                onChange={(e) => {
                  const v = e.target.value as Linea["tipo_comprobante"];
                  setL({ ...l, tipo_comprobante: v });
                  guardar({ tipo_comprobante: v });
                }}
              >
                <option value="">—</option>
                <option value="FT">Factura</option>
                <option value="BV">Boleta</option>
                <option value="RH">Recibo por honorarios</option>
                <option value="OTRO">Otro</option>
              </select>
            </label>
            <label className="block">
              <span className={etiqueta}>Serie y número</span>
              <input
                className={campo}
                value={comp}
                placeholder="F001-599"
                onChange={(e) => setComp(e.target.value)}
                onBlur={() => {
                  const c = comprobante(comp);
                  if (c) {
                    setComp(c.texto);
                    guardar({ serie: c.serie, numero: c.numero });
                  } else if (!comp.trim()) guardar({ serie: "", numero: "" });
                }}
              />
            </label>
            <label className="block">
              <span className={etiqueta}>Fecha de emisión</span>
              <input
                className={campo}
                type="date"
                value={l.fecha_comprobante ?? ""}
                onChange={(e) => {
                  setL({ ...l, fecha_comprobante: e.target.value || null });
                  guardar({ fecha_comprobante: e.target.value || null });
                }}
              />
            </label>
          </div>
          {comp && !comprobante(comp) && <p className="mt-1 text-[12px] text-danger-strong">Escríbelo como serie-número: F001-599.</p>}
            </>
          )}

          <p className="mb-1.5 mt-3.5 text-[11px] font-bold uppercase tracking-[0.07em] text-ink-3">Cuenta bancaria para verificación</p>
          <div className="grid gap-2.5 sm:grid-cols-3">
            <label className="block">
              <span className={etiqueta}>Banco</span>
              <select
                className={campo}
                value={bancoCanonico(l.banco) ?? l.banco}
                onChange={(e) => {
                  setL({ ...l, banco: e.target.value });
                  guardar({ banco: e.target.value });
                }}
              >
                <option value="">—</option>
                {BANCOS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={etiqueta}>N° de cuenta {l.cuenta && `(${l.cuenta})`}</span>
              <input
                className={campo}
                inputMode="numeric"
                autoComplete="off"
                value={cuenta}
                placeholder={l.cuenta ? "Cambiar" : "Se guardan solo los últimos 4"}
                onChange={(e) => setCuenta(e.target.value)}
                onBlur={() => {
                  if (!soloDigitos(cuenta)) return;
                  verificar({ cuenta, banco: l.banco });
                }}
              />
            </label>
            <label className="block">
              <span className={etiqueta}>CCI {l.cci && `(${l.cci})`}</span>
              <input
                className={campo}
                inputMode="numeric"
                autoComplete="off"
                value={cci}
                placeholder={l.cci ? "Cambiar" : "20 dígitos"}
                onChange={(e) => setCci(e.target.value)}
                onBlur={() => {
                  const r = revisarCci(cci, l.banco);
                  if (!r.valido) return;
                  verificar({ cci, banco: l.banco || r.banco || "" });
                }}
              />
            </label>
          </div>
          {revCci && !revCci.valido && <p className="mt-1 text-[12px] text-danger-strong">{revCci.aviso}</p>}
          {revCci?.aviso && revCci.valido && <p className="mt-1 text-[12px] text-warning-strong">{revCci.aviso}</p>}
          {l.estado_cuenta !== "sin_verificar" && (
            <p className="mt-1.5">
              <Chip tono={ESTADO_CUENTA[l.estado_cuenta]?.[1] ?? "muted"}>{ESTADO_CUENTA[l.estado_cuenta]?.[0] ?? l.estado_cuenta}</Chip>
            </p>
          )}
          {errorCuenta && <p className="mt-1 text-[12px] text-danger-strong">{errorCuenta}</p>}
          <p className="mt-1.5 text-[12px] text-ink-3">
            La cuenta completa solo viaja al servidor para compararla con las bases de cuentas (Compras, Importaciones, RRHH): la base
            guarda los últimos 4 dígitos y una huella que no se puede revertir.
          </p>
        </>
      )}
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// Enviar
// ---------------------------------------------------------------------------

function Enviar({ memo, revision, esAprobador, onHecho }: { memo: Memo; revision: Revision[] | null; esAprobador: boolean; onHecho: () => void }) {
  const [enviando, setEnviando] = useState(false);
  const [falla, setFalla] = useState<string | null>(null);
  const [descartar, setDescartar] = useState(false);
  const [motivo, setMotivo] = useState("");
  const errores = (revision ?? []).filter((r) => r.nivel === "error");
  const avisos = (revision ?? []).filter((r) => r.nivel === "aviso");

  const enviar = async () => {
    setEnviando(true);
    setFalla(null);
    try {
      const m = await emitirMemo(memo.id);
      if (m.estado === "aprobado") publicarMemo(m.id);
      onHecho();
    } catch (e) {
      setFalla((e as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Tarjeta titulo={memo.estado === "observado" ? "Volver a enviar" : "Enviar"} nota={memo.numero_visible ?? "El número se asigna al enviar"}>
      {revision === null ? (
        <p className="text-[13px] text-ink-3">Revisando…</p>
      ) : errores.length ? (
        <ul className="space-y-1 text-[13px] text-danger-strong">
          {errores.map((r) => (
            <li key={r.mensaje}>· {r.mensaje}</li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-success-strong">Listo para enviar.</p>
      )}
      {avisos.map((r) => (
        <p key={r.mensaje} className="mt-1 text-[13px] text-warning-strong">
          · {r.mensaje}
        </p>
      ))}
      {falla && (
        <p className="mt-2 text-[13px] text-danger-strong" role="alert">
          {falla}
        </p>
      )}
      <button
        type="button"
        onClick={enviar}
        disabled={enviando || revision === null || errores.length > 0}
        className={`mt-3 flex w-full items-center justify-center gap-2 ${botonPrincipal}`}
      >
        <IconoEnviar className="h-4 w-4" />
        {enviando ? "Enviando…" : esAprobador ? "Emitir (lo apruebas al emitir)" : "Enviar a aprobación"}
      </button>
      {memo.estado === "borrador" &&
        (descartar ? (
          <div className="mt-3 space-y-2">
            <input className={campo} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (al menos 5 letras)" />
            <button
              type="button"
              className={`w-full text-[13px] ${botonSecundario}`}
              disabled={motivo.trim().length < 5}
              onClick={async () => {
                try {
                  await anularMemo(memo.id, motivo);
                  onHecho();
                } catch (e) {
                  setFalla((e as Error).message);
                }
              }}
            >
              Descartar el borrador
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setDescartar(true)} className="mt-2 w-full text-[12.5px] font-semibold text-ink-2 hover:text-ink">
            Descartar borrador
          </button>
        ))}
    </Tarjeta>
  );
}

// ---------------------------------------------------------------------------
// Detalle y acciones
// ---------------------------------------------------------------------------

function Acciones({ memo, persona, contexto, onHecho }: { memo: Memo; persona: Persona; contexto: Contexto; onHecho: () => void }) {
  const mia = espera(memo, persona, contexto.permisos);
  const [modo, setModo] = useState<"observar" | "anular" | null>(null);
  const [texto, setTexto] = useState("");
  const [puntaje, setPuntaje] = useState<number | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [falla, setFalla] = useState<string | null>(null);

  const puedeAnular =
    memo.estado !== "anulado" &&
    !["registrado", "programado", "pagado"].includes(memo.estado_pago ?? "") &&
    (persona.es_administracion ||
      contexto.permisos.aprueba.includes(memo.unidad_id) ||
      (memo.emisor_id === persona.id && memo.estado === "pendiente"));

  const hacer = async (f: () => Promise<unknown>) => {
    setTrabajando(true);
    setFalla(null);
    try {
      await f();
      setModo(null);
      setTexto("");
      onHecho();
    } catch (e) {
      setFalla((e as Error).message);
    } finally {
      setTrabajando(false);
    }
  };

  if (!mia && !puedeAnular) return null;

  return (
    <Tarjeta titulo={mia === "aprobar" ? "Te toca aprobar" : mia === "cargo" ? "Te toca dar cargo" : "Acciones"}>
      {mia === "aprobar" && (
        <div className="flex flex-wrap gap-2.5">
          <button type="button" disabled={trabajando} onClick={() => hacer(async () => (await aprobarMemo(memo.id), publicarMemo(memo.id)))} className={`inline-flex items-center gap-2 ${botonPrincipal}`}>
            <IconoAprobar className="h-4.5 w-4.5" />
            Aprobar
          </button>
          <button type="button" disabled={trabajando} onClick={() => setModo(modo === "observar" ? null : "observar")} className={botonSecundario}>
            Observar
          </button>
        </div>
      )}

      {mia === "cargo" && (
        <div className="space-y-3">
          <p className="text-[13px] text-ink-2">Confirma que lo recibiste. Si quieres, valora qué tan claro y completo llegó (1 a 5).</p>
          <div role="radiogroup" aria-label="Valoración" className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={puntaje === n}
                onClick={() => setPuntaje(puntaje === n ? null : n)}
                className={`h-10 w-10 rounded-control border text-[14px] font-bold ${
                  puntaje != null && n <= puntaje ? "border-primary bg-primary-soft text-primary-strong" : "border-control bg-surface text-ink-2 hover:bg-surface-2"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <input className={campo} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Comentario (opcional)" />
          <button type="button" disabled={trabajando} onClick={() => hacer(() => darCargo(memo.id, puntaje, texto))} className={botonPrincipal}>
            Dar cargo
          </button>
        </div>
      )}

      {puedeAnular && mia !== "cargo" && (
        <button type="button" onClick={() => setModo(modo === "anular" ? null : "anular")} className="mt-3 text-[12.5px] font-semibold text-danger-strong hover:underline">
          Anular el memo
        </button>
      )}

      {modo && (
        <div className="mt-3 space-y-2">
          <textarea
            className={`${campo} min-h-20`}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={modo === "observar" ? "Qué hay que corregir" : "Por qué se anula (el número no se vuelve a usar)"}
          />
          <button
            type="button"
            disabled={trabajando || texto.trim().length < 5}
            onClick={() => hacer(() => (modo === "observar" ? observarMemo(memo.id, texto) : anularMemo(memo.id, texto)))}
            className={`text-[13px] ${
              modo === "anular"
                ? "rounded-control bg-danger px-4 py-2.5 font-semibold text-on-fill hover:bg-danger-hover disabled:bg-disabled disabled:text-disabled-ink"
                : botonPrincipal
            }`}
          >
            {modo === "observar" ? "Devolver con la observación" : "Anular"}
          </button>
        </div>
      )}
      {falla && (
        <p className="mt-2 text-[13px] text-danger-strong" role="alert">
          {falla}
        </p>
      )}
    </Tarjeta>
  );
}

function Resumen({ memo, lineas, contexto }: { memo: Memo; lineas: Linea[]; contexto: Contexto }) {
  const conceptos = new Map(contexto.catalogos.conceptos.map((c) => [c.id, c.nombre]));
  const filas: [string, React.ReactNode][] = [
    ["Número técnico", memo.id_tecnico ?? "—"],
    ["Emisor", memo.emisor_nombre],
    ["Destinatario", memo.destinatario_nombre || memo.destinatario_correo || "—"],
    ["Copias", memo.copias.length ? memo.copias.join(", ") : "—"],
    ["Versión", String(memo.version)],
  ];
  if (memo.requiere_pago) filas.push(["Total", <b key="t" className="tabular-nums">{dinero(memo.total, memo.moneda)}</b>]);
  if (memo.recibido_en) filas.push(["Cargo", `${new Date(memo.recibido_en).toLocaleString("es-PE", { timeZone: "America/Lima", dateStyle: "short", timeStyle: "short" })}${memo.valoracion ? ` · valoración ${memo.valoracion}/5` : ""}`]);
  return (
    <Tarjeta titulo="Resumen">
      <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1.5 text-[13.5px]">
        {filas.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-ink-3">{k}</dt>
            <dd className="min-w-0 break-words text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      {memo.requiere_pago && lineas.length > 0 && memo.confidencialidad === "normal" && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-control text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-3">
                <th className="py-2 pr-2 font-semibold">Beneficiario</th>
                <th className="py-2 pr-2 font-semibold">Concepto</th>
                <th className="py-2 pr-2 font-semibold">Pago</th>
                <th className="py-2 text-right font-semibold">Monto</th>
              </tr>
            </thead>
            <tbody>
              {lineas.map((l) => (
                <tr key={l.id} className="border-b border-line align-top last:border-0">
                  <td className="py-2 pr-2">
                    {l.beneficiario || "—"}
                    <span className="block text-[11.5px] text-ink-3">{l.beneficiario_doc}</span>
                  </td>
                  <td className="py-2 pr-2">{l.concepto_id ? conceptos.get(l.concepto_id) : "—"}</td>
                  <td className="py-2 pr-2">
                    {FORMAS_PAGO[l.forma_pago]}
                    <span className="block text-[11.5px] text-ink-3">{l.banco ? `${l.banco} ${l.cuenta || l.cci}` : "Sin cuenta"}</span>
                  </td>
                  <td className="py-2 text-right tabular-nums">{dinero(l.monto, l.moneda)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Tarjeta>
  );
}

const PALABRAS_EVENTO: Record<string, string> = {
  creado: "Creó el borrador",
  emitido: "Emitió el memo",
  corregido: "Corrigió y volvió a enviar",
  aprobado: "Aprobó",
  observado: "Observó",
  anulado: "Anuló",
  recibido: "Dio el cargo",
  linea_insert: "Agregó una línea",
  linea_update: "Corrigió una línea",
  linea_delete: "Quitó una línea",
  pago: "Cambió el estado del pago",
};

function Bitacora({ eventos }: { eventos: Evento[] }) {
  if (!eventos.length) return null;
  return (
    <Tarjeta titulo="Bitácora" nota="Quién hizo qué y cuándo. No se borra.">
      <ol className="space-y-2.5">
        {eventos.map((e) => {
          const d = e.detalle as { comentario?: string; motivo?: string; valoracion?: number; aprobado_por_emision?: boolean };
          return (
            <li key={e.id} className="flex gap-3 text-[13px]">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
              <span className="min-w-0">
                <b className="font-semibold text-ink">{PALABRAS_EVENTO[e.tipo] ?? e.tipo}</b>
                {d.aprobado_por_emision && <span className="text-ink-2"> · aprobado al emitir</span>}
                <span className="text-ink-2"> · {e.actor_nombre || "el sistema"}</span>
                <span className="block text-[11.5px] text-ink-3">
                  {new Date(e.en).toLocaleString("es-PE", { timeZone: "America/Lima", dateStyle: "medium", timeStyle: "short" })}
                </span>
                {(d.comentario || d.motivo) && <span className="mt-0.5 block text-ink-2">«{d.comentario || d.motivo}»</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </Tarjeta>
  );
}

/** El PDF aprobado y el legajo en Drive (los genera el servidor al aprobarse). */
function Legajo({ memo }: { memo: Memo }) {
  if (!["aprobado", "enviado", "recibido"].includes(memo.estado)) return null;
  return (
    <Tarjeta titulo="PDF y legajo" nota={memo.pdf_drive_id ? "En Drive" : "Se genera en unos minutos"}>
      {memo.pdf_drive_id ? (
        <div className="flex flex-wrap gap-2.5">
          <a href={`https://drive.google.com/file/d/${memo.pdf_drive_id}/view`} target="_blank" rel="noreferrer" className={`text-[13px] ${botonPrincipal}`}>
            Abrir el PDF aprobado
          </a>
          {memo.drive_carpeta_id && (
            <a
              href={`https://drive.google.com/drive/folders/${memo.drive_carpeta_id}`}
              target="_blank"
              rel="noreferrer"
              className={`text-[13px] ${botonSecundario}`}
            >
              Carpeta del legajo
            </a>
          )}
        </div>
      ) : (
        <p className="text-[13px] text-ink-2">El PDF membretado con el sello se genera en Drive en unos minutos, con los sustentos al lado.</p>
      )}
    </Tarjeta>
  );
}
