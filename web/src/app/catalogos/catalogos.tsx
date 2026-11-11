"use client";

import { useEffect, useState } from "react";
import { cambiarEnCatalogo, crearEnCatalogo, crearVariosEnCatalogo, leerPersonas, type TablaCatalogo } from "@/lib/admin";
import { recargarCatalogos, useCatalogos } from "@/lib/catalogos";
import type { Catalogos as Listas } from "@/lib/tipos";
import { Interruptor, PaginaAdmin, cabeceraAdmin, tablaAdmin } from "../administracion";
import { Pestanita } from "../mis-rendiciones";
import { Aviso, Etiqueta, botonPrincipal, botonSecundario, campo, campoSuelto } from "../piezas";
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

type Fila = {
  id: number | string;
  nombre: string;
  activo: boolean;
  categoria?: string;
  subcategoria?: string;
  sustenta?: boolean;
  confirmado?: boolean;
  propuesto_por?: string | null;
};

function filasDe(c: Listas, p: Pestana): Fila[] {
  return { proyectos: c.proyectos, conceptos: c.conceptos, areas: c.areas, tipos_comprobante: c.tipos, empresas: c.empresas }[p];
}

const mayus = (v: string) => v.trim().replace(/\s+/g, " ").toUpperCase();

function Contenido() {
  const { catalogos, error: errorCatalogos } = useCatalogos();
  const [pestana, setPestana] = useState<Pestana>("proyectos");
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [busqueda, setBusqueda] = useState("");
  // Quién propuso cada proyecto por confirmar.
  const [personas, setPersonas] = useState<Map<string, string>>(new Map());
  const hayPropuestos = Boolean(catalogos?.proyectos.some((p) => p.confirmado === false && p.activo));
  useEffect(() => {
    if (!hayPropuestos) return;
    leerPersonas().then(
      (l) => setPersonas(new Map(l.map((x) => [x.id, x.nombre || x.correo]))),
      () => {},
    );
  }, [hayPropuestos]);

  if (errorCatalogos) return <Aviso>{errorCatalogos}</Aviso>;
  if (!catalogos) return <p className="text-ink-3">Cargando…</p>;

  const todas = filasDe(catalogos, pestana);
  const conceptos = pestana === "conceptos";
  const tipos = pestana === "tipos_comprobante";
  const porConfirmar = catalogos.proyectos.filter((p) => p.confirmado === false && p.activo).length;
  const texto = busqueda.trim().toUpperCase();
  const filas = todas.filter((f) => !texto || [f.nombre, f.categoria ?? "", f.subcategoria ?? ""].some((v) => v.toUpperCase().includes(texto)));

  const hacer = async (accion: () => Promise<void>) => {
    setError(null);
    setHecho(null);
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
          <Pestanita
            key={p.clave}
            activa={pestana === p.clave}
            onClick={() => {
              setPestana(p.clave);
              setBusqueda("");
              setHecho(null);
            }}
          >
            {p.texto} · {filasDe(catalogos, p.clave).filter((f) => f.activo).length}
            {p.clave === "proyectos" && porConfirmar > 0 && ` · ${porConfirmar} por confirmar`}
          </Pestanita>
        ))}
      </div>
      <p className="text-sm text-ink-2">{PESTANAS.find((p) => p.clave === pestana)?.nota}</p>
      {error && <Aviso>{error}</Aviso>}
      {hecho && <Aviso tono="info">{hecho}</Aviso>}

      {!tipos && (
        <Agregar
          key={pestana}
          conCategoria={conceptos}
          onAgregar={(fila) => hacer(() => crearEnCatalogo(pestana as TablaCatalogo, fila))}
          onVarios={
            conceptos
              ? undefined
              : (nombres) =>
                  hacer(async () => {
                    const r = await crearVariosEnCatalogo(pestana as "proyectos" | "areas" | "empresas", nombres, todas.map((f) => f.nombre));
                    setHecho(
                      `${r.agregados === 1 ? "Se agregó 1" : `Se agregaron ${r.agregados}`}${r.repetidos ? ` · ${r.repetidos} ya ${r.repetidos === 1 ? "estaba" : "estaban"} en la lista` : ""}.`,
                    );
                  })
          }
        />
      )}

      {todas.length > 8 && (
        <input
          type="search"
          aria-label="Buscar en la lista"
          placeholder={`Buscar entre ${todas.length}…`}
          className={`max-w-xs ${campoSuelto}`}
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      )}

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
              // Primero lo que espera a administración, después lo activo.
              .sort((a, b) => Number(b.activo && a.confirmado !== false) - Number(a.activo && b.confirmado !== false) || Number(b.activo) - Number(a.activo))
              .map((f) => (
                <tr key={f.id} className={`border-t border-line ${f.activo ? "" : "opacity-55"}`}>
                  <td className="px-2 py-1.5">
                    <Texto key={`${f.id}-${f.nombre}-${intento}`} valor={f.nombre} etiqueta="Nombre" className={`${celda} font-medium`} onGuardar={(v) => v && cambiar(f.id, { nombre: mayus(v) })} />
                    {f.confirmado === false && f.activo && (
                      <span className="flex flex-wrap items-center gap-2 px-2 pb-1 text-xs text-ink-3">
                        <Etiqueta tono="aviso">Por confirmar</Etiqueta>
                        Lo propuso {personas.get(f.propuesto_por ?? "") ?? "alguien que rinde"}. Corrige el nombre si hace falta, o desactívalo si ya existe con otro.
                        <button type="button" className={`${botonSecundario} px-2.5 py-1 text-xs`} onClick={() => cambiar(f.id, { confirmado: true })}>
                          Confirmar
                        </button>
                      </span>
                    )}
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

function Agregar({
  conCategoria,
  onAgregar,
  onVarios,
}: {
  conCategoria: boolean;
  onAgregar: (fila: Record<string, unknown>) => Promise<void>;
  /** Pegar una lista (uno por línea). Solo donde basta el nombre. */
  onVarios?: (nombres: string[]) => Promise<void>;
}) {
  const [nombre, setNombre] = useState("");
  const [categoria, setCategoria] = useState("");
  const [subcategoria, setSubcategoria] = useState("");
  const [varios, setVarios] = useState(false);
  const [lista, setLista] = useState("");
  const listo = nombre.trim() && (!conCategoria || (categoria.trim() && subcategoria.trim()));
  const nombres = [...new Set(lista.split(/\r?\n/).map(mayus).filter(Boolean))];

  if (varios && onVarios) {
    return (
      <form
        className="space-y-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!nombres.length) return;
          await onVarios(nombres);
          setLista("");
          setVarios(false);
        }}
      >
        <label className="block text-sm font-medium text-ink-2">
          Pega la lista, uno por línea (por ejemplo, copiada de Excel)
          <textarea className={`mt-1 min-h-32 font-mono text-[13px] uppercase ${campo}`} value={lista} onChange={(e) => setLista(e.target.value)} placeholder={"PAQ 10 CHINA CIVIL\nPAQ 11 CHINA CIVIL\nTALLERES EPT PUNO"} />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className={botonPrincipal} disabled={!nombres.length}>
            {nombres.length ? `Agregar ${nombres.length}` : "Agregar"}
          </button>
          <button type="button" className={botonSecundario} onClick={() => setVarios(false)}>
            Cancelar
          </button>
          <span className="text-[13px] text-ink-3">Los que ya estén en la lista no se duplican.</span>
        </div>
      </form>
    );
  }

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
      {onVarios && (
        <button type="button" className={botonSecundario} onClick={() => setVarios(true)}>
          Agregar varios…
        </button>
      )}
    </form>
  );
}
