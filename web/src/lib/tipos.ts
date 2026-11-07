/** Las filas tal como las devuelve la base (supabase/migrations). */

export type EstadoRendicion =
  | "abierta"
  | "enviada"
  | "observada"
  | "aprobada"
  | "repuesta"
  | "liquidada";

export type Comprobante = {
  id: string;
  rendicion_id: string;
  archivo_id: string | null;
  /** La página del PDF de donde salió (1 en una foto). */
  pagina: number;
  fecha: string | null;
  tipo_comprobante_id: string | null;
  serie: string;
  numero: string;
  ruc: string;
  proveedor: string;
  proyecto_id: number | null;
  area_id: number | null;
  solicitante: string;
  concepto_id: number | null;
  descripcion: string;
  /** Postgres devuelve numeric como número o texto según el cliente: se normaliza al leer. */
  total: number | string | null;
  moneda: "PEN" | "USD";
  via: "ocr" | "clasificador" | "ia" | "manual" | null;
  /** Lo que dejó la lectura; `campos` son los que llenó ella. */
  confianza: { campos?: string[] } | null;
  descartado: boolean;
  observacion: string;
  creado_en: string;
};

export type Rendicion = {
  id: string;
  tipo: "caja" | "memo";
  caja_id: number | null;
  correlativo: number | null;
  numero_memo: string | null;
  empresa_id: number;
  fecha_solicitud: string;
  /** Quien rinde: la persona que recibió el dinero o, si no tiene cuenta, la jefatura que emitió la entrega. */
  responsable_id: string;
  /** La persona del memo de entrega de la plataforma; con `beneficiario`, a nombre de quién se rinde. */
  linea_entrega_id?: string | null;
  beneficiario?: string | null;
  beneficiario_doc?: string | null;
  monto: number | string;
  estado: EstadoRendicion;
  version: number;
  no_sustentan: string[];
  observacion: string;
  enviada_en: string | null;
  creado_en: string;
  actualizado_en: string;
};

export type Caja = {
  id: number;
  numero: string;
  empresa_id: number;
  area_id: number;
  administrador_id: string;
  monto_fondo: number | string;
  activa: boolean;
};

export type Catalogo = { id: number; nombre: string; activo: boolean };
export type TipoComprobante = { id: string; nombre: string; sustenta: boolean; orden: number; activo: boolean };
export type Concepto = Catalogo & { categoria: string; subcategoria: string };

export type Catalogos = {
  empresas: Catalogo[];
  areas: Catalogo[];
  proyectos: Catalogo[];
  tipos: TipoComprobante[];
  conceptos: Concepto[];
};

/** Mientras la rendición está así, su responsable la puede editar. */
export const EDITABLE: EstadoRendicion[] = ["abierta", "observada"];

/** Una foto o PDF subido. Sus comprobantes salen de leerlo. */
export type Archivo = {
  id: string;
  ruta: string | null;
  tipo_mime: string;
  estado_lectura: "pendiente" | "procesando" | "leido" | "fallido";
  error: string | null;
};
