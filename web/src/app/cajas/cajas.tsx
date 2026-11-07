"use client";

import { useCallback, useEffect, useState } from "react";
import { cambiarCaja, crearCaja, leerCajas, leerPersonas, type PersonaCompleta } from "@/lib/admin";
import { useCatalogos } from "@/lib/catalogos";
import { aNumero, soles } from "@/lib/cuentas";
import { EN_CURSO, useRendiciones } from "@/lib/rendiciones";
import type { Caja } from "@/lib/tipos";
import { Interruptor, PaginaAdmin, cabeceraAdmin, tablaAdmin } from "../administracion";
import { Aviso, botonPrincipal, botonSecundario, campo } from "../piezas";
import { Lista, Texto, celda } from "../rendicion/celdas";

export function Cajas() {
  return (
    <PaginaAdmin
      activo="cajas"
      titulo="Cajas chicas"
      descripcion="Cada caja tiene un número fijo, un fondo y un administrador, que es quien registra sus reposiciones."
    >
      {() => <Contenido />}
    </PaginaAdmin>
  );
}

function Contenido() {
  const { catalogos } = useCatalogos();
  const { rendiciones } = useRendiciones();
  const [cajas, setCajas] = useState<Caja[] | null>(null);
  const [personas, setPersonas] = useState<PersonaCompleta[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nueva, setNueva] = useState(false);
  const [intento, setIntento] = useState(0);

  const cargar = useCallback(async () => {
    try {
      const [c, p] = await Promise.all([leerCajas(), leerPersonas()]);
      setCajas(c);
      setPersonas(p);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
  }, [cargar]);

  const cambiar = async (id: number, cambios: Parameters<typeof cambiarCaja>[1]) => {
    setError(null);
    try {
      const n = await cambiarCaja(id, cambios);
      setCajas((l) => l && l.map((c) => (c.id === id ? n : c)));
    } catch (e) {
      setError((e as Error).message);
      setIntento((x) => x + 1);
    }
  };

  if (!cajas || !catalogos) return error ? <Aviso>{error}</Aviso> : <p className="text-ink-3">Cargando…</p>;

  const opcionesPersonas = personas.map((p) => ({ id: p.id, nombre: p.nombre || p.correo, activo: p.activo }));
  const enCurso = (caja: Caja) =>
    (rendiciones ?? []).find((r) => r.caja_id === caja.id && (EN_CURSO as readonly string[]).includes(r.estado));
  const ultima = (caja: Caja) =>
    Math.max(0, ...(rendiciones ?? []).filter((r) => r.caja_id === caja.id).map((r) => r.correlativo ?? 0));

  return (
    <>
      {error && <Aviso>{error}</Aviso>}
      <div className="flex justify-end">
        <button type="button" className={botonPrincipal} onClick={() => setNueva(true)} disabled={nueva}>
          Nueva caja
        </button>
      </div>
      {nueva && (
        <NuevaCaja
          personas={opcionesPersonas.filter((p) => p.activo)}
          onCancelar={() => setNueva(false)}
          onCreada={async () => {
            setNueva(false);
            await cargar();
          }}
        />
      )}

      <section className="rounded-card border border-control bg-surface p-4">
        {cajas.length === 0 ? (
          <p className="py-6 text-center text-ink-2">Todavía no hay cajas chicas. Crea la primera con «Nueva caja».</p>
        ) : (
          <div className="overflow-x-auto rounded-control border border-line">
            <table className={`${tablaAdmin} min-w-[900px]`}>
              <thead>
                <tr className={cabeceraAdmin}>
                  <th scope="col" className="px-3 py-2.5">Caja</th>
                  <th scope="col" className="px-3 py-2.5">Administrador</th>
                  <th scope="col" className="px-3 py-2.5">Área</th>
                  <th scope="col" className="px-3 py-2.5">Empresa</th>
                  <th scope="col" className="px-3 py-2.5 text-right">Fondo</th>
                  <th scope="col" className="px-3 py-2.5">Reposición</th>
                  <th scope="col" className="px-3 py-2.5">Activa</th>
                </tr>
              </thead>
              <tbody>
                {cajas.map((c) => {
                  const actual = enCurso(c);
                  return (
                    <tr key={c.id} className={`border-t border-line ${c.activa ? "" : "opacity-60"}`}>
                      <td className="px-3 py-2 text-base font-bold">Caja {c.numero}</td>
                      <td className="px-2 py-2">
                        <Lista valor={c.administrador_id} etiqueta="Administrador" opciones={opcionesPersonas} onGuardar={(v) => v && cambiar(c.id, { administrador_id: v })} />
                      </td>
                      <td className="px-2 py-2">
                        <Lista valor={c.area_id} etiqueta="Área" opciones={catalogos.areas} onGuardar={(v) => v && cambiar(c.id, { area_id: Number(v) })} />
                      </td>
                      <td className="px-3 py-2">{catalogos.empresas.find((e) => e.id === c.empresa_id)?.nombre}</td>
                      <td className="px-2 py-2">
                        <Texto
                          key={`${c.id}-${c.monto_fondo}-${intento}`}
                          valor={aNumero(c.monto_fondo).toFixed(2)}
                          etiqueta="Fondo"
                          inputMode="decimal"
                          className={`${celda} text-right tabular-nums`}
                          onGuardar={(v) => aNumero(v) > 0 && cambiar(c.id, { monto_fondo: aNumero(v) })}
                        />
                      </td>
                      <td className="px-3 py-2 text-[13px] text-ink-2">
                        {actual ? `N° ${actual.correlativo} en curso` : ultima(c) ? `Última: N° ${ultima(c)}` : "Ninguna todavía"}
                      </td>
                      <td className="px-3 py-2">
                        <Interruptor activo={c.activa} etiqueta={`Caja ${c.numero} activa`} onCambiar={(v) => cambiar(c.id, { activa: v })} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-[13px] text-ink-3">
          Un cambio de fondo vale para las próximas reposiciones; la que está en curso conserva el suyo.
        </p>
      </section>
    </>
  );
}

function NuevaCaja({
  personas,
  onCancelar,
  onCreada,
}: {
  personas: { id: string; nombre: string }[];
  onCancelar: () => void;
  onCreada: () => Promise<void>;
}) {
  const { catalogos } = useCatalogos();
  const empresas = (catalogos?.empresas ?? []).filter((e) => e.activo);
  const [numero, setNumero] = useState("");
  const [administrador, setAdministrador] = useState("");
  const [area, setArea] = useState("");
  const [fondo, setFondo] = useState("");
  const [empresaElegida, setEmpresa] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const empresa = empresaElegida || (empresas.length === 1 ? String(empresas[0].id) : "");

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!numero.trim() || !administrador || !area || !(aNumero(fondo) > 0) || !empresa) {
      return setError("Completa número, administrador, área, fondo y empresa.");
    }
    setGuardando(true);
    setError(null);
    try {
      await crearCaja({
        numero: numero.trim(),
        administrador_id: administrador,
        area_id: Number(area),
        empresa_id: Number(empresa),
        monto_fondo: aNumero(fondo),
      });
      await onCreada();
    } catch (err) {
      setError((err as Error).message);
      setGuardando(false);
    }
  };

  const rotulo = "block text-sm font-medium text-ink-2";
  return (
    <form onSubmit={crear} className="space-y-4 rounded-card border border-control bg-surface p-5">
      <h2 className="text-lg font-bold">Nueva caja chica</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <label className={rotulo}>
          Número
          <input className={`mt-1 ${campo}`} value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="03" />
        </label>
        <label className={rotulo}>
          Administrador
          <select className={`mt-1 ${campo}`} value={administrador} onChange={(e) => setAdministrador(e.target.value)}>
            <option value="">Elegir…</option>
            {personas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className={rotulo}>
          Área
          <select className={`mt-1 ${campo}`} value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="">Elegir…</option>
            {(catalogos?.areas ?? [])
              .filter((a) => a.activo)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))}
          </select>
        </label>
        <label className={rotulo}>
          Fondo
          <input className={`mt-1 ${campo}`} inputMode="decimal" value={fondo} onChange={(e) => setFondo(e.target.value)} placeholder="1500.00" />
        </label>
        <label className={rotulo}>
          Empresa
          <select className={`mt-1 ${campo}`} value={empresa} onChange={(e) => setEmpresa(e.target.value)}>
            <option value="">Elegir…</option>
            {empresas.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </select>
        </label>
      </div>
      {fondo && aNumero(fondo) > 0 && <p className="text-sm text-ink-3">Fondo de {soles(aNumero(fondo))}.</p>}
      <p className="text-[13px] text-ink-3">Si el administrador no aparece, primero tiene que entrar una vez a InroScan con su cuenta @inroprin.com.</p>
      {error && <Aviso>{error}</Aviso>}
      <div className="flex gap-2">
        <button type="submit" className={botonPrincipal} disabled={guardando}>
          {guardando ? "Creando…" : "Crear caja"}
        </button>
        <button type="button" className={botonSecundario} onClick={onCancelar} disabled={guardando}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
