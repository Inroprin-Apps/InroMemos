"use client";

import { useState } from "react";
import { cambiarEnCatalogo, crearEnCatalogo, type TablaCatalogo } from "@/lib/admin";
import { recargarCatalogos, useCatalogos } from "@/lib/catalogos";
import type { Catalogos as Listas } from "@/lib/tipos";
import { Interruptor, PaginaAdmin, cabeceraAdmin, tablaAdmin } from "../administracion";
import { Pestanita } from "../mis-rendiciones";
import { Aviso, botonPrincipal, campo } from "../piezas";
import { Texto, celda } from "../rendicion/celdas";

export function Catalogos() {
  return (
    <PaginaAdmin
      activo="catalogos"
      titulo="Catálogos"
      descripcion="Las listas que se eligen en cada comprobante. Lo que se desactiva deja de ofrecerse, pero lo ya registrado no cambia."
    >
      {() => <Contenido />}
    </PaginaAdmin>
  );
}

type Pestana = "proyectos" | "conceptos" | "areas" | "tipos_comprobante" | "empresas";

const PESTANAS: { clave: Pestana; texto: string; nota: string }[] = [
  { clave: "proyectos", texto: "Proyectos", nota: "Centros de costo. Cada comprobante va a uno." },
  {
    clave: "conceptos",
    texto: "Conceptos",
    nota: "El concepto decide la categoría y subcategoría contables, que no se escriben en la hoja pero quedan en la base.",
  },
  { clave: "areas", texto: "Áreas", nota: "El área del solicitante de cada gasto." },
  {
    clave: "tipos_comprobante",
    texto: "Tipos de comprobante",
    nota: "«Sustenta» es lo que vale por defecto en una rendición nueva; cada rendición lo puede cambiar.",
  },
  { clave: "empresas", texto: "Empresas", nota: "La empresa que se imprime en la hoja." },
];

type Fila = { id: number | string; nombre: string; activo: boolean; categoria?: string; subcategoria?: string; sustenta?: boolean };

function filasDe(c: Listas, p: Pestana): Fila[] {
  return { proyectos: c.proyectos, conceptos: c.conceptos, areas: c.areas, tipos_comprobante: c.tipos, empresas: c.empresas }[p];
}

const mayus = (v: string) => v.trim().replace(/\s+/g, " ").toUpperCase();

function Contenido() {
  const { catalogos, error: errorCatalogos } = useCatalogos();
  const [pestana, setPestana] = useState<Pestana>("proyectos");
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);

  if (errorCatalogos) return <Aviso>{errorCatalogos}</Aviso>;
  if (!catalogos) return <p className="text-ink-3">Cargando…</p>;

  const filas = filasDe(catalogos, pestana);
  const conceptos = pestana === "conceptos";
  const tipos = pestana === "tipos_comprobante";

  const hacer = async (accion: () => Promise<void>) => {
    setError(null);
    try {
      await accion();
      await recargarCatalogos();
    } catch (e) {
      setError((e as Error).message);
      setIntento((x) => x + 1);
    }
  };
  const cambiar = (id: number | string, cambios: Record<string, unknown>) => hacer(() => cambiarEnCatalogo(pestana as TablaCatalogo, id, cambios));

  return (
    <section className="flex flex-col gap-4 rounded-card border border-control bg-surface p-4">
      <div role="tablist" aria-label="Catálogo" className="flex flex-wrap gap-1.5">
        {PESTANAS.map((p) => (
          <Pestanita key={p.clave} activa={pestana === p.clave} onClick={() => setPestana(p.clave)}>
            {p.texto} · {filasDe(catalogos, p.clave).filter((f) => f.activo).length}
          </Pestanita>
        ))}
      </div>
      <p className="text-sm text-ink-2">{PESTANAS.find((p) => p.clave === pestana)?.nota}</p>
      {error && <Aviso>{error}</Aviso>}

      {!tipos && <Agregar key={pestana} conCategoria={conceptos} onAgregar={(fila) => hacer(() => crearEnCatalogo(pestana as TablaCatalogo, fila))} />}

      <div className="overflow-x-auto rounded-control border border-line">
        <table className={`${tablaAdmin} ${conceptos ? "min-w-[760px]" : ""}`}>
          <thead>
            <tr className={cabeceraAdmin}>
              <th scope="col" className="px-3 py-2.5">Nombre</th>
              {conceptos && (
                <>
                  <th scope="col" className="px-3 py-2.5">Categoría</th>
                  <th scope="col" className="px-3 py-2.5">Subcategoría</th>
                </>
              )}
              {tipos && <th scope="col" className="w-28 px-3 py-2.5">Sustenta</th>}
              <th scope="col" className="w-24 px-3 py-2.5">Activo</th>
            </tr>
          </thead>
          <tbody>
            {[...filas]
              .sort((a, b) => Number(b.activo) - Number(a.activo))
              .map((f) => (
                <tr key={f.id} className={`border-t border-line ${f.activo ? "" : "opacity-55"}`}>
                  <td className="px-2 py-1.5">
                    <Texto key={`${f.id}-${f.nombre}-${intento}`} valor={f.nombre} etiqueta="Nombre" className={`${celda} font-medium`} onGuardar={(v) => v && cambiar(f.id, { nombre: mayus(v) })} />
                  </td>
                  {conceptos && (
                    <>
                      <td className="px-2 py-1.5">
                        <Texto key={`${f.id}-c-${f.categoria}-${intento}`} valor={f.categoria ?? ""} etiqueta="Categoría" onGuardar={(v) => v && cambiar(f.id, { categoria: mayus(v) })} />
                      </td>
                      <td className="px-2 py-1.5">
                        <Texto key={`${f.id}-s-${f.subcategoria}-${intento}`} valor={f.subcategoria ?? ""} etiqueta="Subcategoría" onGuardar={(v) => v && cambiar(f.id, { subcategoria: mayus(v) })} />
                      </td>
                    </>
                  )}
                  {tipos && (
                    <td className="px-3 py-1.5">
                      <Interruptor activo={!!f.sustenta} etiqueta={`${f.nombre} sustenta`} onCambiar={(v) => cambiar(f.id, { sustenta: v })} />
                    </td>
                  )}
                  <td className="px-3 py-1.5">
                    <Interruptor activo={f.activo} etiqueta={`${f.nombre} activo`} onCambiar={(v) => cambiar(f.id, { activo: v })} />
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Agregar({ conCategoria, onAgregar }: { conCategoria: boolean; onAgregar: (fila: Record<string, unknown>) => Promise<void> }) {
  const [nombre, setNombre] = useState("");
  const [categoria, setCategoria] = useState("");
  const [subcategoria, setSubcategoria] = useState("");
  const listo = nombre.trim() && (!conCategoria || (categoria.trim() && subcategoria.trim()));
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!listo) return;
        await onAgregar({
          nombre: mayus(nombre),
          ...(conCategoria ? { categoria: mayus(categoria), subcategoria: mayus(subcategoria), origen: "administracion" } : {}),
        });
        setNombre("");
        setCategoria("");
        setSubcategoria("");
      }}
    >
      <label className="block min-w-60 flex-1 text-sm font-medium text-ink-2">
        Nuevo
        <input className={`mt-1 ${campo}`} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre" />
      </label>
      {conCategoria && (
        <>
          <label className="block w-48 text-sm font-medium text-ink-2">
            Categoría
            <input className={`mt-1 ${campo}`} value={categoria} onChange={(e) => setCategoria(e.target.value)} />
          </label>
          <label className="block w-48 text-sm font-medium text-ink-2">
            Subcategoría
            <input className={`mt-1 ${campo}`} value={subcategoria} onChange={(e) => setSubcategoria(e.target.value)} />
          </label>
        </>
      )}
      <button type="submit" className={botonPrincipal} disabled={!listo}>
        Agregar
      </button>
    </form>
  );
}
