-- InroScan · lo que se trae de INROCONTA
--
-- INROCONTA (el sistema de Contabilidad) es el dueño de lo que viene de
-- SUNAT: el padrón de RUC, la lista SSCO (sujetos sin capacidad operativa) y
-- el registro de compras (SIRE) con las OC y los centros de costo de cada
-- factura, y si ya está en CONCAR. Lo expone a otras apps por
-- /api/apps/<app>/datos/<padron|ssco|sire>, con un token por app.
--
-- InroScan guarda una COPIA LOCAL de eso, que la función «inroconta» refresca
-- (a mano o una vez al día). Así cada revisión de un memo es una consulta a la
-- propia base, inmediata, y no depende de que INROCONTA responda en ese
-- momento. Nadie la escribe desde la app: solo la función, con la llave del
-- sistema.

-- ---------------------------------------------------------------------------
-- Contribuyentes: el padrón de los RUC con los que trabaja el grupo, más la
-- marca SSCO. Son datos públicos de SUNAT: los lee cualquiera con sesión.
-- ---------------------------------------------------------------------------

create table public.contribuyentes (
  ruc text primary key check (ruc ~ '^[0-9]{11}$'),
  razon_social text,
  estado text,
  condicion text,
  tipo_contribuyente text,
  buen_contribuyente boolean,
  agente_retencion boolean,
  -- En la lista SSCO de SUNAT: no se le paga.
  ssco boolean not null default false,
  ssco_resolucion text,
  ssco_desde date,
  actualizado_en timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Registro de compras (SIRE) de INROPRIN: qué facturas existen en SUNAT, con
-- sus OC, centros de costo y si ya están en CONCAR. Es información contable:
-- solo administración la lee directo; los memos la consultan por
-- revisar_memo(), que dice solo lo necesario.
-- ---------------------------------------------------------------------------

create table public.sire_comprobantes (
  proveedor_ruc text not null check (proveedor_ruc ~ '^[0-9]{11}$'),
  -- Tipo SUNAT: 01 factura, 03 boleta, 07 nota de crédito, 08 nota de débito…
  tipo text not null,
  serie text not null,
  numero text not null,
  -- La misma normalización que lineas_pago.clave: F001-599 = F001-00000599.
  clave text generated always as (
    regexp_replace(upper(regexp_replace(serie, '[^A-Za-z0-9]', '', 'g')), '^0+(?=.)', '') || '-' ||
    regexp_replace(upper(regexp_replace(numero, '[^A-Za-z0-9]', '', 'g')), '^0+(?=.)', '')
  ) stored,
  periodo integer,
  proveedor_nombre text,
  fecha_emision date,
  moneda text,
  total numeric(14, 2),
  estado text,
  oc text[] not null default '{}',
  centro_costo text[] not null default '{}',
  en_concar boolean not null default false,
  actualizado_en timestamptz not null default now(),
  primary key (proveedor_ruc, tipo, serie, numero)
);

create index sire_por_clave on public.sire_comprobantes (proveedor_ruc, clave);

-- ---------------------------------------------------------------------------
-- Corridas: una fila por cada vez que una función del sistema trabaja (la
-- copia de INROCONTA hoy; la de Drive y la lectura, después). Es lo que el
-- panel de Salud muestra: cuándo corrió, si salió bien y cuánto trajo.
-- ---------------------------------------------------------------------------

create table public.corridas (
  id bigint generated always as identity primary key,
  job text not null,
  iniciada_en timestamptz not null default now(),
  terminada_en timestamptz,
  resultado text check (resultado in ('OK', 'PARCIAL', 'ERROR')),
  filas integer,
  resumen jsonb not null default '{}',
  error text
);

create index corridas_job on public.corridas (job, iniciada_en desc);

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------

alter table public.contribuyentes enable row level security;
alter table public.sire_comprobantes enable row level security;
alter table public.corridas enable row level security;

create policy leer on public.contribuyentes for select to authenticated
  using ((select public.persona_activa()));
create policy leer on public.sire_comprobantes for select to authenticated
  using ((select public.es_admin()));
create policy leer on public.corridas for select to authenticated
  using ((select public.es_admin()));

revoke all on public.contribuyentes, public.sire_comprobantes, public.corridas from anon, authenticated;
grant select on public.contribuyentes, public.sire_comprobantes, public.corridas to authenticated;
grant all on public.contribuyentes, public.sire_comprobantes, public.corridas to service_role;

-- ---------------------------------------------------------------------------
-- La lista SSCO entera, de una vez: marca a los que están y desmarca a los que
-- salieron, en una sola transacción. Una lista vacía casi seguro es una falla
-- de la lectura, no que SUNAT la haya vaciado: se rechaza en vez de desmarcar
-- a todos.
-- ---------------------------------------------------------------------------

create function public.cargar_ssco(filas jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  n integer := jsonb_array_length(filas);
begin
  if n = 0 then
    raise exception 'La lista SSCO llegó vacía: no se cambia nada.';
  end if;
  insert into public.contribuyentes (ruc, razon_social, ssco, ssco_resolucion, ssco_desde, actualizado_en)
  select f ->> 'ruc', f ->> 'razon_social', true, f ->> 'ssco_resolucion', (f ->> 'ssco_desde')::date, now()
    from jsonb_array_elements(filas) f
   where f ->> 'ruc' ~ '^[0-9]{11}$'
  on conflict (ruc) do update set
    ssco = true,
    ssco_resolucion = excluded.ssco_resolucion,
    ssco_desde = excluded.ssco_desde,
    razon_social = coalesce(public.contribuyentes.razon_social, excluded.razon_social),
    actualizado_en = now();
  update public.contribuyentes c set ssco = false, ssco_resolucion = null, ssco_desde = null, actualizado_en = now()
   where c.ssco and not exists (select 1 from jsonb_array_elements(filas) f where f ->> 'ruc' = c.ruc);
  return n;
end $$;

revoke all on function public.cargar_ssco(jsonb) from public, anon, authenticated;
grant execute on function public.cargar_ssco(jsonb) to service_role;
