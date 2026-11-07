"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { leerRepetidosPorRendicion, cerrarRendicion } from "@/lib/admin";
import { faltan } from "@/lib/comprobante";
import { aNumero, cuentas, soles } from "@/lib/cuentas";
import type { RendicionConResumen } from "@/lib/datos";
import { publicarEnDrive } from "@/lib/drive";
import { cuando } from "@/lib/fechas";
import { CERRADAS, recargarRendiciones, tituloRendicion, useRendiciones } from "@/lib/rendiciones";
import { PaginaAdmin, cabeceraAdmin, tablaAdmin } from "../administracion";
import { Indicador, Pestanita } from "../mis-rendiciones";
import { Aviso, Estado, botonPrincipal, botonSecundario, campoSuelto } from "../piezas";

type Pestana = "enviada" | "observada" | "aprobada" | "cerradas" | "todas";

export function Bandeja() {
  return (
    <PaginaAdmin
      activo="bandeja"
      titulo="Bandeja de revisión"
      descripcion="Lo que te enviaron. Revisa cada comprobante con su imagen; al aprobar, la rendición queda cerrada para cambios."
    >
      {() => <Contenido />}
    </PaginaAdmin>
  );
}

type Alerta = { texto: string; tono: "rojo" | "ambar" | "gris" };

function alertas(r: RendicionConResumen, repetidos: number): Alerta[] {
  const vigentes = r.comprobantes.filter((c) => !c.descartado);
  const c = cuentas(r.comprobantes, r.monto, r.no_sustentan ?? []);
  const l: Alerta[] = [];
  if (repetidos) l.push({ texto: `${repetidos} repetido${repetidos === 1 ? "" : "s"}`, tono: "rojo" });
  if (c.saldo < 0) l.push({ texto: `Excede en ${soles(-c.saldo)}`, tono: "ambar" });
  const incompletos = vigentes.filter((x) => faltan(x).length > 0).length;
  if (incompletos) l.push({ texto: `${incompletos} incompleto${incompletos === 1 ? "" : "s"}`, tono: "ambar" });
  const usd = vigentes.filter((x) => x.moneda === "USD").length;
  if (usd) l.push({ texto: `${usd} en dólares`, tono: "gris" });
  const dj = vigentes.filter((x) => x.tipo_comprobante_id === "DJ").length;
  if (dj) l.push({ texto: `${dj} declaración${dj === 1 ? "" : "es"} jurada${dj === 1 ? "" : "s"}`, tono: "gris" });
  const obs = vigentes.filter((x) => x.observacion).length;
  if (obs) l.push({ texto: `${obs} con observación`, tono: "gris" });
  return l;
}

const TONO: Record<Alerta["tono"], string> = {
  rojo: "bg-danger-soft text-danger-strong",
  ambar: "bg-warning-soft text-warning-strong",
  gris: "bg-surface-2 text-ink-2",
};

function Contenido() {
  const { rendiciones, error } = useRendiciones();
  const [repetidos, setRepetidos] = useState<Map<string, number>>(new Map());
  const [pestana, setPestana] = useState<Pestana>("enviada");
  const [tipo, setTipo] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [falla, setFalla] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    leerRepetidosPorRendicion().then(
      (m) => vigente && setRepetidos(m),
      () => {},
    );
    return () => {
      vigente = false;
    };
  }, []);

  if (error) return <Aviso>{error}</Aviso>;
  if (!rendiciones) return <p className="text-ink-3">Cargando…</p>;

  const de = (estado: Pestana) =>
    rendiciones.filter((r) =>
      estado === "todas" ? true : estado === "cerradas" ? ["repuesta", "liquidada"].includes(r.estado) : r.estado === estado,
    );
  const enviadas = de("enviada");
  // Solo lo que está en manos de administración: lo cerrado ya se revisó.
  const conRepetidos = rendiciones.filter((r) => (repetidos.get(r.id) ?? 0) > 0 && ["enviada", "observada"].includes(r.estado));
  const mes = new Date().toISOString().slice(0, 7);
  const aprobadasMes = rendiciones.filter((r) => (CERRADAS as readonly string[]).includes(r.estado) && r.actualizado_en?.startsWith(mes));

  const texto = busqueda.trim().toLowerCase();
  const lista = de(pestana)
    .filter((r) => !tipo || r.tipo === tipo)
    .filter(
      (r) =>
        !texto ||
        [tituloRendicion(r), r.responsable?.nombre ?? "", r.responsable?.correo ?? ""].some((v) => v.toLowerCase().includes(texto)),
    )
    // Lo más antiguo primero: lo que lleva más tiempo esperando.
    .sort((a, b) => (a.enviada_en ?? a.creado_en).localeCompare(b.enviada_en ?? b.creado_en));

  const cerrar = async (r: RendicionConResumen) => {
    if (!window.confirm(`¿Marcar ${tituloRendicion(r)} como ${r.tipo === "caja" ? "repuesta" : "liquidada"}?`)) return;
    setFalla(null);
    try {
      await cerrarRendicion(r);
      publicarEnDrive(r.id);
      await recargarRendiciones();
    } catch (e) {
      setFalla((e as Error).message);
    }
  };

  return (
    <>
      <section aria-label="Resumen" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador
          titulo="Por revisar"
          valor={String(enviadas.length)}
          detalle={`${soles(enviadas.reduce((s, r) => s + cuentas(r.comprobantes, r.monto, []).gastado, 0))} en total`}
        />
        <Indicador titulo="Repetidos" valor={String(conRepetidos.length)} detalle="En revisión, con un comprobante ya rendido en otra" alerta={conRepetidos.length > 0} />
        <Indicador titulo="Esperando corrección" valor={String(de("observada").length)} detalle="Observadas por administración" />
        <Indicador titulo="Aprobadas este mes" valor={String(aprobadasMes.length)} detalle={`${de("aprobada").length} por reponer o liquidar`} />
      </section>

      {falla && <Aviso>{falla}</Aviso>}

      <section className="flex flex-col gap-3 rounded-card border border-control bg-surface p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="Estado" className="mr-auto flex flex-wrap gap-1.5">
            <Pestanita activa={pestana === "enviada"} onClick={() => setPestana("enviada")}>
              Por revisar · {enviadas.length}
            </Pestanita>
            <Pestanita activa={pestana === "observada"} onClick={() => setPestana("observada")}>
              Observadas · {de("observada").length}
            </Pestanita>
            <Pestanita activa={pestana === "aprobada"} onClick={() => setPestana("aprobada")}>
              Aprobadas · {de("aprobada").length}
            </Pestanita>
            <Pestanita activa={pestana === "cerradas"} onClick={() => setPestana("cerradas")}>
              Cerradas · {de("cerradas").length}
            </Pestanita>
            <Pestanita activa={pestana === "todas"} onClick={() => setPestana("todas")}>
              Todas
            </Pestanita>
          </div>
          <select aria-label="Tipo" className={campoSuelto} value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="">Memos y cajas</option>
            <option value="memo">Solo memos</option>
            <option value="caja">Solo cajas chicas</option>
          </select>
          <input aria-label="Buscar persona o rendición" placeholder="Persona o N°" className={`${campoSuelto} w-48`} value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        </div>

        {lista.length === 0 ? (
          <p className="py-6 text-center text-ink-2">{pestana === "enviada" ? "No hay nada esperando revisión." : "Nada por aquí."}</p>
        ) : (
          <div className="overflow-x-auto rounded-control border border-line">
            <table className={`${tablaAdmin} min-w-[980px]`}>
              <thead>
                <tr className={cabeceraAdmin}>
                  <th scope="col" className="px-3 py-2.5">Rendición</th>
                  <th scope="col" className="px-3 py-2.5">Responsable</th>
                  <th scope="col" className="px-3 py-2.5">Enviada</th>
                  <th scope="col" className="px-3 py-2.5">Comprobantes</th>
                  <th scope="col" className="px-3 py-2.5 text-right">Gastado</th>
                  <th scope="col" className="px-3 py-2.5">A mirar</th>
                  <th scope="col" className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {lista.map((r) => {
                  const c = cuentas(r.comprobantes, r.monto, r.no_sustentan ?? []);
                  const a = alertas(r, repetidos.get(r.id) ?? 0);
                  return (
                    <tr key={r.id} className="border-t border-line">
                      <td className="px-3 py-3">
                        <Link href={`/rendicion/?id=${r.id}`} className="whitespace-nowrap font-semibold text-primary-strong hover:underline">
                          {tituloRendicion(r)}
                        </Link>
                        <span className="block text-xs text-ink-3">
                          {r.version > 1 ? `Versión ${r.version} · corrigió lo observado` : r.version === 1 ? "Versión 1" : "Sin enviar"}
                        </span>
                      </td>
                      <td className="px-3 py-3">{r.responsable?.nombre || r.responsable?.correo || "—"}</td>
                      <td className="px-3 py-3">{r.enviada_en ? cuando(r.enviada_en) : "—"}</td>
                      <td className="px-3 py-3">{c.comprobantes}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">
                        {soles(c.gastado)}
                        <span className="block text-xs text-ink-3">de {soles(aNumero(r.monto))}</span>
                      </td>
                      <td className="px-3 py-3">
                        <span className="flex flex-wrap gap-1">
                          {a.length ? (
                            a.map((x) => (
                              <span key={x.texto} className={`whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold ${TONO[x.tono]}`}>
                                {x.texto}
                              </span>
                            ))
                          ) : (
                            <span className="rounded-md bg-success-soft px-2 py-0.5 text-xs font-semibold text-success-strong">Sin alertas</span>
                          )}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right">
                        {r.estado === "enviada" ? (
                          <Link href={`/rendicion/revisar/?id=${r.id}`} className={`${botonPrincipal} inline-block text-sm`}>
                            Revisar
                          </Link>
                        ) : r.estado === "aprobada" ? (
                          <button type="button" onClick={() => cerrar(r)} className={`${botonSecundario} text-sm`}>
                            {r.tipo === "caja" ? "Marcar repuesta" : "Marcar liquidada"}
                          </button>
                        ) : (
                          <Estado estado={r.estado} />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
