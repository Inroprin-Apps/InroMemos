"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ruta } from "@/lib/base";
import { pendientesActuales, usePendientes } from "@/lib/cola";
import { useEnLinea } from "@/lib/conexion";
import { procesarCola } from "@/lib/envio";
import { cuentas } from "@/lib/cuentas";
import { useBarraContraida } from "@/lib/preferencias";
import { espera, useContextoMemos, useMemos } from "@/lib/memos";
import { EN_CURSO, tituloRendicion, useRendiciones } from "@/lib/rendiciones";
import { useSolicitudes } from "@/lib/solicitudes";
import { entrar, salir, useSesion, type Persona } from "@/lib/sesion";
import {
  IconoAjustes,
  IconoBandeja,
  IconoCheck,
  IconoCaja,
  IconoDerecha,
  IconoEnviar,
  IconoInicio,
  IconoIzquierda,
  IconoLista,
  IconoMas,
  IconoMemo,
  IconoReloj,
  IconoNube,
  IconoPago,
  IconoPersonas,
  IconoReportes,
  IconoSalir,
  IconoSinSenal,
  IconoSubir,
} from "./iconos";
import { NuevaRendicion } from "./nueva-rendicion";
import { Solicitar } from "./solicitar";
import { Valorar } from "./valorar";
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
  | "solicitudes"
  | (string & {});

/** Los dos módulos: se emiten memos sin rendir nada; se rinde solo lo que entregó un memo. */
export type Modulo = "memos" | "rendiciones";

// Lo que la pantalla abierta le dice a la barra: qué marcar y si la quiere
// en íconos. La barra vive en el layout y no se vuelve a armar al navegar.
type Pantalla = { activo?: Activo; contraida: boolean };
let pantalla: Pantalla = { contraida: false };
const oyentesPantalla = new Set<() => void>();
function marcarPantalla(p: Pantalla) {
  if (p.activo === pantalla.activo && p.contraida === pantalla.contraida) return;
  pantalla = p;
  oyentesPantalla.forEach((f) => f());
}
const usePantalla = () =>
  useSyncExternalStore(
    (f) => (oyentesPantalla.add(f), () => oyentesPantalla.delete(f)),
    () => pantalla,
    () => pantalla,
  );

// La pestaña abierta del panel de memos: el menú marca «Por aprobar»,
// «Cargos pendientes» o «Seguimiento de pagos» cuando corresponde.
let pestanaPanel: string | null = null;
const oyentesPestana = new Set<() => void>();
export function marcarPestanaPanel(p: string | null) {
  if (p === pestanaPanel) return;
  pestanaPanel = p;
  oyentesPestana.forEach((f) => f());
}
const usePestanaPanel = () =>
  useSyncExternalStore(
    (f) => (oyentesPestana.add(f), () => oyentesPestana.delete(f)),
    () => pestanaPanel,
    () => null,
  );

/**
 * El marco de toda la app, en el layout: la barra lateral (en teléfono, la de
 * abajo) se arma una vez y queda. Al cambiar de pantalla solo cambia el
 * contenido, con un fundido corto: sin corte ni «Abriendo…».
 */
export function Marco({ children }: { children: ReactNode }) {
  const sesion = useSesion();
  const { activo, contraida } = usePantalla();
  const camino = usePathname();
  if (sesion.estado !== "dentro") return <>{children}</>;
  return (
    <Armazon persona={sesion.persona} activo={activo} forzarContraida={contraida} camino={camino}>
      {children}
    </Armazon>
  );
}

/**
 * Toda página con datos pasa por acá: si no hay sesión muestra el ingreso, y
 * si la hay, el contenido con la persona ya resuelta (la barra la pone Marco).
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
  useLayoutEffect(() => marcarPantalla({ activo, contraida: Boolean(contraida) }), [activo, contraida]);

  if (sesion.estado === "cargando") {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <p className="text-ink-3" role="status">
          Abriendo INROMEMOS…
        </p>
      </main>
    );
  }
  if (sesion.estado === "fuera") return <Ingreso aviso={sesion.aviso} />;
  return <>{children(sesion.persona)}</>;
}

/** El módulo de una dirección: todo lo que cuelga de /memos/ es de memorandums. */
export const moduloDe = (camino: string): Modulo => (camino.startsWith("/memos") ? "memos" : "rendiciones");

function Armazon({
  persona,
  activo,
  forzarContraida,
  camino,
  children,
}: {
  persona: Persona;
  activo?: Activo;
  forzarContraida?: boolean;
  camino: string;
  children: ReactNode;
}) {
  const [preferida, setPreferida] = useBarraContraida();
  const [nueva, setNueva] = useState(false);
  const cerrarNueva = useCallback(() => setNueva(false), []);
  const [verCola, setVerCola] = useState(false);
  const cerrarCola = useCallback(() => setVerCola(false), []);
  const [solicitar, setSolicitar] = useState<Modulo | null>(null);
  const cerrarSolicitar = useCallback(() => setSolicitar(null), []);
  const contraida = forzarContraida || preferida;
  const modulo = moduloDe(camino);

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
        modulo={modulo}
        contraida={contraida}
        onAlternar={forzarContraida ? undefined : () => setPreferida(!preferida)}
        onNueva={() => setNueva(true)}
        onCola={() => setVerCola(true)}
        onSolicitar={setSolicitar}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <CabeceraMovil persona={persona} modulo={modulo} />
        <main key={camino} className="animar-entrada relative min-w-0 flex-1 px-4 pb-28 pt-4 md:px-7 md:pb-10 md:pt-5.5">
          {/* Quién está dentro, arriba a la derecha (como INROCONTA); los títulos le dejan sitio. */}
          <div className="absolute right-7 top-4 hidden md:block">
            <Cuenta persona={persona} />
          </div>
          {children}
        </main>
      </div>
      <NavInferior persona={persona} activo={activo} modulo={modulo} onNueva={() => setNueva(true)} onCola={() => setVerCola(true)} onSolicitar={setSolicitar} />
      {nueva && <NuevaRendicion persona={persona} onCerrar={cerrarNueva} />}
      {verCola && <PorSubir onCerrar={cerrarCola} />}
      {solicitar && <Solicitar persona={persona} origen={solicitar} onCerrar={cerrarSolicitar} />}
      <Valorar />
    </div>
  );
}

type Item = {
  clave: Activo;
  texto: string;
  href: string;
  Icono: (p: { className?: string }) => ReactNode;
  /** Lleva a una pestaña del panel de memos. */
  pestana?: string;
};
/** Lo que un ítem del menú abre en vez de navegar. */
type Accion = "nueva" | "solicitar-memo" | "solicitar-viaticos";

// Administración de cada módulo, y la que comparten (personas, catálogos, Drive).
const ADMIN_MEMOS: Item[] = [{ clave: "memos-config", texto: "Áreas y permisos", href: "/memos/configuracion/", Icono: IconoAjustes }];
const ADMIN_RENDICIONES: Item[] = [
  { clave: "bandeja", texto: "Bandeja de revisión", href: "/bandeja/", Icono: IconoBandeja },
  { clave: "cajas", texto: "Cajas chicas", href: "/cajas/", Icono: IconoCaja },
  { clave: "reportes", texto: "Reportes", href: "/reportes/", Icono: IconoReportes },
];
const ADMIN_GENERAL: Item[] = [
  { clave: "personas", texto: "Personas", href: "/personas/", Icono: IconoPersonas },
  { clave: "catalogos", texto: "Catálogos", href: "/catalogos/", Icono: IconoLista },
  { clave: "drive", texto: "Drive", href: "/drive/", Icono: IconoNube },
];

// Ítem del menú: 13.5px, 600, esquina de botón grande; activo en azul suave.
const enlace = (activo: boolean) =>
  `flex min-h-10 items-center gap-2.5 rounded-button-lg px-2.5 text-[13.5px] font-semibold transition-colors duration-150 ${
    activo ? "bg-primary-soft text-primary-strong" : "text-ink-2 hover:bg-surface-2 hover:text-ink"
  }`;

const grupo = "mb-1 px-2.5 text-[11px] font-bold uppercase tracking-[0.07em] text-ink-3";

/** INRO en tinta y MEMOS en azul fuerte, como INRO·CONTA. */
export function Marca({ className = "text-[15px]" }: { className?: string }) {
  return (
    <span className={`font-bold text-ink ${className}`}>
      INRO<span className="text-primary-strong">MEMOS</span>
    </span>
  );
}

/** Contador del menú: discreto (gris); lo que espera de ti se nota por el número. */
function Insignia({ n }: { n: number }) {
  if (!n) return null;
  return <span className="ml-auto rounded-full bg-surface-3 px-1.75 py-px text-[11px] font-bold tabular-nums text-ink-2">{n}</span>;
}

/** Cuántos memos esperan algo de quien está dentro (aprobar, dar cargo, corregir). */
function useMemosPorAtender(persona: Persona): number {
  const { memos } = useMemos();
  const { contexto } = useContextoMemos(persona.correo);
  return (memos ?? []).filter((m) => espera(m, persona, contexto?.permisos ?? null)).length;
}

/** Los KPIs son para las jefaturas (y administración, o quien tenga el permiso). */
export function veKpis(persona: Persona, permisos: { aprueba: number[]; verKpis: boolean } | null | undefined): boolean {
  return persona.es_administracion || Boolean(permisos?.verKpis) || (permisos?.aprueba.length ?? 0) > 0;
}

/** Lo que hay en cada módulo para esta persona, en orden. */
function useMenu(persona: Persona, modulo: Modulo) {
  const { contexto } = useContextoMemos(persona.correo);
  const permisos = contexto?.permisos;
  const { rendiciones } = useRendiciones();
  const porAtender = useMemosPorAtender(persona);
  const porRevisar = (rendiciones ?? []).filter((r) => r.estado === "enviada").length;
  const observadas = (rendiciones ?? []).filter((r) => r.responsable_id === persona.id && r.estado === "observada").length;
  const { solicitudes } = useSolicitudes();
  // Las que esperan a mis áreas (si emito o soy jefatura): no las mías.
  const solicitudesPendientes = (solicitudes ?? []).filter((s) => s.estado === "pendiente" && s.solicitante_id !== persona.id).length;
  const emite = persona.es_administracion || (permisos?.emite.length ?? 0) > 0;
  const solicitarMemo = Boolean(contexto?.catalogos.parametros.solicitar_memo);
  const { memos } = useMemos();
  const lista = memos ?? [];
  // Los contadores del menú, como en el diseño de Franco: lo que espera de ti.
  const porAprobar = lista.filter((m) => espera(m, persona, permisos ?? null) === "aprobar").length;
  const porCargo = lista.filter((m) => espera(m, persona, permisos ?? null) === "cargo").length;

  const items: (Item & { n?: number; accion?: Accion })[] =
    modulo === "memos"
      ? [
          { clave: "memos", texto: "Panel de memos", href: "/memos/", Icono: IconoMemo, n: porAtender },
          // Emite quien está en un área; los demás se lo piden al área.
          ...(emite ? [{ clave: "emitir", texto: "Emitir memo", href: "/memos/emitir/", Icono: IconoMas }] : []),
          { clave: "memos", pestana: "pendiente", texto: "Por aprobar", href: "/memos/?ver=pendiente", Icono: IconoCheck, n: porAprobar },
          { clave: "memos", pestana: "sin-cargo", texto: "Cargos pendientes", href: "/memos/?ver=sin-cargo", Icono: IconoReloj, n: porCargo },
          ...(permisos?.registraPagos || persona.es_administracion || emite
            ? [{ clave: "memos", pestana: "por-pagar", texto: "Seguimiento de pagos", href: "/memos/?ver=por-pagar", Icono: IconoPago }]
            : []),
          ...(solicitarMemo
            ? [{ clave: "solicitar", texto: "Solicitar memo", href: "/memos/solicitudes/", Icono: IconoEnviar, accion: "solicitar-memo" as const }]
            : []),
          ...(solicitarMemo || emite || (solicitudes ?? []).length > 0
            ? [{ clave: "solicitudes", texto: "Solicitudes", href: "/memos/solicitudes/", Icono: IconoBandeja, n: solicitudesPendientes }]
            : []),
          ...(veKpis(persona, permisos) ? [{ clave: "kpis", texto: "Métricas y KPIs", href: "/memos/kpis/", Icono: IconoReportes }] : []),
          ...(persona.es_administracion || permisos?.verificaCuentas
            ? [{ clave: "cuentas", texto: "Cuentas por verificar", href: "/memos/cuentas/", Icono: IconoAjustes }]
            : []),
        ]
      : [
          { clave: "inicio", texto: "Mis rendiciones", href: "/", Icono: IconoInicio, n: observadas },
          { clave: "nueva", texto: "Nueva rendición", href: "/", Icono: IconoMas, accion: "nueva" as const },
          { clave: "solicitar-viaticos", texto: "Solicitar viáticos", href: "/memos/solicitudes/", Icono: IconoEnviar, accion: "solicitar-viaticos" as const },
        ];
  const admin = persona.es_administracion ? (modulo === "memos" ? ADMIN_MEMOS : ADMIN_RENDICIONES) : [];
  return { items, admin, general: persona.es_administracion ? ADMIN_GENERAL : [], porAtender, porRevisar, observadas, emite, solicitarMemo };
}

/** Memorandums | Rendiciones: el interruptor de módulo, arriba de la barra. */
function SelectorModulo({ modulo, porAtender, porRevisar }: { modulo: Modulo; porAtender: number; porRevisar: number }) {
  const opcion = (m: Modulo, href: string, texto: string, n: number) => (
    <Link
      href={href}
      aria-current={modulo === m ? "page" : undefined}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-segment px-2 py-1.75 text-[12.5px] font-bold transition-colors duration-150 ${
        modulo === m ? "bg-ink text-on-fill" : "text-ink-2 hover:bg-surface-2 hover:text-ink"
      }`}
    >
      {texto}
      {n > 0 && (
        <span className={`rounded-full px-1.5 text-[10.5px] tabular-nums ${modulo === m ? "bg-on-fill/20" : "bg-surface-3 text-ink-2"}`}>{n}</span>
      )}
    </Link>
  );
  return (
    <div role="navigation" aria-label="Módulo" className="flex rounded-control border border-control bg-surface p-0.75">
      {opcion("memos", "/memos/", "Memorandums", porAtender)}
      {opcion("rendiciones", "/", "Rendiciones", porRevisar)}
    </div>
  );
}

function BarraLateral({
  persona,
  activo,
  modulo,
  contraida,
  onAlternar,
  onNueva,
  onCola,
  onSolicitar,
}: {
  persona: Persona;
  activo?: Activo;
  modulo: Modulo;
  contraida: boolean;
  onAlternar?: () => void;
  onNueva: () => void;
  onCola: () => void;
  onSolicitar: (origen: Modulo) => void;
}) {
  const { rendiciones } = useRendiciones();
  const enCola = usePendientes().length;
  const empresas = (useContextoMemos(persona.correo).contexto?.catalogos.empresas ?? []).filter((e) => e.activo).length;
  const mias = (rendiciones ?? []).filter(
    (r) => r.responsable_id === persona.id && (EN_CURSO as readonly string[]).includes(r.estado),
  );
  const { items, admin, general, porAtender, porRevisar } = useMenu(persona, modulo);
  const pestana = usePestanaPanel();
  const PESTANAS_MENU = ["pendiente", "sin-cargo", "por-pagar"];
  const marcado = (it: Item) =>
    it.pestana ? activo === "memos" && pestana === it.pestana : activo === it.clave && !(it.clave === "memos" && pestana && PESTANAS_MENU.includes(pestana));
  // Ya en el panel: cambia de pestaña sin recargar.
  const alPestana = (it: Item) => () => {
    if (it.pestana && activo === "memos") window.dispatchEvent(new CustomEvent("inromemos:pestana", { detail: it.pestana }));
  };
  const accionar = (a: Accion) => (a === "nueva" ? onNueva() : onSolicitar(a === "solicitar-memo" ? "memos" : "rendiciones"));
  const aIcono = (it: Item & { accion?: Accion }) =>
    it.accion ? (
      <button key={it.clave} type="button" onClick={() => accionar(it.accion!)} aria-label={it.texto} title={it.texto} className={`${enlace(false)} h-11 w-11 justify-center px-0`}>
        <it.Icono />
      </button>
    ) : (
      <Link key={it.href} href={it.href} onClick={alPestana(it)} aria-label={it.texto} title={it.texto} className={`${enlace(marcado(it))} h-11 w-11 justify-center px-0`}>
        <it.Icono />
      </Link>
    );

  if (contraida) {
    return (
      <nav
        aria-label="Navegación principal"
        className="sticky top-0 hidden h-dvh w-16 shrink-0 flex-col items-center gap-2 border-r border-line bg-surface py-4 md:flex"
      >
        <Link href="/" aria-label="INROMEMOS, inicio" className="mb-2">
          <Image src={ruta("inroprin-marca.svg")} alt="" width={28} height={28} />
        </Link>
        <Link
          href={modulo === "memos" ? "/" : "/memos/"}
          title={modulo === "memos" ? "Ir a Rendiciones" : "Ir a Memorandums"}
          className="mb-1 rounded-segment bg-ink px-1.5 py-1 text-[10px] font-bold text-on-fill"
        >
          {modulo === "memos" ? "MEMOS" : "REND."}
        </Link>
        {items.map(aIcono)}
        {[...admin, ...general].map(aIcono)}
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
      className="no-scrollbar sticky top-0 hidden h-dvh w-63 shrink-0 flex-col gap-4.5 overflow-y-auto border-r border-line bg-surface px-4 pb-4.5 pt-5.5 md:flex"
    >
      {/* Como INROCONTA: el ícono, el nombre y una línea de qué es (con lo del encabezado de Franco). */}
      <Link href="/" className="flex items-center gap-2.5 text-ink no-underline">
        <Image src={ruta("inroprin-marca.svg")} alt="" width={36} height={36} className="flex-none" />
        <span className="min-w-0">
          <Marca />
          <span className="block text-xs text-ink-3">
            {modulo === "memos" ? `Memorandums${empresas ? ` · ${empresas} empresas` : " · Grupo INROPRIN"}` : "Rendiciones de caja y viáticos"}
          </span>
        </span>
      </Link>

      <SelectorModulo modulo={modulo} porAtender={porAtender} porRevisar={persona.es_administracion ? porRevisar : 0} />

      <div key={modulo} className="animar-entrada flex flex-col gap-0.5">
        <p className={grupo}>{modulo === "memos" ? "Memorandums" : "Rendiciones"}</p>
        {items.map((it) =>
          it.accion ? (
            <button key={it.clave} type="button" onClick={() => accionar(it.accion!)} className={enlace(false)}>
              <it.Icono className="h-4.25 w-4.25" />
              {it.texto}
            </button>
          ) : (
            <Link key={it.href} href={it.href} onClick={alPestana(it)} className={enlace(marcado(it))}>
              <it.Icono className="h-4.25 w-4.25" />
              {it.texto}
              <Insignia n={it.n ?? 0} />
            </Link>
          ),
        )}
      </div>

      {modulo === "rendiciones" && mias.length > 0 && (
        <div className="animar-entrada flex flex-col gap-1">
          <p className={grupo}>En curso</p>
          {mias.map((r) => {
            const c = cuentas(r.comprobantes, r.monto, r.no_sustentan ?? []);
            const observada = r.estado === "observada";
            return (
              <Link
                key={r.id}
                href={`/rendicion/?id=${r.id}`}
                className={`flex flex-col gap-1.5 rounded-control px-2.5 py-2 text-[13px] transition-colors duration-150 ${
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
                    className={`block h-full transition-[width] duration-300 ${observada ? "bg-danger" : "bg-primary"}`}
                    style={{ width: `${Math.min(c.consumo ?? 0, 100)}%` }}
                  />
                </span>
              </Link>
            );
          })}
        </div>
      )}

      {admin.length > 0 && (
        <div key={`admin-${modulo}`} className="animar-entrada flex flex-col gap-0.5">
          <p className={grupo}>Administración</p>
          {admin.map((a) => (
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

      {general.length > 0 && (
        <div className="flex flex-col gap-0.5">
          <p className={grupo}>General</p>
          {general.map((a) => (
            <Link key={a.clave} href={a.href} className={enlace(activo === a.clave)}>
              <a.Icono className="h-4.5 w-4.5" />
              {a.texto}
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
      {/* Al pie, como en INROCONTA: contraer es lo que menos se usa. */}
      {onAlternar && (
        <button
          type="button"
          onClick={onAlternar}
          className={`${enCola > 0 ? "" : "mt-auto "}flex items-center gap-2.5 border-t border-line px-2.5 pb-1 pt-3.5 text-[13px] font-semibold text-ink-3 transition-colors duration-100 hover:text-ink`}
        >
          <IconoIzquierda className="h-4.25 w-4.25" />
          Contraer
        </button>
      )}
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
    <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[12px] font-bold text-primary-strong">
      {iniciales}
    </span>
  );
}

/** La cuenta, arriba a la derecha: las iniciales y, al hacer clic, nombre, correo, rol y salir. */
function Cuenta({ persona }: { persona: Persona }) {
  const [abierto, setAbierto] = useState(false);
  const [saliendo, setSaliendo] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const permisos = useContextoMemos(persona.correo).contexto?.permisos;
  const rol = persona.es_administracion
    ? "Administración"
    : permisos?.aprueba.length
      ? "Jefatura de área"
      : permisos?.emite.length
        ? "Emite memos"
        : "Consulta";
  useEffect(() => {
    if (!abierto) return;
    const cerrar = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !caja.current?.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("mousedown", cerrar);
    document.addEventListener("keydown", cerrar);
    return () => {
      document.removeEventListener("mousedown", cerrar);
      document.removeEventListener("keydown", cerrar);
    };
  }, [abierto]);
  return (
    <div ref={caja} className="relative">
      <button
        type="button"
        onClick={() => setAbierto(!abierto)}
        aria-label="Tu cuenta"
        aria-expanded={abierto}
        title={`${persona.nombre || persona.correo} · ${persona.correo}`}
        className="flex rounded-full outline-offset-2 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-primary"
      >
        <Iniciales persona={persona} />
      </button>
      {abierto && (
        <div className="animar-dialogo absolute right-0 top-10 z-50 w-64 rounded-card border border-control bg-surface p-3.5 text-xs">
          {persona.nombre && <p className="truncate text-[13px] font-bold text-ink">{persona.nombre}</p>}
          <p className="truncate text-ink-2">{persona.correo}</p>
          <p className="mt-0.5 text-ink-3">{rol}</p>
          <button
            type="button"
            disabled={saliendo}
            onClick={() => {
              setSaliendo(true);
              salir();
            }}
            className="mt-3 w-full rounded-[9px] border border-control px-3 py-2 text-left text-[12.5px] font-semibold text-ink-2 hover:bg-surface-2 hover:text-ink active:bg-surface-3"
          >
            {saliendo ? "Saliendo…" : "Cerrar sesión"}
          </button>
        </div>
      )}
    </div>
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

function CabeceraMovil({ persona, modulo }: { persona: Persona; modulo: Modulo }) {
  const { porAtender, porRevisar } = useMenu(persona, modulo);
  return (
    <header className="flex flex-col gap-2.5 border-b border-line bg-surface px-4 py-3 md:hidden">
      <div className="flex items-center gap-2.5">
        <Link href="/" className="flex items-center gap-2">
          <Image src={ruta("inroprin-marca.svg")} alt="" width={26} height={26} />
          <Marca />
        </Link>
        <span className="ml-auto truncate text-sm text-ink-2">{persona.nombre || persona.correo}</span>
      </div>
      <SelectorModulo modulo={modulo} porAtender={porAtender} porRevisar={persona.es_administracion ? porRevisar : 0} />
    </header>
  );
}

function NavInferior({
  persona,
  activo,
  modulo,
  onNueva,
  onCola,
  onSolicitar,
}: {
  persona: Persona;
  activo?: Activo;
  modulo: Modulo;
  onNueva: () => void;
  onCola: () => void;
  onSolicitar: (origen: Modulo) => void;
}) {
  const enCola = usePendientes().length;
  const { porAtender, emite, solicitarMemo } = useMenu(persona, modulo);
  const item = (on: boolean) =>
    `flex min-w-16 flex-col items-center gap-0.5 text-[11px] font-semibold transition-colors duration-150 ${on ? "text-primary-strong" : "text-ink-2"}`;
  return (
    <nav
      aria-label="Navegación"
      className="fixed inset-x-0 bottom-0 z-30 flex h-17 items-center justify-around border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {modulo === "memos" ? (
        <>
          <Link href="/memos/" className={item(activo === "memos")}>
            <span className="relative flex">
              <IconoMemo className="h-5.5 w-5.5" />
              {porAtender > 0 && (
                <span className="absolute -right-3 -top-1.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-ink px-1 text-[10px] font-bold text-on-fill">
                  {porAtender}
                </span>
              )}
            </span>
            Panel
          </Link>
          {emite ? (
            <Link href="/memos/emitir/" className={item(activo === "emitir")}>
              <IconoMas className="h-5.5 w-5.5" />
              Emitir
            </Link>
          ) : solicitarMemo ? (
            <button type="button" onClick={() => onSolicitar("memos")} className={item(false)}>
              <IconoEnviar className="h-5.5 w-5.5" />
              Solicitar
            </button>
          ) : null}
          <Link href="/memos/solicitudes/" className={item(activo === "solicitudes")}>
            <IconoBandeja className="h-5.5 w-5.5" />
            Solicitudes
          </Link>
        </>
      ) : (
        <>
          <Link href="/" className={item(activo === "inicio")}>
            <IconoInicio className="h-5.5 w-5.5" />
            Mis rendiciones
          </Link>
          <button type="button" onClick={onNueva} className={item(false)}>
            <IconoMas className="h-5.5 w-5.5" />
            Nueva
          </button>
          {/* En el teléfono no hay menú lateral: pedir viáticos va aquí abajo. */}
          <button type="button" onClick={() => onSolicitar("rendiciones")} className={item(false)}>
            <IconoEnviar className="h-5.5 w-5.5" />
            Viáticos
          </button>
        </>
      )}
      {enCola > 0 && (
        <button type="button" onClick={onCola} className={item(false)}>
          <span className="relative flex">
            <IconoSubir className="h-5.5 w-5.5" />
            <span className="absolute -right-3 -top-1.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-ink px-1 text-[10px] font-bold text-on-fill">
              {enCola}
            </span>
          </span>
          Por subir
        </button>
      )}
      {persona.es_administracion && modulo === "rendiciones" && (
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
        <h1 className="mt-6 text-2xl font-bold text-ink">INROMEMOS</h1>
        <p className="mt-2 text-ink-2">Memorandums de las empresas del grupo, y rendiciones de caja chica y viáticos.</p>

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
    <div className="animar-velo fixed inset-0 z-40 flex items-end justify-center bg-ink/40 sm:items-center sm:p-4" onClick={onCerrar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cola-titulo"
        className="animar-dialogo w-full max-w-md rounded-t-card bg-surface p-5 shadow-card sm:rounded-card"
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
