"use client";

import { useCallback, useEffect, useState } from "react";
import { cambiarPersona, leerPersonas, type PersonaCompleta } from "@/lib/admin";
import { useCatalogos } from "@/lib/catalogos";
import { fechaCorta } from "@/lib/fechas";
import type { Persona } from "@/lib/sesion";
import { Interruptor, PaginaAdmin, cabeceraAdmin, tablaAdmin } from "../administracion";
import { Aviso, campoSuelto } from "../piezas";
import { Lista, Texto, celda } from "../rendicion/celdas";

export function Personas() {
  return (
    <PaginaAdmin
      activo="personas"
      titulo="Personas"
      descripcion="Quien entra con su cuenta @inroprin.com aparece acá. Su área se usa en los memos; administración ve y revisa todo."
    >
      {(persona) => <Contenido yo={persona} />}
    </PaginaAdmin>
  );
}

function Contenido({ yo }: { yo: Persona }) {
  const { catalogos } = useCatalogos();
  const [personas, setPersonas] = useState<PersonaCompleta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [intento, setIntento] = useState(0);

  const cargar = useCallback(async () => {
    try {
      setPersonas(await leerPersonas());
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
  }, [cargar]);

  const cambiar = async (id: string, cambios: Parameters<typeof cambiarPersona>[1]) => {
    setError(null);
    try {
      const n = await cambiarPersona(id, cambios);
      setPersonas((l) => l && l.map((p) => (p.id === id ? n : p)));
    } catch (e) {
      setError((e as Error).message);
      setIntento((x) => x + 1);
    }
  };

  if (!personas || !catalogos) return error ? <Aviso>{error}</Aviso> : <p className="text-ink-3">Cargando…</p>;

  const texto = busqueda.trim().toLowerCase();
  const lista = personas.filter((p) => !texto || `${p.nombre} ${p.correo}`.toLowerCase().includes(texto));

  return (
    <section className="flex flex-col gap-3 rounded-card border border-control bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-2">
          {personas.filter((p) => p.activo).length} activas · {personas.filter((p) => p.es_administracion).length} en administración
        </p>
        <input aria-label="Buscar persona" placeholder="Buscar por nombre o correo" className={`${campoSuelto} w-64`} value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
      </div>
      {error && <Aviso>{error}</Aviso>}
      <div className="overflow-x-auto rounded-control border border-line">
        <table className={`${tablaAdmin} min-w-[820px]`}>
          <thead>
            <tr className={cabeceraAdmin}>
              <th scope="col" className="px-3 py-2.5">Nombre</th>
              <th scope="col" className="px-3 py-2.5">Correo</th>
              <th scope="col" className="px-3 py-2.5">Área</th>
              <th scope="col" className="px-3 py-2.5">Administración</th>
              <th scope="col" className="px-3 py-2.5">Activa</th>
              <th scope="col" className="px-3 py-2.5">Desde</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((p) => {
              const soyYo = p.id === yo.id;
              return (
                <tr key={p.id} className={`border-t border-line ${p.activo ? "" : "opacity-55"}`}>
                  <td className="px-2 py-1.5">
                    <Texto key={`${p.id}-${p.nombre}-${intento}`} valor={p.nombre} etiqueta="Nombre" className={`${celda} font-medium`} onGuardar={(v) => v && cambiar(p.id, { nombre: v })} />
                  </td>
                  <td className="px-3 py-1.5 text-ink-2">{p.correo}</td>
                  <td className="px-2 py-1.5">
                    <Lista valor={p.area_id} etiqueta="Área" opciones={catalogos.areas} vacio="Sin área" onGuardar={(v) => cambiar(p.id, { area_id: v ? Number(v) : null })} />
                  </td>
                  <td className="px-3 py-1.5">
                    {/* Nadie se quita a sí mismo el rol: quedaría sin quién lo devuelva. */}
                    <Interruptor
                      activo={p.es_administracion}
                      etiqueta={`${p.nombre || p.correo} en administración`}
                      disabled={soyYo}
                      onCambiar={(v) => cambiar(p.id, { es_administracion: v })}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <Interruptor activo={p.activo} etiqueta={`${p.nombre || p.correo} activa`} disabled={soyYo} onCambiar={(v) => cambiar(p.id, { activo: v })} />
                  </td>
                  <td className="px-3 py-1.5 text-[13px] text-ink-3">{fechaCorta(p.creado_en.slice(0, 10))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[13px] text-ink-3">
        Una persona desactivada no puede entrar ni ver sus rendiciones; lo que registró queda en el historial.
      </p>
    </section>
  );
}
