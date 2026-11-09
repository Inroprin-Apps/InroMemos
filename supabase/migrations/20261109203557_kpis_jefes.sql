-- KPIs para las jefaturas (comentarios de Finanzas, 9-nov-2026), en tres
-- familias y una mirada de afuera:
--
--   · Calidad de respuesta: cuánto sale bien a la primera (observaciones,
--     anulaciones, devoluciones de Análisis).
--   · Tiempos de ejecución: cuánto tarda cada paso (aprobar, dar cargo,
--     pagar) y cuánto tarda la plataforma en lo suyo (avisar por correo).
--   · Acogida: cada acción se puede valorar al momento (1 a 5, con caritas) y
--     un comentario opcional.
--   · Auditoría externa: un agente de afuera revisa y deja su informe; la
--     plataforma solo lo muestra (no se califica a sí misma).
--
-- Los ve quien aprueba en algún área (solo sus áreas), administración y quien
-- tenga «Ver KPIs» (todo).

-- ---------------------------------------------------------------------------
-- 1. Valoraciones de cada acción
-- ---------------------------------------------------------------------------

create table public.valoraciones (
  id bigint generated always as identity primary key,
  persona_id uuid not null default auth.uid() references public.personas (id),
  accion text not null check (accion in ('emitir', 'aprobar', 'observar', 'anular', 'dar_cargo', 'rendir', 'otro')),
  puntaje smallint not null check (puntaje between 1 and 5),
  comentario text not null default '' check (length(comentario) <= 500),
  memo_id uuid references public.memos (id) on delete set null,
  rendicion_id uuid references public.rendiciones (id) on delete set null,
  -- El área del memo, para que cada jefatura vea la acogida de lo suyo.
  unidad_id smallint references public.unidades (id),
  en timestamptz not null default now()
);

create index valoraciones_en on public.valoraciones (en);

create function public.valoracion_al_crear() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.persona_id := auth.uid();
  new.en := now();
  new.comentario := btrim(new.comentario);
  new.unidad_id := (select m.unidad_id from public.memos m where m.id = new.memo_id);
  -- Una valoración por persona, acción y memo (o rendición): la segunda la reemplaza.
  delete from public.valoraciones v
   where v.persona_id = new.persona_id and v.accion = new.accion
     and v.memo_id is not distinct from new.memo_id and v.rendicion_id is not distinct from new.rendicion_id;
  return new;
end $$;

create trigger valoracion_al_crear
  before insert on public.valoraciones
  for each row execute function public.valoracion_al_crear();

alter table public.valoraciones enable row level security;
create policy crear on public.valoraciones for insert to authenticated
  with check (persona_id = auth.uid() and public.persona_activa());
create policy leer on public.valoraciones for select to authenticated
  using (persona_id = auth.uid() or public.es_admin());
revoke all on public.valoraciones from anon, authenticated;
grant select, insert on public.valoraciones to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Auditoría externa: la escribe el sistema (un agente de afuera, con la
--    llave de servicio); nadie con sesión la escribe ni la borra.
-- ---------------------------------------------------------------------------

create table public.auditorias (
  id bigint generated always as identity primary key,
  en timestamptz not null default now(),
  auditor text not null,
  periodo_desde date,
  periodo_hasta date,
  nivel text not null check (nivel in ('ok', 'observaciones', 'critico')),
  resumen text not null,
  hallazgos jsonb not null default '[]'
);

alter table public.auditorias enable row level security;
revoke all on public.auditorias from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Quién ve los KPIs, y de qué áreas
-- ---------------------------------------------------------------------------

create function public.ve_kpis_de_jefe() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.ve_kpis() or cardinality(public.unidades_que_apruebo()) > 0
$$;

create or replace function public.kpis_memos(desde date, hasta date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  par public.parametros_memo;
  todas boolean := public.ve_kpis();
  mias smallint[] := public.unidades_que_apruebo();
  inicio timestamptz := desde::timestamp at time zone 'America/Lima';
  fin timestamptz := (hasta + 1)::timestamp at time zone 'America/Lima';
  r jsonb;
begin
  if not (todas or cardinality(mias) > 0) then
    raise exception 'Los indicadores son para las jefaturas de área (y quien tenga «Ver KPIs»).';
  end if;
  select * into par from public.parametros_memo;
  with base as (
    select m.*,
           (select count(*) from public.memo_eventos e where e.memo_id = m.id and e.tipo = 'observado') as observaciones,
           exists (select 1 from public.memo_eventos e where e.memo_id = m.id and e.tipo = 'pago'
                    and e.detalle ->> 'despues' = 'observado_analisis') as devuelto_analisis,
           (select (e.detalle ->> 'aprobado_por_emision')::boolean from public.memo_eventos e
             where e.memo_id = m.id and e.tipo = 'emitido' order by e.en desc limit 1) as auto,
           (select min(e.en) from public.memo_eventos e where e.memo_id = m.id and e.tipo = 'pago'
             and e.detalle ->> 'despues' = 'pagado') as pagado_en
      from public.memos m
     where m.emitido_en >= inicio and m.emitido_en < fin
       and (todas or m.unidad_id = any (mias))),
  aprob as (
    select extract(epoch from aprobado_en - emitido_en) / 3600 as horas
      from base where aprobado_en is not null and not coalesce(auto, false)),
  cargo as (
    select extract(epoch from recibido_en - coalesce(enviado_en, aprobado_en)) / 3600 as horas
      from base where recibido_en is not null),
  pago as (
    select extract(epoch from pagado_en - aprobado_en) / 3600 as horas
      from base where pagado_en is not null and aprobado_en is not null),
  correo as (
    select extract(epoch from a.enviado_en - a.creado_en) / 60 as minutos, a.estado
      from public.avisos a join base b on b.id = a.memo_id
     where a.creado_en >= inicio and a.creado_en < fin),
  val as (
    select v.* from public.valoraciones v
     where v.en >= inicio and v.en < fin
       and (todas or v.unidad_id = any (mias)))
  select jsonb_build_object(
    'alcance', case when todas then 'todas'
                    else (select string_agg(u.nombre, ', ' order by u.nombre) from public.unidades u where u.id = any (mias)) end,
    'emitidos', (select count(*) from base),
    'anulados', (select count(*) from base where estado = 'anulado'),
    'pendientes', (select count(*) from base where estado = 'pendiente'),
    -- Calidad
    'observados_alguna_vez', (select count(*) from base where observaciones > 0),
    'observaciones', (select coalesce(sum(observaciones), 0) from base),
    'devueltos_analisis', (select count(*) from base where devuelto_analisis),
    'a_la_primera_pct', (select round(100.0 * count(*) filter (where observaciones = 0 and not devuelto_analisis) / nullif(count(*), 0), 1)
                           from base where aprobado_en is not null),
    -- Tiempos
    'horas_aprobacion', (select round(avg(horas)::numeric, 1) from aprob),
    'horas_aprobacion_mediana', (select round((percentile_cont(0.5) within group (order by horas))::numeric, 1) from aprob),
    'horas_cargo', (select round(avg(horas)::numeric, 1) from cargo),
    'cargo_en_meta_pct', (select round(100.0 * count(*) filter (where horas <= par.meta_atencion_horas) / nullif(count(*), 0), 1) from cargo),
    'meta_horas', par.meta_atencion_horas,
    'horas_pago_mediana', (select round((percentile_cont(0.5) within group (order by horas))::numeric, 1) from pago),
    'pagados', (select count(*) from base where estado_pago = 'pagado'),
    'correo_minutos_mediana', (select round((percentile_cont(0.5) within group (order by minutos))::numeric, 1) from correo where minutos is not null),
    'correos', (select count(*) from correo),
    'correos_con_error', (select count(*) from correo where estado = 'error'),
    -- Acogida
    'acogida', (select round(avg(puntaje)::numeric, 2) from val),
    'acogida_n', (select count(*) from val),
    'acogida_dist', (select coalesce(jsonb_object_agg(p, n), '{}') from (select puntaje as p, count(*) as n from val group by puntaje) x),
    'acogida_por_accion', (select coalesce(jsonb_agg(x order by x.n desc), '[]') from
                            (select accion, count(*) as n, round(avg(puntaje)::numeric, 2) as promedio from val group by accion) x),
    'comentarios', (select coalesce(jsonb_agg(x order by x.en desc), '[]') from
                     (select accion, puntaje, comentario, en from val where comentario <> '' order by en desc limit 8) x),
    'valoracion', (select round(avg(valoracion)::numeric, 2) from base where valoracion is not null),
    'valoraciones', (select coalesce(jsonb_object_agg(v, n), '{}') from
                      (select valoracion as v, count(*) as n from base where valoracion is not null group by valoracion) x),
    'monto_pen', (select coalesce(sum(total), 0) from base where requiere_pago and moneda = 'PEN' and estado <> 'anulado'),
    'por_area', (select coalesce(jsonb_agg(x order by x.emitidos desc), '[]') from (
                   select u.nombre as area, e.codigo as empresa, count(*) as emitidos,
                          count(*) filter (where b.estado = 'pendiente') as pendientes,
                          count(*) filter (where b.observaciones > 0) as observados,
                          coalesce(sum(b.total) filter (where b.requiere_pago and b.moneda = 'PEN' and b.estado <> 'anulado'), 0) as monto
                     from base b join public.unidades u on u.id = b.unidad_id join public.empresas e on e.id = u.empresa_id
                    group by u.nombre, e.codigo) x),
    'por_semana', (select coalesce(jsonb_agg(x order by x.semana), '[]') from (
                     select to_char(date_trunc('week', emitido_en at time zone 'America/Lima'), 'YYYY-MM-DD') as semana,
                            count(*) as emitidos
                       from base group by 1) x),
    -- Auditoría externa: el último informe (es de toda la plataforma).
    'auditoria', (select to_jsonb(a) - 'hallazgos' || jsonb_build_object('hallazgos', jsonb_array_length(a.hallazgos))
                    from public.auditorias a order by a.en desc limit 1)
  ) into r;
  return r;
end $$;

revoke all on function public.ve_kpis_de_jefe(), public.valoracion_al_crear() from public, anon, authenticated;
grant execute on function public.ve_kpis_de_jefe() to authenticated;
