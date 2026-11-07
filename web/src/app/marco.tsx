"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ruta } from "@/lib/base";
import { pendientesActuales, usePendientes } from "@/lib/cola";
import { useEnLinea } from "@/lib/conexion";
import { procesarCola } from "@/lib/envio";
import { cuentas } from "@/lib/cuentas";
import { useBarraContraida } from "@/lib/preferencias";
import { espera, useContextoMemos, useMemos } from "@/lib/memos";
import { EN_CURSO, tituloRendicion, useRendiciones } from "@/lib/rendiciones";
import { entrar, salir, useSesion, type Persona } from "@/lib/sesion";
import {
  IconoAjustes,
  IconoBandeja,
  IconoCheck,
  IconoCaja,
  IconoDerecha,
  IconoInicio,
  IconoIzquierda,
  IconoLista,
  IconoMas,
  IconoMemo,
  IconoNube,
  IconoPersonas,
  IconoReportes,
  IconoSalir,
  IconoSinSenal,
  IconoSubir,
} from "./iconos";
import { NuevaRendicion } from "./nueva-rendicion";
import { Aviso, botonPrincipal } from "./piezas";

/** Qué está abierto, para marcarlo en la barra: una sección o el id de una rendición. */
export type Activo =
  | "inicio"
  | "memos"
  | "emitir"
  | "memos-config"
  | "kpis"
  | "cuentas"
  | "bandeja"
  | "cajas"
  | "catalogos"
  | "personas"
  | "reportes"
  | "drive"
  | (string & {});

/**
 * Toda página con datos pasa por acá: si no hay sesión muestra el ingreso, y
 * si la hay, la barra lateral (en teléfono, la de abajo) y el contenido con
 * la persona ya resuelta.
 */
export function ConSesion({
  children,
  activo,
  contraida,
}: {
  children: (persona: Persona) => ReactNode;
  activo?: Activo;
  /** La pantalla necesita todo el ancho: la barra queda en íconos. */
  contraida?: boolean;
}) {
  const sesion = useSesion();

  if (sesion.estado === "cargando") {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <p className="text-ink-3" role="status">
          Abriendo InroScan…
        </p>
      </main>
    );
  }
  if (sesion.estado === "fuera") return <Ingreso aviso={sesion.aviso} />;

  return (
    <Armazon persona={sesion.persona} activo={activo} forzarContraida={contraida}>
      {children(sesion.persona)}
    </Armazon>
  );
}

function Armazon({
  persona,
  activo,
  forzarContraida,
  children,
}: {
  persona: Persona;
  activo?: Activo;
  forzarContraida?: boolean;
  children: ReactNode;
}) {
  const [preferida, setPreferida] = useBarraContraida();
  const [nueva, setNueva] = useState(false);
  const cerrarNueva = useCallback(() => setNueva(false), []);
  const [verCola, setVerCola] = useState(false);
  const cerrarCola = useCallback(() => setVerCola(false), []);
  const contraida = forzarContraida || preferida;

  // Lo que quedó en el teléfono sube al abrir la app, al volver la señal, al
  // volver a la app y, mientras quede algo, cada medio minuto.
  useEffect(() => {
    procesarCola();
    const alVolver = () => procesarCola();
    const alMirar = () => document.visibilityState === "visible" && procesarCola();
    window.addEventListener("online", alVolver);
    document.addEventListener("visibilitychange", alMirar);
    const reloj = setInterval(() => pendientesActuales().some((p) => !p.bloqueado) && procesarCola(), 30_000);
    return () => {
      window.removeEventListener("online", alVolver);
      document.removeEventListener("visibilitychange", alMirar);
      clearInterval(reloj);
    };
  }, []);

  return (
    <div className="flex min-h-dvh flex-1">
      <BarraLateral
        persona={persona}
        activo={activo}
        contraida={contraida}
        onAlternar={forzarContraida ? undefined : () => setPreferida(!preferida)}
        onNueva={() => setNueva(true)}
        onCola={() => setVerCola(true)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <CabeceraMovil persona={persona} />
        <main className="min-w-0 flex-1 px-4 pb-28 pt-4 md:px-6 md:pb-8 md:pt-6">{children}</main>
      </div>
      <NavInferior persona={persona} activo={activo} onNueva={() => setNueva(true)} onCola={() => setVerCola(true)} />
      {nueva && <NuevaRendicion persona={persona} onCerrar={cerrarNueva} />}
      {verCola && <PorSubir onCerrar={cerrarCola} />}
    </div>
  );
}

const ADMIN: { clave: Activo; texto: string; href: string; Icono: (p: { className?: string }) => ReactNode }[] = [
  { clave: "bandeja", texto: "Bandeja de revisión", href: "/bandeja/", Icono: IconoBandeja },
  { clave: "memos-config", texto: "Áreas y permisos de memos", href: "/memos/configuracion/", Icono: IconoAjustes },
  { clave: "cajas", texto: "Cajas chicas", href: "/cajas/", Icono: IconoCaja },
  { clave: "catalogos", texto: "Catálogos", href: "/catalogos/", Icono: IconoLista },
  { clave: "personas", texto: "Personas", href: "/personas/", Icono: IconoPersonas },
  { clave: "reportes", texto: "Reportes", href: "/reportes/", Icono: IconoReportes },
  { clave: "drive", texto: "Drive", href: "/drive/", Icono: IconoNube },
];

// Ítem del menú: 13.5px, 600, esquina de botón grande; activo en azul suave.
const enlace = (activo: boolean) =>
  `flex min-h-10 items-center gap-2.5 rounded-button-lg px-2.5 text-[13.5px] font-semibold transition ${
    activo ? "bg-primary-soft text-primary-strong" : "text-ink-2 hover:bg-surface-2 hover:text-ink"
  }`;

const grupo = "mb-1 px-2.5 text-[11px] font-bold uppercase tracking-[0.07em] text-ink-3";

/** INRO en tinta y SCAN en azul fuerte, como INRO·CONTA. */
export function Marca({ className = "text-[15px]" }: { className?: string }) {
  return (
    <span className={`font-bold text-ink ${className}`}>
      INRO<span className="text-primary-strong">SCAN</span>
    </span>
  );
}

/** Insignia del menú: roja si espera algo de ti. */
function Insignia({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="ml-auto rounded-full bg-danger px-1.75 py-px text-[11px] font-bold tabular-nums text-on-fill">{n}</span>
  );
}

/** Cuántos memos esperan algo de quien está dentro (aprobar, dar cargo, corregir). */
function useMemosPorAtender(persona: Persona): number {
  const { memos } = useMemos();
  const { contexto } = useContextoMemos(persona.correo);
  return (memos ?? []).filter((m) => espera(m, persona, contexto?.permisos ?? null)).length;
}

function BarraLateral({
  persona,
  activo,
  contraida,
  onAlternar,
  onNueva,
  onCola,
}: {
  persona: Persona;
  activo?: Activo;
  contraida: boolean;
  onAlternar?: () => void;
  onNueva: () => void;
  onCola: () => void;
}) {
  const { rendiciones } = useRendiciones();
  const enCola = usePendientes().length;
  const mias = (rendiciones ?? []).filter(
    (r) => r.responsable_id === persona.id && (EN_CURSO as readonly string[]).includes(r.estado),
  );
  const porRevisar = (rendiciones ?? []).filter((r) => r.estado === "enviada").length;
  const porAtender = useMemosPorAtender(persona);
  const permisosMemo = useContextoMemos(persona.correo).contexto?.permisos;

  if (contraida) {
    return (
      <nav
        aria-label="Navegación principal"
        className="sticky top-0 hidden h-dvh w-16 shrink-0 flex-col items-center gap-2 border-r border-line bg-surface py-4 md:flex"
      >
        <Link href="/" aria-label="InroScan, inicio" className="mb-2">
          <Image src={ruta("inroprin-marca.svg")} alt="" width={28} height={28} />
        </Link>
        <Link href="/memos/" aria-label="Panel de memos" title="Panel de memos" className={`${enlace(activo === "memos")} h-11 w-11 justify-center px-0`}>
          <IconoMemo />
        </Link>
        <Link href="/memos/emitir/" aria-label="Emitir memo" title="Emitir memo" className={`${enlace(activo === "emitir")} h-11 w-11 justify-center px-0`}>
          <IconoMas />
        </Link>
        <Link href="/" aria-label="Mis rendiciones" title="Mis rendiciones" className={`${enlace(activo === "inicio")} h-11 w-11 justify-center px-0`}>
          <IconoInicio />
        </Link>
        {persona.es_administracion &&
          ADMIN.map((a) => (
            <Link key={a.clave} href={a.href} aria-label={a.texto} title={a.texto} className={`${enlace(activo === a.clave)} h-11 w-11 justify-center px-0`}>
              <a.Icono />
            </Link>
          ))}
        {onAlternar && (
          <button type="button" onClick={onAlternar} aria-label="Expandir la barra" title="Expandir la barra" className="mt-auto flex h-11 w-11 items-center justify-center rounded-control text-ink-2 hover:bg-surface-2">
            <IconoDerecha />
          </button>
        )}
      </nav>
    );
  }

  return (
    <nav
      aria-label="Navegación principal"
      className="sticky top-0 hidden h-dvh w-63 shrink-0 flex-col gap-5 overflow-y-auto border-r border-line bg-surface px-3.5 py-5 md:flex"
    >
      <div className="flex items-center gap-2.5 px-1.5">
        <Link href="/" className="flex items-center gap-2.5">
          <Image src={ruta("inroprin-marca.svg")} alt="" width={28} height={28} />
          <span className="flex flex-col leading-tight">
            <Marca />
            <span className="text-[12px] text-ink-3">Memos y rendiciones</span>
          </span>
        </Link>
        {onAlternar && (
          <button type="button" onClick={onAlternar} aria-label="Contraer la barra" title="Contraer la barra" className="ml-auto flex h-8 w-8 items-center justify-center rounded-control text-ink-2 hover:bg-surface-2">
            <IconoIzquierda className="h-4.5 w-4.5" />
          </button>
        )}
      </div>

      <div className="flex flex-col gap-0.5">
        <p className={grupo}>Memorandums</p>
        <Link href="/memos/" className={enlace(activo === "memos")}>
          <IconoMemo className="h-4.25 w-4.25" />
          Panel de memos
          <Insignia n={porAtender} />
        </Link>
        <Link href="/memos/emitir/" className={enlace(activo === "emitir")}>
          <IconoMas className="h-4.25 w-4.25" />
          Emitir memo
        </Link>
        {(persona.es_administracion || permisosMemo?.verKpis) && (
          <Link href="/memos/kpis/" className={enlace(activo === "kpis")}>
            <IconoReportes className="h-4.25 w-4.25" />
            Métricas y KPIs
          </Link>
        )}
        {(persona.es_administracion || permisosMemo?.verificaCuentas) && (
          <Link href="/memos/cuentas/" className={enlace(activo === "cuentas")}>
            <IconoCheck className="h-4.25 w-4.25" />
            Cuentas por verificar
          </Link>
        )}
      </div>

      <div className="flex flex-col gap-0.5">
        <p className={grupo}>Rendiciones</p>
        <Link href="/" className={enlace(activo === "inicio")}>
          <IconoInicio className="h-4.25 w-4.25" />
          Mis rendiciones
        </Link>
        <button type="button" onClick={onNueva} className={enlace(false)}>
          <IconoMas className="h-4.25 w-4.25" />
          Nueva rendición
        </button>
      </div>

      {mias.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className={grupo}>En curso</p>
          {mias.map((r) => {
            const c = cuentas(r.comprobantes, r.monto, r.no_sustentan ?? []);
            const observada = r.estado === "observada";
            return (
              <Link
                key={r.id}
                href={`/rendicion/?id=${r.id}`}
                className={`flex flex-col gap-1.5 rounded-control px-2.5 py-2 text-[13px] ${
                  activo === r.id ? "bg-primary-soft font-semibold text-primary-strong" : "font-medium text-ink-2 hover:bg-surface-2"
                }`}
              >
                <span className="flex justify-between gap-2">
                  <span className="truncate">{tituloRendicion(r)}</span>
                  <span className={`shrink-0 text-xs ${observada ? "font-bold text-danger-strong" : r.estado === "enviada" ? "text-warning-strong" : "text-ink-3"}`}>
                    {observada ? "Observada" : r.estado === "enviada" ? "Enviada" : `${c.consumo ?? 0} %`}
                  </span>
                </span>
                <span className="h-1 overflow-hidden rounded-full bg-line">
                  <span
                    className={`block h-full ${observada ? "bg-danger" : "bg-primary"}`}
                    style={{ width: `${Math.min(c.consumo ?? 0, 100)}%` }}
                  />
                </span>
              </Link>
            );
          })}
        </div>
      )}

      {persona.es_administracion && (
        <div className="flex flex-col gap-0.5">
          <p className={grupo}>Administración</p>
          {ADMIN.map((a) => (
            <Link key={a.clave} href={a.href} className={enlace(activo === a.clave)}>
              <a.Icono className="h-4.5 w-4.5" />
              {a.texto}
              {a.clave === "bandeja" && porRevisar > 0 && (
                <span className="ml-auto flex h-5.5 min-w-5.5 items-center justify-center rounded-full bg-warning-soft px-1.5 text-xs font-bold text-warning-strong">
                  {porRevisar}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}

      {enCola > 0 && (
        <button type="button" onClick={onCola} className="mt-auto flex items-center gap-2 rounded-control bg-warning-soft px-2.5 py-2 text-left text-[13px] font-semibold text-warning-strong">
          <IconoSubir className="h-4 w-4" />
          {enCola} por subir
        </button>
      )}
      <div className={`${enCola > 0 ? "" : "mt-auto "}flex items-center gap-2.5 border-t border-line px-1.5 pt-3.5`}>
        <Iniciales persona={persona} />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold text-ink">{persona.nombre || persona.correo}</span>
          <span className="text-xs text-ink-3">{persona.es_administracion ? "Administración" : persona.correo}</span>
        </span>
        <BotonSalir />
      </div>
    </nav>
  );
}

function Iniciales({ persona }: { persona: Persona }) {
  const iniciales = (persona.nombre || persona.correo)
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span aria-hidden="true" className="flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[13px] font-bold text-primary-strong">
      {iniciales}
    </span>
  );
}

function BotonSalir({ conTexto }: { conTexto?: boolean }) {
  const [saliendo, setSaliendo] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        setSaliendo(true);
        salir();
      }}
      disabled={saliendo}
      aria-label="Salir"
      title="Salir"
      className={
        conTexto
          ? "flex flex-col items-center gap-0.5 text-[11px] font-semibold text-ink-2"
          : "ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-control border border-control text-ink-2 hover:bg-surface-2 disabled:bg-disabled disabled:text-disabled-ink"
      }
    >
      <IconoSalir className={conTexto ? "h-5.5 w-5.5" : "h-4 w-4"} />
      {conTexto && "Salir"}
    </button>
  );
}

function CabeceraMovil({ persona }: { persona: Persona }) {
  return (
    <header className="flex items-center gap-2.5 border-b border-line bg-surface px-4 py-3 md:hidden">
      <Link href="/" className="flex items-center gap-2">
        <Image src={ruta("inroprin-marca.svg")} alt="" width={26} height={26} />
        <Marca />
      </Link>
      <span className="ml-auto truncate text-sm text-ink-2">{persona.nombre || persona.correo}</span>
    </header>
  );
}

function NavInferior({
  persona,
  activo,
  onNueva,
  onCola,
}: {
  persona: Persona;
  activo?: Activo;
  onNueva: () => void;
  onCola: () => void;
}) {
  const enCola = usePendientes().length;
  const item = (on: boolean) =>
    `flex min-w-16 flex-col items-center gap-0.5 text-[11px] font-semibold ${on ? "text-primary-strong" : "text-ink-2"}`;
  return (
    <nav
      aria-label="Navegación"
      className="fixed inset-x-0 bottom-0 z-30 flex h-17 items-center justify-around border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <Link href="/memos/" className={item(activo === "memos" || activo === "emitir")}>
        <IconoMemo className="h-5.5 w-5.5" />
        Memos
      </Link>
      <Link href="/" className={item(activo === "inicio")}>
        <IconoInicio className="h-5.5 w-5.5" />
        Rendiciones
      </Link>
      <button type="button" onClick={onNueva} className={item(false)}>
        <IconoMas className="h-5.5 w-5.5" />
        Nueva
      </button>
      {enCola > 0 && (
        <button type="button" onClick={onCola} className={item(false)}>
          <span className="relative flex">
            <IconoSubir className="h-5.5 w-5.5" />
            <span className="absolute -right-3 -top-1.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-on-fill">
              {enCola}
            </span>
          </span>
          Por subir
        </button>
      )}
      {persona.es_administracion && (
        <Link href="/bandeja/" className={item(activo === "bandeja")}>
          <IconoBandeja className="h-5.5 w-5.5" />
          Bandeja
        </Link>
      )}
      <BotonSalir conTexto />
    </nav>
  );
}

function Ingreso({ aviso }: { aviso: string | null }) {
  const [yendo, setYendo] = useState(false);
  const [falla, setFalla] = useState<string | null>(null);

  const ir = async () => {
    setYendo(true);
    setFalla(null);
    const { error } = await entrar();
    // Si todo va bien el navegador ya se fue a Google y esto no se ve.
    if (error) {
      setFalla(`No se pudo abrir Google: ${error.message}`);
      setYendo(false);
    }
  };

  return (
    <main className="flex flex-1 items-center justify-center p-4 sm:p-6">
      <section className="w-full max-w-md rounded-card border border-control bg-surface p-6 sm:p-8">
        <Image src={ruta("inroprin.svg")} alt="INROPRIN" width={183} height={41} priority />
        <h1 className="mt-6 text-2xl font-bold text-ink">InroScan</h1>
        <p className="mt-2 text-ink-2">Rendiciones de caja chica y memos de viáticos.</p>

        {(aviso || falla) && (
          <div className="mt-5">
            <Aviso>{falla ?? aviso}</Aviso>
          </div>
        )}

        <button type="button" onClick={ir} disabled={yendo} className={`mt-6 w-full py-3 ${botonPrincipal}`}>
          {yendo ? "Abriendo Google…" : "Entrar con Google"}
        </button>
        <p className="mt-3 text-center text-sm text-ink-3">Solo cuentas @inroprin.com</p>

      </section>
    </main>
  );
}

/** Lo que espera en el teléfono, de todas las rendiciones. */
function PorSubir({ onCerrar }: { onCerrar: () => void }) {
  const pendientes = usePendientes();
  const { rendiciones } = useRendiciones();
  const enLinea = useEnLinea();
  const titulo = (id: string) => {
    const r = rendiciones?.find((x) => x.id === id);
    return r ? tituloRendicion(r) : "Rendición";
  };
  const grupos = [...new Set(pendientes.map((p) => p.rendicionId))];

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 sm:items-center sm:p-4" onClick={onCerrar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cola-titulo"
        className="w-full max-w-md rounded-t-card bg-surface p-5 shadow-card sm:rounded-card"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="cola-titulo" className="text-lg font-bold text-ink">
          Por subir
        </h2>
        {!enLinea && (
          <p className="mt-3 flex gap-2.5 rounded-control bg-warning-soft px-3 py-2.5 text-sm text-warning-strong">
            <IconoSinSenal className="mt-0.5 h-5 w-5 shrink-0" />
            Sin señal. Las fotos están guardadas en este teléfono y se suben solas cuando vuelva la conexión.
          </p>
        )}
        {pendientes.length === 0 ? (
          <p className="mt-3 text-ink-2">Todo subido.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {grupos.map((id) => {
              const deEsta = pendientes.filter((p) => p.rendicionId === id);
              return (
                <li key={id}>
                  <Link href={`/rendicion/?id=${id}`} onClick={onCerrar} className="flex justify-between gap-3 rounded-control border border-line px-3 py-2.5">
                    <span className="font-semibold">{titulo(id)}</span>
                    <span className="text-sm text-ink-2">
                      {deEsta.length} foto{deEsta.length === 1 ? "" : "s"}
                      {deEsta.some((p) => p.bloqueado) ? " · con error" : ""}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-4 text-[13px] text-ink-3">En iPhone, abre la app cuando tengas internet para que se suba todo.</p>
        <div className="mt-4 flex gap-2">
          <button type="button" className={`flex-1 ${botonPrincipal}`} disabled={!enLinea || !pendientes.length} onClick={() => procesarCola()}>
            Subir ahora
          </button>
          <button type="button" className="rounded-control border border-control px-4 font-medium text-ink-2" onClick={onCerrar}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
