-- InroScan · Plataforma de Memorandums
--
-- El único canal formal para emitir memos de las empresas del grupo, en la
-- misma base que las rendiciones: mismas personas, mismas empresas, mismos
-- proyectos y conceptos. Porta a Postgres las reglas del diseño en Apps
-- Script (Plataforma de Memorandums v0.3.0, traspaso del 3-nov-2026):
--
--   · El servidor decide: permisos por fila y funciones; la pantalla solo muestra.
--   · Nada se borra ni se reutiliza: se anula; un número consumido no vuelve.
--   · Serie por empresa + área + año: «029-2026-FINANZAS», técnico «INR|029-2026-FINANZAS».
--   · La base nunca guarda cuentas completas: solo los últimos 4 dígitos.
--
-- Los estados cambian SOLO por las funciones emitir/aprobar/observar/anular/
-- dar_cargo. El trigger de memos rechaza cualquier otro cambio de estado.

-- ---------------------------------------------------------------------------
-- Catálogos que agrega la plataforma de memos
-- ---------------------------------------------------------------------------

-- El código corto va en el ID técnico (INR|029-2026-FINANZAS); la razón social
-- y el RUC, en el membrete.
alter table public.empresas
  add column codigo text unique check (codigo ~ '^[A-Z0-9]{2,5}$'),
  add column razon_social text not null default '',
  add column ruc text not null default '' check (ruc = '' or ruc ~ '^(10|15|16|17|20)[0-9]{9}$');

-- El DNI de quien rinde: es el beneficiario cuando una rendición se convierte
-- en memo de reposición o reembolso.
alter table public.personas
  add column dni text check (dni is null or dni ~ '^[0-9]{8}$');

create type public.modo_carpeta as enum ('anio', 'proyecto', 'directo');

-- Unidad emisora: una empresa y un área con su propia serie de números. Cada
-- empresa tiene su propia estructura: «FINANZAS» de INROPRIN y «FINANZAS» de
-- INROPLAS son dos series distintas.
create table public.unidades (
  id smallint generated always as identity primary key,
  empresa_id smallint not null references public.empresas (id),
  -- Lo que va en el número del memo: 029-2026-FINANZAS.
  codigo text not null check (codigo ~ '^[A-Z0-9]+(-[A-Z0-9]+)*$'),
  nombre text not null check (nombre = btrim(nombre) and nombre <> ''),
  -- El área de InroScan que corresponde, si la hay (para los reportes).
  area_id smallint references public.areas (id),
  requiere_aprobacion boolean not null default true,
  -- Por correo, como en la hoja de configuración: se puede configurar antes
  -- de que la persona entre por primera vez.
  jefe_correo text check (jefe_correo is null or jefe_correo ~ '^[a-z0-9._%+-]+@inroprin\.com$'),
  suplente_correo text check (suplente_correo is null or suplente_correo ~ '^[a-z0-9._%+-]+@inroprin\.com$'),
  modo_carpeta public.modo_carpeta not null default 'anio',
  carpeta_drive text,
  activo boolean not null default true,
  unique (empresa_id, codigo)
);

-- Quién emite en qué unidad, y qué más puede ver. Por correo, por lo mismo.
create table public.usuarios_memo (
  correo text primary key check (correo ~ '^[a-z0-9._%+-]+@inroprin\.com$'),
  cargo text not null default '',
  -- Los indicadores son solo para quien tiene el permiso.
  ver_kpis boolean not null default false,
  -- Interárea: ve los memos NORMALES de todas las unidades.
  interarea_todas boolean not null default false,
  -- Cómo aparece su aprobación en el PDF.
  firma text not null default 'sello' check (firma in ('sello', 'firma', 'ambos')),
  activo boolean not null default true
);

create table public.miembros_unidad (
  correo text not null references public.usuarios_memo (correo),
  unidad_id smallint not null references public.unidades (id),
  primary key (correo, unidad_id)
);

-- Interárea por unidad (además de interarea_todas).
create table public.interarea (
  correo text not null references public.usuarios_memo (correo),
  unidad_id smallint not null references public.unidades (id),
  primary key (correo, unidad_id)
);

create type public.modo_lineas as enum ('detalle', 'agrupado_cc', 'por_documento', 'sin_pago');
create type public.confidencialidad as enum ('normal', 'restringido', 'confidencial');

-- Un tipo = un mismo comportamiento (pago, modo de líneas, confidencialidad),
-- no un tema. Los 53 de la hoja TIPOS_MEMO.
create table public.tipos_memo (
  codigo text primary key check (codigo ~ '^[A-Z]{2}-[A-Z]{2,4}$'),
  familia text not null,
  nombre text not null,
  area_habitual text not null default 'VARIAS',
  lleva_pago boolean not null,
  modo_lineas public.modo_lineas not null,
  agrupa_desde smallint,
  pasa_analisis boolean not null default false,
  confidencialidad public.confidencialidad not null default 'normal',
  -- Quién lo emite hoy: la plataforma, Fianzas o InroPay Programación.
  origen text not null default 'PLATAFORMA',
  -- PROPUESTO = sugerencia del diseño, falta que Finanzas lo confirme.
  confirmado boolean not null default false,
  activo boolean not null default true,
  constraint pago_y_modo check (lleva_pago = (modo_lineas <> 'sin_pago'))
);

create table public.sustentos_tipo (
  id smallint generated always as identity primary key,
  tipo_codigo text not null references public.tipos_memo (codigo),
  documento text not null,
  nivel text not null check (nivel in ('obligatorio', 'condicional', 'recomendado')),
  condicion text not null default '',
  umbral numeric(12, 2),
  validacion_ia text not null default '',
  confirmado boolean not null default false,
  activo boolean not null default true
);

-- Valores generales. Una sola fila.
create table public.parametros_memo (
  id smallint primary key default 1 check (id = 1),
  umbral_agrupacion smallint not null default 15,
  umbral_contrato numeric(12, 2) not null default 3000,
  horas_recordatorio smallint not null default 1,
  meta_atencion_horas smallint not null default 3
);
insert into public.parametros_memo default values;

-- Último número emitido por unidad y año. La semilla (lo ya emitido fuera de
-- la plataforma) la carga administración; desde ahí solo sube.
create table public.correlativos (
  unidad_id smallint not null references public.unidades (id),
  anio smallint not null check (anio between 2020 and 2100),
  ultimo integer not null default 0 check (ultimo >= 0),
  primary key (unidad_id, anio)
);

-- ---------------------------------------------------------------------------
-- Memos
-- ---------------------------------------------------------------------------

-- Documental: borrador → pendiente → aprobado → enviado → recibido;
-- observado vuelve a pendiente al corregir; anulado es final.
create type public.estado_memo as enum
  ('borrador', 'pendiente', 'observado', 'aprobado', 'enviado', 'recibido', 'anulado');

-- Ejecución del pago: lo alimentarán InroPay y Tesorería.
create type public.estado_pago as enum
  ('en_analisis', 'registrado', 'observado_analisis', 'programado', 'pagado');

create table public.memos (
  -- Lo genera la pantalla: reintentar el mismo envío no duplica el memo.
  id uuid primary key default gen_random_uuid(),
  unidad_id smallint not null references public.unidades (id),
  empresa_id smallint not null references public.empresas (id),
  tipo_codigo text not null references public.tipos_memo (codigo),
  proyecto_id integer references public.proyectos (id),

  -- Nulos hasta emitir: el número lo asigna la base, nadie lo escribe.
  anio smallint,
  numero integer,
  numero_visible text,
  id_tecnico text unique,

  asunto text not null default '' check (length(asunto) <= 200),
  cuerpo text not null default '' check (length(cuerpo) <= 4000),

  emisor_id uuid not null references public.personas (id),
  emisor_nombre text not null default '',
  destinatario_correo text not null default ''
    check (destinatario_correo = '' or destinatario_correo ~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]+$'),
  destinatario_nombre text not null default '',
  copias text[] not null default '{}',

  estado public.estado_memo not null default 'borrador',
  estado_pago public.estado_pago,
  -- Copiados del tipo al emitir: lo que valió en ese momento.
  confidencialidad public.confidencialidad not null default 'normal',
  requiere_pago boolean not null default false,
  total numeric(14, 2) not null default 0,
  moneda text not null default 'PEN' check (moneda in ('PEN', 'USD', 'EUR')),

  -- Cada envío a aprobación sube la versión.
  version integer not null default 0,
  ultima_observacion text not null default '',
  aprobado_por uuid references public.personas (id),
  aprobado_en timestamptz,
  -- Código del sello que va en el PDF: se verifica contra esta columna.
  codigo_sello text unique,
  emitido_en timestamptz,
  enviado_en timestamptz,
  recibido_en timestamptz,
  valoracion smallint check (valoracion between 1 and 5),
  motivo_anulacion text not null default '',

  -- El puente con las rendiciones: la reposición o el reembolso que salió de una.
  rendicion_id uuid references public.rendiciones (id),
  -- FIANZAS / INROPAY-PROG / MEMOTRACKER cuando lo registre otra plataforma.
  origen text not null default 'PLATAFORMA',
  drive_carpeta_id text,
  pdf_drive_id text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  unique (unidad_id, anio, numero),
  constraint numerado check (
    (estado = 'borrador' and numero is null)
    or (estado = 'anulado')
    or (numero is not null and numero_visible is not null and id_tecnico is not null))
);

create index memos_unidad on public.memos (unidad_id, anio, numero);
create index memos_emisor on public.memos (emisor_id);
create index memos_destinatario on public.memos (destinatario_correo);
create index memos_rendicion on public.memos (rendicion_id) where rendicion_id is not null;

create type public.forma_pago as enum ('contado', 'adelanto', 'saldo', 'credito_factura');

-- Una línea de pago = una factura (o una persona, o un centro de costo en
-- planilla). Son los 17 campos que InroPay Análisis y Registro recibe sin
-- interpretar texto libre: si esto falla, hay problemas con los pagos.
create table public.lineas_pago (
  id uuid primary key default gen_random_uuid(),
  memo_id uuid not null references public.memos (id),
  orden smallint not null default 1,
  empresa_pagadora_id smallint references public.empresas (id),
  proyecto_id integer references public.proyectos (id),
  -- RUC (11), DNI (8) u otro (importaciones). Vacío mientras es borrador.
  beneficiario_doc text not null default '' check (beneficiario_doc ~ '^[A-Za-z0-9-]{0,20}$'),
  beneficiario text not null default '',
  concepto_id integer references public.conceptos (id),
  sede text not null default 'NA',
  observaciones text not null default '' check (length(observaciones) <= 300),
  monto numeric(14, 2) not null default 0 check (monto >= 0),
  moneda text not null default 'PEN' check (moneda in ('PEN', 'USD', 'EUR')),
  forma_pago public.forma_pago not null default 'contado',
  pct_adelanto_saldo numeric(5, 2) check (pct_adelanto_saldo > 0 and pct_adelanto_saldo <= 100),
  dias_credito smallint check (dias_credito > 0),
  tipo_comprobante text not null default '' check (tipo_comprobante in ('', 'FT', 'BV', 'RH', 'OTRO')),
  serie text not null default '',
  numero text not null default '',
  -- Para encontrar repetidos: F001-599 y F001-00000599 son el mismo papel.
  clave text generated always as (
    regexp_replace(upper(regexp_replace(serie, '[^A-Za-z0-9]', '', 'g')), '^0+(?=.)', '') || '-' ||
    regexp_replace(upper(regexp_replace(numero, '[^A-Za-z0-9]', '', 'g')), '^0+(?=.)', '')
  ) stored,
  fecha_comprobante date,
  banco text not null default '',
  -- Nunca la cuenta completa: «••••4521».
  cuenta text not null default '' check (cuenta ~ '^(••••)?[0-9]{0,4}$'),
  cci text not null default '' check (cci ~ '^(••••)?[0-9]{0,4}$'),
  -- coincide / distinta / no_registrada / datos_incompletos / sin_verificar
  estado_cuenta text not null default 'sin_verificar',
  creado_en timestamptz not null default now()
);

create index lineas_memo on public.lineas_pago (memo_id, orden);
create index lineas_clave on public.lineas_pago (beneficiario_doc, clave) where numero <> '';

-- Bitácora del memo: cada cambio de estado, observación, cargo o corrección.
-- La llenan los triggers y las funciones; nadie la escribe ni la borra.
create table public.memo_eventos (
  id bigint generated always as identity primary key,
  memo_id uuid not null references public.memos (id),
  tipo text not null,
  estado_antes public.estado_memo,
  estado_despues public.estado_memo,
  actor uuid,
  actor_nombre text not null default '',
  detalle jsonb not null default '{}',
  en timestamptz not null default now()
);

create index memo_eventos_memo on public.memo_eventos (memo_id, en);

-- ---------------------------------------------------------------------------
-- Reglas puras (las mismas que web/src/lib/memo-reglas.ts)
-- ---------------------------------------------------------------------------

-- RUC con su dígito verificador (módulo 11, pesos 5,4,3,2,7,6,5,4,3,2).
create function public.ruc_valido(ruc text) returns boolean
language sql immutable set search_path = '' as $$
  select ruc ~ '^(10|15|16|17|20)[0-9]{9}$' and (
    with s as (
      select 11 - (
        5 * substr(ruc, 1, 1)::int + 4 * substr(ruc, 2, 1)::int + 3 * substr(ruc, 3, 1)::int
        + 2 * substr(ruc, 4, 1)::int + 7 * substr(ruc, 5, 1)::int + 6 * substr(ruc, 6, 1)::int
        + 5 * substr(ruc, 7, 1)::int + 4 * substr(ruc, 8, 1)::int + 3 * substr(ruc, 9, 1)::int
        + 2 * substr(ruc, 10, 1)::int) % 11 as r)
    select (case r when 10 then 0 when 11 then 1 else r end) = substr(ruc, 11, 1)::int from s)
$$;

-- ---------------------------------------------------------------------------
-- Quién es quién en los memos
-- ---------------------------------------------------------------------------

create function public.mi_correo() returns text
language sql stable security definer set search_path = '' as $$
  select p.correo from public.personas p where p.id = auth.uid() and p.activo
$$;

create function public.es_miembro(u smallint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.miembros_unidad m
      join public.usuarios_memo x on x.correo = m.correo and x.activo
     where m.unidad_id = u and m.correo = public.mi_correo())
$$;

-- Jefe o suplente de la unidad: aprueba, observa y ve lo restringido.
create function public.es_aprobador(u smallint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.unidades n
     where n.id = u and public.mi_correo() is not null
       and public.mi_correo() in (n.jefe_correo, n.suplente_correo))
$$;

create function public.ve_interarea(u smallint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.usuarios_memo x
     where x.correo = public.mi_correo() and x.activo
       and (x.interarea_todas
            or exists (select 1 from public.interarea i where i.correo = x.correo and i.unidad_id = u)))
$$;

create function public.ve_kpis() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.es_admin() or exists (
    select 1 from public.usuarios_memo x where x.correo = public.mi_correo() and x.activo and x.ver_kpis)
$$;

-- Quién ve un memo. Mira las columnas de la fila (no la busca por id), por lo
-- mismo que las políticas de rendiciones: INSERT … RETURNING.
--   · administración: todo
--   · participantes (emisor, destinatario, copias): el suyo
--   · jefe o suplente de la unidad: todo lo de su unidad
--   · miembros de la unidad: lo NORMAL y lo RESTRINGIDO de su unidad; lo
--     CONFIDENCIAL (planilla) solo si son participantes
--   · interárea: solo lo NORMAL, y nunca borradores ajenos
create function public.puede_ver_memo(
  unidad smallint, emisor uuid, destinatario text, copias text[],
  conf public.confidencialidad, estado public.estado_memo)
returns boolean
language sql stable security definer set search_path = '' as $$
  select public.persona_activa() and (
    public.es_admin()
    or emisor = auth.uid()
    or (estado <> 'borrador' and (
          destinatario = public.mi_correo()
          or public.mi_correo() = any (copias)
          or public.es_aprobador(unidad)
          or (public.es_miembro(unidad) and conf <> 'confidencial')
          or (public.ve_interarea(unidad) and conf = 'normal'))))
$$;

-- ---------------------------------------------------------------------------
-- Memos: lo que se completa solo y lo que nadie puede tocar
-- ---------------------------------------------------------------------------

-- Las funciones de estado encienden esta marca dentro de su transacción.
create function public.en_transicion() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(current_setting('memos.transicion', true), '') = 'si'
$$;

create function public.memo_al_guardar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  t public.tipos_memo;
begin
  new.actualizado_en := now();

  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.emisor_id := auth.uid();
    end if;
    new.estado := 'borrador';
    new.estado_pago := null;
    new.anio := null;
    new.numero := null;
    new.numero_visible := null;
    new.id_tecnico := null;
    new.version := 0;
    new.ultima_observacion := '';
    new.aprobado_por := null;
    new.aprobado_en := null;
    new.codigo_sello := null;
    new.emitido_en := null;
    new.enviado_en := null;
    new.recibido_en := null;
    new.valoracion := null;
    new.motivo_anulacion := '';
    new.emisor_nombre := coalesce(
      (select coalesce(nullif(p.nombre, ''), p.correo) from public.personas p where p.id = new.emisor_id), '');
  elsif not public.en_transicion() and auth.uid() is not null then
    if new.estado is distinct from old.estado or new.estado_pago is distinct from old.estado_pago
       or new.numero is distinct from old.numero or new.anio is distinct from old.anio
       or new.numero_visible is distinct from old.numero_visible
       or new.id_tecnico is distinct from old.id_tecnico or new.version <> old.version
       or new.aprobado_por is distinct from old.aprobado_por
       or new.aprobado_en is distinct from old.aprobado_en
       or new.codigo_sello is distinct from old.codigo_sello
       or new.emitido_en is distinct from old.emitido_en
       or new.enviado_en is distinct from old.enviado_en
       or new.recibido_en is distinct from old.recibido_en
       or new.valoracion is distinct from old.valoracion
       or new.ultima_observacion <> old.ultima_observacion
       or new.motivo_anulacion <> old.motivo_anulacion
       or new.emisor_id <> old.emisor_id or new.creado_en <> old.creado_en
       or new.rendicion_id is distinct from old.rendicion_id
       or new.origen <> old.origen then
      raise exception 'Eso no se cambia a mano: lo cambian emitir, aprobar, observar, anular o dar cargo.';
    end if;
    if old.estado not in ('borrador', 'observado') then
      raise exception 'El memo está %: ya no se edita.', old.estado;
    end if;
    if old.emisor_id <> auth.uid() then
      raise exception 'Solo quien emite corrige su memo.';
    end if;
    if new.unidad_id <> old.unidad_id and old.estado <> 'borrador' then
      raise exception 'Un memo con número no cambia de área: su número es de esa serie.';
    end if;
  end if;

  if tg_op = 'INSERT' or new.unidad_id <> old.unidad_id then
    select n.empresa_id into new.empresa_id from public.unidades n where n.id = new.unidad_id and n.activo;
    if new.empresa_id is null then
      raise exception 'Esa área no existe o está inactiva.';
    end if;
  end if;
  if tg_op = 'INSERT' or new.tipo_codigo <> old.tipo_codigo then
    select * into t from public.tipos_memo where codigo = new.tipo_codigo and activo;
    if not found then
      raise exception 'Ese tipo de memo no existe o está inactivo.';
    end if;
    new.confidencialidad := t.confidencialidad;
    new.requiere_pago := t.lleva_pago;
  end if;
  new.destinatario_correo := lower(btrim(new.destinatario_correo));
  new.destinatario_nombre := coalesce(
    (select coalesce(nullif(p.nombre, ''), p.correo) from public.personas p
      where p.correo = new.destinatario_correo), '');
  new.copias := coalesce(
    (select array_agg(distinct lower(btrim(c))) from unnest(new.copias) c where btrim(c) <> ''), '{}');
  return new;
end $$;

create trigger memo_al_guardar
  before insert or update on public.memos
  for each row execute function public.memo_al_guardar();

-- Cada cambio de estado deja su evento. Las funciones agregan el detalle
-- (observación, motivo, valoración) en la misma fila del evento.
create function public.memo_evento_de_estado() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.memo_eventos (memo_id, tipo, estado_despues, actor, actor_nombre)
    values (new.id, 'creado', new.estado, auth.uid(),
            coalesce((select coalesce(nullif(p.nombre, ''), p.correo) from public.personas p where p.id = auth.uid()), ''));
  elsif new.estado is distinct from old.estado then
    insert into public.memo_eventos (memo_id, tipo, estado_antes, estado_despues, actor, actor_nombre, detalle)
    values (new.id, coalesce(nullif(current_setting('memos.evento', true), ''), new.estado::text),
            old.estado, new.estado, auth.uid(),
            coalesce((select coalesce(nullif(p.nombre, ''), p.correo) from public.personas p where p.id = auth.uid()), ''),
            coalesce(nullif(current_setting('memos.detalle', true), '')::jsonb, '{}'));
  elsif new.estado_pago is distinct from old.estado_pago then
    insert into public.memo_eventos (memo_id, tipo, estado_antes, estado_despues, actor, detalle)
    values (new.id, 'pago', old.estado, new.estado, auth.uid(),
            jsonb_build_object('antes', old.estado_pago, 'despues', new.estado_pago));
  end if;
  return null;
end $$;

create trigger memo_evento_de_estado
  after insert or update on public.memos
  for each row execute function public.memo_evento_de_estado();

-- Líneas: solo mientras el memo se edita, y solo quien lo emite. Una vez
-- numerado, todo cambio de línea queda en la bitácora con su antes y después.
create function public.linea_al_guardar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  m public.memos;
  fila public.lineas_pago := case tg_op when 'DELETE' then old else new end;
begin
  select * into m from public.memos where id = fila.memo_id;
  if tg_op = 'UPDATE' and new.memo_id <> old.memo_id then
    raise exception 'Una línea no se cambia de memo.';
  end if;
  if auth.uid() is not null then
    if m.estado not in ('borrador', 'observado') then
      raise exception 'El memo está %: sus líneas ya no se editan.', m.estado;
    end if;
    if m.emisor_id <> auth.uid() then
      raise exception 'Solo quien emite cambia las líneas de su memo.';
    end if;
  end if;
  if m.numero is not null then
    insert into public.memo_eventos (memo_id, tipo, estado_antes, estado_despues, actor, detalle)
    values (m.id, 'linea_' || lower(tg_op), m.estado, m.estado, auth.uid(),
            case tg_op when 'INSERT' then jsonb_build_object('despues', to_jsonb(new))
                       when 'DELETE' then jsonb_build_object('antes', to_jsonb(old))
                       else jsonb_build_object('antes', to_jsonb(old), 'despues', to_jsonb(new)) end);
  end if;
  return case tg_op when 'DELETE' then old else new end;
end $$;

create trigger linea_al_guardar
  before insert or update or delete on public.lineas_pago
  for each row execute function public.linea_al_guardar();

-- El correlativo solo sube: un número consumido no vuelve.
create function public.correlativo_solo_sube() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.ultimo < old.ultimo then
    raise exception 'El correlativo no retrocede: ya se emitió el %.', old.ultimo;
  end if;
  return new;
end $$;

create trigger correlativo_solo_sube
  before update on public.correlativos
  for each row execute function public.correlativo_solo_sube();

-- ---------------------------------------------------------------------------
-- Revisión previa: todo lo que impide emitir, en palabras. Sin efectos: la
-- pantalla la llama mientras se escribe, y emitir la vuelve a correr.
-- ---------------------------------------------------------------------------

create function public.revisar_memo(mid uuid)
returns table (nivel text, mensaje text)
language plpgsql stable security definer set search_path = '' as $$
declare
  m public.memos;
  t public.tipos_memo;
  n public.unidades;
  par public.parametros_memo;
  l record;
  c record;
  s record;
  cuantas integer;
  monedas integer;
begin
  select * into m from public.memos where id = mid;
  if not found or not public.puede_ver_memo(m.unidad_id, m.emisor_id, m.destinatario_correo,
                                            m.copias, m.confidencialidad, m.estado) then
    raise exception 'No existe ese memo o no lo puedes ver.';
  end if;
  select * into t from public.tipos_memo where codigo = m.tipo_codigo;
  select * into n from public.unidades where id = m.unidad_id;
  select * into par from public.parametros_memo;

  if btrim(m.asunto) = '' then return query select 'error', 'Falta el asunto.'; end if;
  if btrim(m.cuerpo) = '' then return query select 'error', 'Falta el cuerpo del memo.'; end if;
  if m.destinatario_correo = '' then
    return query select 'error', 'Falta a quién va dirigido.';
  elsif m.destinatario_correo = (select p.correo from public.personas p where p.id = m.emisor_id) then
    return query select 'error', 'El destinatario no puede ser quien emite.';
  end if;
  if (select e.codigo from public.empresas e where e.id = m.empresa_id) is null then
    return query select 'error', 'La empresa no tiene código corto: administración lo completa.';
  end if;
  if n.requiere_aprobacion and n.jefe_correo is null and n.suplente_correo is null then
    return query select 'error', 'El área exige aprobación pero no tiene jefe ni suplente: administración lo completa.';
  end if;

  select count(*), count(distinct x.moneda) into cuantas, monedas
    from public.lineas_pago x where x.memo_id = mid;

  if not t.lleva_pago then
    if cuantas > 0 then
      return query select 'error', 'Este tipo de memo no lleva pago: quita las líneas.';
    end if;
    return;
  end if;

  if cuantas = 0 then
    return query select 'error', 'Este tipo de memo lleva pago: falta al menos una línea.';
    return;
  end if;
  if monedas > 1 then
    return query select 'error', 'Todas las líneas van en la misma moneda: un memo por moneda.';
  end if;
  if t.modo_lineas = 'detalle' and cuantas >= coalesce(t.agrupa_desde, par.umbral_agrupacion) then
    return query select 'error', format('Son %s personas: desde %s se agrupa en un solo pago (planilla).',
                                        cuantas, coalesce(t.agrupa_desde, par.umbral_agrupacion));
  end if;

  for l in select x.* from public.lineas_pago x where x.memo_id = mid order by x.orden, x.creado_en loop
    if l.empresa_pagadora_id is null then
      return query select 'error', format('Línea %s: falta la empresa que paga.', l.orden);
    end if;
    if l.monto <= 0 then
      return query select 'error', format('Línea %s: falta el monto.', l.orden);
    end if;
    if t.modo_lineas = 'agrupado_cc' then
      if l.concepto_id is null or l.proyecto_id is null then
        return query select 'error', format('Línea %s: un pago agrupado lleva concepto y centro de costo.', l.orden);
      end if;
      continue;
    end if;
    if l.beneficiario_doc = '' or l.beneficiario = '' then
      return query select 'error', format('Línea %s: falta el beneficiario y su RUC o DNI.', l.orden);
    elsif length(l.beneficiario_doc) = 11 and l.beneficiario_doc ~ '^[0-9]+$' then
      if not public.ruc_valido(l.beneficiario_doc) then
        return query select 'error', format('Línea %s: el RUC %s no es válido (dígito verificador).', l.orden, l.beneficiario_doc);
      end if;
    elsif not (l.beneficiario_doc ~ '^[0-9]{8}$') and n.codigo <> 'COMEX' then
      return query select 'error', format('Línea %s: el documento tiene que ser un RUC de 11 o un DNI de 8 dígitos.', l.orden);
    end if;
    if l.concepto_id is null then
      return query select 'error', format('Línea %s: falta el concepto.', l.orden);
    end if;
    if l.forma_pago in ('adelanto', 'saldo') and l.pct_adelanto_saldo is null then
      return query select 'error', format('Línea %s: falta el porcentaje del adelanto o saldo.', l.orden);
    end if;
    if l.forma_pago = 'credito_factura' and l.dias_credito is null then
      return query select 'error', format('Línea %s: faltan los días de crédito.', l.orden);
    end if;
    if t.modo_lineas = 'por_documento' then
      if l.tipo_comprobante = '' or l.numero = '' or l.fecha_comprobante is null then
        return query select 'error', format('Línea %s: falta el comprobante (tipo, número y fecha).', l.orden);
      elsif l.fecha_comprobante > (now() at time zone 'America/Lima')::date then
        return query select 'error', format('Línea %s: la fecha del comprobante es futura.', l.orden);
      end if;
    end if;
    if l.numero <> '' then
      if exists (select 1 from public.lineas_pago o
                  where o.memo_id = mid and o.id <> l.id
                    and o.beneficiario_doc = l.beneficiario_doc and o.clave = l.clave) then
        return query select 'error', format('Línea %s: el comprobante %s-%s está dos veces en el memo.', l.orden, l.serie, l.numero);
      end if;
      -- Contra otros memos que no estén anulados. La búsqueda salta los
      -- permisos a propósito: un repetido se avisa aunque esté en otra área,
      -- pero solo se dice su número, nada más.
      return query
        select 'error', format('Línea %s: el comprobante %s-%s de %s ya se pidió en el memo %s.',
                               l.orden, l.serie, l.numero, l.beneficiario_doc, coalesce(o.numero_visible, 'en borrador'))
          from public.lineas_pago x join public.memos o on o.id = x.memo_id
         where x.memo_id <> mid and o.estado not in ('anulado', 'borrador')
           and x.beneficiario_doc = l.beneficiario_doc and x.clave = l.clave
         limit 1;
    end if;
    -- Lo que dice SUNAT, por la copia de INROCONTA (migración …_inroconta).
    -- Si la copia todavía no se trajo, no se dice nada: no es un error del memo.
    if l.beneficiario_doc ~ '^[0-9]{11}$' then
      select x.* into c from public.contribuyentes x where x.ruc = l.beneficiario_doc;
      if found then
        if c.ssco then
          return query select 'error', format('Línea %s: %s está en la lista SSCO de SUNAT (sujeto sin capacidad operativa%s). No se le paga.',
                                              l.orden, coalesce(c.razon_social, l.beneficiario_doc),
                                              coalesce(', ' || c.ssco_resolucion, ''));
        elsif coalesce(c.estado, 'ACTIVO') <> 'ACTIVO' or coalesce(c.condicion, 'HABIDO') <> 'HABIDO' then
          return query select 'aviso', format('Línea %s: SUNAT registra a %s como %s / %s.',
                                              l.orden, coalesce(c.razon_social, l.beneficiario_doc),
                                              coalesce(c.estado, '—'), coalesce(c.condicion, '—'));
        end if;
      end if;
      -- El SIRE es el registro de compras de INROPRIN: solo sus facturas.
      if l.tipo_comprobante = 'FT' and l.numero <> ''
         and (select e.codigo from public.empresas e where e.id = l.empresa_pagadora_id) = 'INR'
         and exists (select 1 from public.sire_comprobantes) then
        select x.* into s from public.sire_comprobantes x
         where x.proveedor_ruc = l.beneficiario_doc and x.tipo = '01' and x.clave = l.clave
         order by x.periodo desc nulls last limit 1;
        if not found then
          return query select 'aviso', format('Línea %s: la factura %s-%s todavía no aparece en el registro de compras de SUNAT (SIRE). Confirma el número.',
                                              l.orden, l.serie, l.numero);
        else
          if s.total is not null and l.forma_pago = 'contado' and abs(s.total - l.monto) > 0.05 then
            return query select 'aviso', format('Línea %s: SUNAT registra la factura por %s %s; el memo pide %s.',
                                                l.orden, coalesce(s.moneda, ''), to_char(s.total, 'FM999,999,990.00'),
                                                to_char(l.monto, 'FM999,999,990.00'));
          end if;
          if s.en_concar then
            return query select 'aviso', format('Línea %s: la factura ya está registrada en CONCAR.', l.orden);
          end if;
        end if;
      end if;
    end if;
    if l.estado_cuenta = 'distinta' then
      return query select 'aviso', format('Línea %s: la cuenta no es la registrada para %s. Se verifica antes de pagar.', l.orden, l.beneficiario);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Las transiciones
-- ---------------------------------------------------------------------------

-- Emitir (o volver a enviar después de una observación). La primera vez
-- reserva el número con un candado sobre la fila del correlativo: dos
-- emisiones a la vez nunca reciben el mismo. Si algo falla, la transacción
-- entera vuelve atrás y el número no se consume.
create function public.emitir_memo(mid uuid) returns public.memos
language plpgsql security definer set search_path = '' as $$
declare
  m public.memos;
  n public.unidades;
  e public.empresas;
  c public.correlativos;
  yo text := public.mi_correo();
  anio_lima smallint := extract(year from now() at time zone 'America/Lima');
  problemas text;
  auto boolean;
begin
  select * into m from public.memos where id = mid for update;
  if not found or m.emisor_id <> auth.uid() or not public.persona_activa() then
    raise exception 'Solo quien emite envía su memo.';
  end if;
  if m.estado not in ('borrador', 'observado') then
    raise exception 'El memo está %: ya se envió.', m.estado;
  end if;
  if not (public.es_miembro(m.unidad_id) or public.es_aprobador(m.unidad_id) or public.es_admin()) then
    raise exception 'No emites memos en esa área.';
  end if;

  select string_agg(r.mensaje, ' · ') into problemas
    from public.revisar_memo(mid) r where r.nivel = 'error';
  if problemas is not null then
    raise exception 'Falta para enviar: %', problemas;
  end if;

  select * into n from public.unidades where id = m.unidad_id;
  select * into e from public.empresas where id = m.empresa_id;
  perform set_config('memos.transicion', 'si', true);

  if m.numero is null then
    insert into public.correlativos (unidad_id, anio) values (m.unidad_id, anio_lima)
      on conflict do nothing;
    select * into c from public.correlativos
     where unidad_id = m.unidad_id and anio = anio_lima for update;
    update public.correlativos set ultimo = c.ultimo + 1
     where unidad_id = m.unidad_id and anio = anio_lima;
    m.anio := anio_lima;
    m.numero := c.ultimo + 1;
    m.numero_visible := lpad(m.numero::text, 3, '0') || '-' || anio_lima || '-' || n.codigo;
    m.id_tecnico := e.codigo || '|' || m.numero_visible;
    m.emitido_en := now();
  end if;

  -- Emite el jefe o el suplente, o el área no exige aprobación: aprobado por emisión.
  auto := not n.requiere_aprobacion or public.es_aprobador(m.unidad_id);
  perform set_config('memos.evento', case when m.version = 0 then 'emitido' else 'corregido' end, true);
  perform set_config('memos.detalle', jsonb_build_object('aprobado_por_emision', auto)::text, true);

  update public.memos set
    anio = m.anio, numero = m.numero, numero_visible = m.numero_visible,
    id_tecnico = m.id_tecnico, emitido_en = m.emitido_en,
    version = m.version + 1,
    total = coalesce((select sum(x.monto) from public.lineas_pago x where x.memo_id = mid), 0),
    moneda = coalesce((select min(x.moneda) from public.lineas_pago x where x.memo_id = mid), m.moneda),
    estado = case when auto then 'aprobado'::public.estado_memo else 'pendiente'::public.estado_memo end,
    aprobado_por = case when auto then auth.uid() end,
    aprobado_en = case when auto then now() end,
    codigo_sello = case when auto then public.nuevo_sello() end
  where id = mid
  returning * into m;
  return m;
end $$;

-- «7F3A-91C2»: el código del sello que se imprime en el PDF aprobado.
create function public.nuevo_sello() returns text
language sql volatile set search_path = '' as $$
  select upper(substr(h, 1, 4) || '-' || substr(h, 5, 4))
    from (select md5(gen_random_uuid()::text || clock_timestamp()::text) as h) x
$$;

create function public.aprobar_memo(mid uuid) returns public.memos
language plpgsql security definer set search_path = '' as $$
declare
  m public.memos;
begin
  select * into m from public.memos where id = mid for update;
  if not found or not public.persona_activa()
     or not (public.es_aprobador(m.unidad_id) or public.es_admin()) then
    raise exception 'Aprueban el jefe o el suplente del área.';
  end if;
  if m.emisor_id = auth.uid() then
    raise exception 'Nadie aprueba su propio memo.';
  end if;
  if m.estado <> 'pendiente' then
    raise exception 'El memo está %: no espera aprobación.', m.estado;
  end if;
  perform set_config('memos.transicion', 'si', true);
  perform set_config('memos.evento', 'aprobado', true);
  perform set_config('memos.detalle', '{}', true);
  update public.memos
     set estado = 'aprobado', aprobado_por = auth.uid(), aprobado_en = now(),
         codigo_sello = public.nuevo_sello(), ultima_observacion = ''
   where id = mid returning * into m;
  return m;
end $$;

create function public.observar_memo(mid uuid, comentario text) returns public.memos
language plpgsql security definer set search_path = '' as $$
declare
  m public.memos;
begin
  select * into m from public.memos where id = mid for update;
  if not found or not public.persona_activa()
     or not (public.es_aprobador(m.unidad_id) or public.es_admin()) then
    raise exception 'Observan el jefe o el suplente del área.';
  end if;
  if m.estado <> 'pendiente' then
    raise exception 'El memo está %: no espera aprobación.', m.estado;
  end if;
  if length(btrim(coalesce(comentario, ''))) < 5 then
    raise exception 'Escribe qué hay que corregir (al menos 5 letras).';
  end if;
  perform set_config('memos.transicion', 'si', true);
  perform set_config('memos.evento', 'observado', true);
  perform set_config('memos.detalle', jsonb_build_object('comentario', btrim(comentario))::text, true);
  update public.memos set estado = 'observado', ultima_observacion = btrim(comentario)
   where id = mid returning * into m;
  return m;
end $$;

-- Anular conserva el número: no vuelve a usarse. Quien emite anula lo suyo
-- mientras no esté aprobado; el jefe, el suplente o administración, en
-- cualquier momento, salvo que el pago ya esté registrado o más allá.
create function public.anular_memo(mid uuid, motivo text) returns public.memos
language plpgsql security definer set search_path = '' as $$
declare
  m public.memos;
begin
  select * into m from public.memos where id = mid for update;
  if not found or not public.persona_activa() then
    raise exception 'No existe ese memo.';
  end if;
  if m.estado = 'anulado' then
    raise exception 'El memo ya está anulado.';
  end if;
  if not (public.es_admin() or public.es_aprobador(m.unidad_id)
          or (m.emisor_id = auth.uid() and m.estado in ('borrador', 'pendiente', 'observado'))) then
    raise exception 'No puedes anular este memo.';
  end if;
  if m.estado_pago in ('registrado', 'programado', 'pagado') then
    raise exception 'El pago ya está %: el memo no se anula.', m.estado_pago;
  end if;
  if length(btrim(coalesce(motivo, ''))) < 5 then
    raise exception 'Escribe el motivo (al menos 5 letras).';
  end if;
  perform set_config('memos.transicion', 'si', true);
  perform set_config('memos.evento', 'anulado', true);
  perform set_config('memos.detalle', jsonb_build_object('motivo', btrim(motivo))::text, true);
  update public.memos set estado = 'anulado', motivo_anulacion = btrim(motivo)
   where id = mid returning * into m;
  return m;
end $$;

-- El cargo lo da solo el destinatario principal, con una valoración opcional.
create function public.dar_cargo(mid uuid, puntaje smallint default null, comentario text default '')
returns public.memos
language plpgsql security definer set search_path = '' as $$
declare
  m public.memos;
begin
  select * into m from public.memos where id = mid for update;
  if not found or not public.persona_activa() or m.destinatario_correo <> public.mi_correo() then
    raise exception 'El cargo lo da el destinatario principal.';
  end if;
  if m.estado not in ('aprobado', 'enviado') then
    raise exception 'El memo está %: no espera cargo.', m.estado;
  end if;
  perform set_config('memos.transicion', 'si', true);
  perform set_config('memos.evento', 'recibido', true);
  perform set_config('memos.detalle',
    jsonb_build_object('valoracion', puntaje, 'comentario', btrim(coalesce(comentario, '')),
                       'minutos', round(extract(epoch from now() - coalesce(m.enviado_en, m.aprobado_en)) / 60))::text, true);
  update public.memos set estado = 'recibido', recibido_en = now(), valoracion = puntaje
   where id = mid returning * into m;
  return m;
end $$;

-- ---------------------------------------------------------------------------
-- El puente con las rendiciones. Una rendición aprobada se convierte en el
-- memo que pide su pago, ya armado:
--   · caja chica  → RR-CCH, reposición al administrador de la caja por lo gastado
--   · viáticos    → RR-VIA, reembolso a quien viajó si gastó más de lo recibido
-- Queda en borrador: quien emite revisa, elige el área y lo envía.
-- ---------------------------------------------------------------------------

create function public.memo_desde_rendicion(rid uuid, unidad smallint) returns public.memos
language plpgsql security definer set search_path = '' as $$
declare
  r public.rendiciones;
  p public.personas;
  gastado numeric(14, 2);
  pagar numeric(14, 2);
  tipo text;
  m public.memos;
  titulo text;
begin
  if not public.es_admin() then
    raise exception 'El memo de una rendición lo arma administración.';
  end if;
  select * into r from public.rendiciones where id = rid;
  if not found or r.estado <> 'aprobada' then
    raise exception 'Solo una rendición aprobada pide su pago.';
  end if;
  if exists (select 1 from public.memos x where x.rendicion_id = rid and x.estado <> 'anulado') then
    raise exception 'Esa rendición ya tiene su memo.';
  end if;
  select * into p from public.personas where id = r.responsable_id;
  select coalesce(sum(c.total), 0) into gastado
    from public.comprobantes c
   where c.rendicion_id = rid and not c.descartado and c.moneda = 'PEN';

  if r.tipo = 'caja' then
    tipo := 'RR-CCH';
    pagar := gastado;
    titulo := format('Reposición de caja chica %s · reposición %s',
                     (select k.numero from public.cajas k where k.id = r.caja_id), r.correlativo);
  else
    tipo := 'RR-VIA';
    pagar := gastado - r.monto;
    titulo := format('Reembolso de viáticos · memo %s', r.numero_memo);
    if pagar <= 0 then
      raise exception 'No hay pago que pedir: % devuelve S/ % a la empresa.',
        coalesce(nullif(p.nombre, ''), p.correo), to_char(-pagar, 'FM999,999,990.00');
    end if;
  end if;
  if pagar <= 0 then
    raise exception 'La rendición no tiene gastos en soles para reponer.';
  end if;

  insert into public.memos (unidad_id, tipo_codigo, asunto, cuerpo, rendicion_id)
  values (unidad, tipo, titulo,
          format('Me dirijo a usted a fin de solicitar el pago de S/ %s a %s por %s, según la rendición aprobada y sus comprobantes.'
                 || E'\n\nSu despacho servirá para disponer el pago correspondiente.',
                 to_char(pagar, 'FM999,999,990.00'), coalesce(nullif(p.nombre, ''), p.correo), lower(titulo)),
          rid)
  returning * into m;

  insert into public.lineas_pago (memo_id, orden, empresa_pagadora_id, beneficiario_doc, beneficiario,
                                  monto, moneda, observaciones)
  values (m.id, 1, r.empresa_id, coalesce(p.dni, ''), coalesce(nullif(p.nombre, ''), p.correo),
          pagar, 'PEN', left(titulo, 300));
  return m;
end $$;

-- Directorio para elegir destinatario: nombre y correo de las personas
-- activas, nada más.
create function public.directorio()
returns table (correo text, nombre text)
language sql stable security definer set search_path = '' as $$
  select p.correo, p.nombre from public.personas p
   where p.activo and public.persona_activa()
   order by coalesce(nullif(p.nombre, ''), p.correo)
$$;

-- ---------------------------------------------------------------------------
-- Permisos por fila
-- ---------------------------------------------------------------------------

alter table public.unidades enable row level security;
alter table public.usuarios_memo enable row level security;
alter table public.miembros_unidad enable row level security;
alter table public.interarea enable row level security;
alter table public.tipos_memo enable row level security;
alter table public.sustentos_tipo enable row level security;
alter table public.parametros_memo enable row level security;
alter table public.correlativos enable row level security;
alter table public.memos enable row level security;
alter table public.lineas_pago enable row level security;
alter table public.memo_eventos enable row level security;

-- Catálogos: los lee quien tenga sesión; los escribe administración.
do $$
declare
  t text;
begin
  foreach t in array array['unidades', 'tipos_memo', 'sustentos_tipo', 'parametros_memo', 'correlativos'] loop
    execute format('create policy leer on public.%I for select to authenticated using ((select public.persona_activa()))', t);
    execute format('create policy crear on public.%I for insert to authenticated with check ((select public.es_admin()))', t);
    execute format('create policy cambiar on public.%I for update to authenticated using ((select public.es_admin())) with check ((select public.es_admin()))', t);
  end loop;
  -- Permisos de las personas: cada una ve los suyos; administración, todos.
  foreach t in array array['usuarios_memo', 'miembros_unidad', 'interarea'] loop
    execute format('create policy leer on public.%I for select to authenticated using (correo = (select public.mi_correo()) or (select public.es_admin()))', t);
    execute format('create policy crear on public.%I for insert to authenticated with check ((select public.es_admin()))', t);
    execute format('create policy cambiar on public.%I for update to authenticated using ((select public.es_admin())) with check ((select public.es_admin()))', t);
  end loop;
end $$;

-- Quitar a alguien de un área sí se borra: es un permiso, no un documento.
create policy quitar on public.miembros_unidad for delete to authenticated using ((select public.es_admin()));
create policy quitar on public.interarea for delete to authenticated using ((select public.es_admin()));

-- Las áreas de quien consulta, en arreglos. Dentro de (select …) Postgres los
-- calcula UNA vez por consulta y no una vez por memo: la lección de la base
-- vieja de INROCONTA, donde una política que llamaba funciones por fila dejó
-- a cpe_comprobante sin responder. Misma regla que puede_ver_memo().
create function public.unidades_que_apruebo() returns smallint[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(n.id), '{}') from public.unidades n
   where public.mi_correo() in (n.jefe_correo, n.suplente_correo)
$$;

create function public.unidades_donde_emito() returns smallint[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(m.unidad_id), '{}') from public.miembros_unidad m
    join public.usuarios_memo x on x.correo = m.correo and x.activo
   where m.correo = public.mi_correo()
$$;

-- Interárea: todas las unidades si tiene interarea_todas.
create function public.unidades_interarea() returns smallint[]
language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from public.usuarios_memo x where x.correo = public.mi_correo() and x.activo and x.interarea_todas)
      then (select coalesce(array_agg(n.id), '{}') from public.unidades n)
    else (select coalesce(array_agg(i.unidad_id), '{}') from public.interarea i
            join public.usuarios_memo x on x.correo = i.correo and x.activo
           where i.correo = public.mi_correo())
  end
$$;

create policy leer on public.memos for select to authenticated
  using (
    (select public.persona_activa()) and (
      (select public.es_admin())
      or emisor_id = (select auth.uid())
      or (estado <> 'borrador' and (
            destinatario_correo = (select public.mi_correo())
            or (select public.mi_correo()) = any (copias)
            or unidad_id = any ((select public.unidades_que_apruebo())::smallint[])
            or (confidencialidad <> 'confidencial' and unidad_id = any ((select public.unidades_donde_emito())::smallint[]))
            or (confidencialidad = 'normal' and unidad_id = any ((select public.unidades_interarea())::smallint[]))))));
-- Un borrador se crea en una unidad donde se emite.
create policy crear on public.memos for insert to authenticated
  with check (
    emisor_id = (select auth.uid()) and (select public.persona_activa())
    and (public.es_miembro(unidad_id) or public.es_aprobador(unidad_id) or (select public.es_admin())));
create policy cambiar on public.memos for update to authenticated
  using (emisor_id = (select auth.uid()) and (select public.persona_activa()))
  with check (emisor_id = (select auth.uid())
    and (public.es_miembro(unidad_id) or public.es_aprobador(unidad_id) or (select public.es_admin())));

create function public.puede_ver_memo_id(mid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memos m
     where m.id = mid
       and public.puede_ver_memo(m.unidad_id, m.emisor_id, m.destinatario_correo, m.copias, m.confidencialidad, m.estado))
$$;

create function public.puede_editar_memo(mid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memos m
     where m.id = mid and m.emisor_id = auth.uid() and m.estado in ('borrador', 'observado')
       and public.persona_activa())
$$;

-- Las líneas de un memo restringido o confidencial llevan personas: las ven
-- los participantes, el jefe y administración, no el resto de la unidad.
create policy leer on public.lineas_pago for select to authenticated
  using (exists (
    select 1 from public.memos m
     where m.id = memo_id
       and public.puede_ver_memo(m.unidad_id, m.emisor_id, m.destinatario_correo, m.copias, m.confidencialidad, m.estado)
       and (m.confidencialidad = 'normal' or m.emisor_id = (select auth.uid())
            or m.destinatario_correo = (select public.mi_correo())
            or public.es_aprobador(m.unidad_id) or (select public.es_admin()))));
create policy crear on public.lineas_pago for insert to authenticated
  with check (public.puede_editar_memo(memo_id));
create policy cambiar on public.lineas_pago for update to authenticated
  using (public.puede_editar_memo(memo_id)) with check (public.puede_editar_memo(memo_id));
create policy quitar on public.lineas_pago for delete to authenticated
  using (public.puede_editar_memo(memo_id));

create policy leer on public.memo_eventos for select to authenticated
  using (public.puede_ver_memo_id(memo_id));

-- ---------------------------------------------------------------------------
-- Privilegios
-- ---------------------------------------------------------------------------

revoke all on public.unidades, public.usuarios_memo, public.miembros_unidad, public.interarea,
  public.tipos_memo, public.sustentos_tipo, public.parametros_memo, public.correlativos,
  public.memos, public.lineas_pago, public.memo_eventos from anon, authenticated;

grant select on public.unidades, public.usuarios_memo, public.miembros_unidad, public.interarea,
  public.tipos_memo, public.sustentos_tipo, public.parametros_memo, public.correlativos,
  public.memos, public.lineas_pago, public.memo_eventos to authenticated;
grant insert, update on public.unidades, public.usuarios_memo, public.miembros_unidad, public.interarea,
  public.tipos_memo, public.sustentos_tipo, public.parametros_memo, public.correlativos,
  public.memos, public.lineas_pago to authenticated;
grant delete on public.miembros_unidad, public.interarea, public.lineas_pago to authenticated;
grant all on public.unidades, public.usuarios_memo, public.miembros_unidad, public.interarea,
  public.tipos_memo, public.sustentos_tipo, public.parametros_memo, public.correlativos,
  public.memos, public.lineas_pago, public.memo_eventos to service_role;

-- Las columnas nuevas de empresas y personas siguen las reglas de su tabla.

revoke all on function public.ruc_valido(text), public.mi_correo(), public.es_miembro(smallint),
  public.es_aprobador(smallint), public.ve_interarea(smallint), public.ve_kpis(),
  public.puede_ver_memo(smallint, uuid, text, text[], public.confidencialidad, public.estado_memo),
  public.puede_ver_memo_id(uuid), public.puede_editar_memo(uuid), public.en_transicion(),
  public.revisar_memo(uuid), public.emitir_memo(uuid), public.nuevo_sello(),
  public.aprobar_memo(uuid), public.observar_memo(uuid, text), public.anular_memo(uuid, text),
  public.dar_cargo(uuid, smallint, text), public.memo_desde_rendicion(uuid, smallint),
  public.directorio(), public.memo_al_guardar(), public.memo_evento_de_estado(),
  public.linea_al_guardar(), public.correlativo_solo_sube(),
  public.unidades_que_apruebo(), public.unidades_donde_emito(), public.unidades_interarea()
  from public, anon, authenticated;

grant execute on function public.ruc_valido(text), public.mi_correo(), public.es_miembro(smallint),
  public.es_aprobador(smallint), public.ve_interarea(smallint), public.ve_kpis(),
  public.puede_ver_memo(smallint, uuid, text, text[], public.confidencialidad, public.estado_memo),
  public.puede_ver_memo_id(uuid), public.puede_editar_memo(uuid), public.en_transicion(),
  public.revisar_memo(uuid), public.emitir_memo(uuid), public.aprobar_memo(uuid),
  public.observar_memo(uuid, text), public.anular_memo(uuid, text),
  public.dar_cargo(uuid, smallint, text), public.memo_desde_rendicion(uuid, smallint),
  public.directorio(), public.unidades_que_apruebo(), public.unidades_donde_emito(),
  public.unidades_interarea() to authenticated;
grant execute on function public.nuevo_sello() to service_role;
