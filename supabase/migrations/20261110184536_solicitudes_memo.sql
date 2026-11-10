-- Solicitar un memo (10-nov-2026). Cualquier persona de la empresa pide un
-- memo a un área (Finanzas, Administración, Control de Gestión…): la
-- solicitud llega a su jefatura. El memo lo sigue emitiendo el área (el canal
-- formal no cambia): quien emite en esa área, o su jefatura, la «atiende» y
-- nace el borrador ya llenado, con quien lo pidió en copia; o la jefatura la
-- rechaza con su motivo. Queda registro de quién pidió qué y cuándo.

create type public.estado_solicitud as enum ('pendiente', 'aceptada', 'rechazada', 'cancelada');

create table public.solicitudes_memo (
  id uuid primary key default gen_random_uuid(),
  solicitante_id uuid not null default auth.uid() references public.personas (id),
  solicitante_nombre text not null default '',
  unidad_id smallint not null references public.unidades (id),
  tipo_codigo text references public.tipos_memo (codigo),
  que text not null check (length(btrim(que)) between 5 and 1000),
  monto numeric(14, 2) check (monto is null or monto >= 0),
  moneda text not null default 'PEN' check (moneda in ('PEN', 'USD', 'EUR')),
  beneficiario text not null default '' check (length(beneficiario) <= 200),
  beneficiario_doc text not null default '' check (beneficiario_doc ~ '^[0-9A-Za-z-]{0,20}$'),
  viaje_desde date,
  viaje_hasta date,
  -- Desde dónde se pidió: el módulo de memos o el de rendiciones (viáticos).
  origen text not null default 'memos' check (origen in ('memos', 'rendiciones')),
  estado public.estado_solicitud not null default 'pendiente',
  motivo_rechazo text not null default '',
  memo_id uuid references public.memos (id) on delete set null,
  atendida_por uuid references public.personas (id),
  atendida_en timestamptz,
  creado_en timestamptz not null default now(),
  constraint viaje_en_orden check (viaje_desde is null or viaje_hasta is null or viaje_hasta >= viaje_desde)
);

create index solicitudes_unidad on public.solicitudes_memo (unidad_id, estado);
create index solicitudes_solicitante on public.solicitudes_memo (solicitante_id);

-- Lo que pone la base al crearla: quién la pide, cuándo y en qué estado.
create function public.solicitud_al_crear() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not public.persona_activa() then
    raise exception 'Tu cuenta no está habilitada.';
  end if;
  if not exists (select 1 from public.unidades u where u.id = new.unidad_id and u.activo) then
    raise exception 'Esa área no existe o está inactiva.';
  end if;
  if new.tipo_codigo is not null and not exists (select 1 from public.tipos_memo t where t.codigo = new.tipo_codigo and t.activo) then
    raise exception 'Ese tipo de memo no existe o está inactivo.';
  end if;
  new.solicitante_id := auth.uid();
  new.solicitante_nombre := coalesce((select coalesce(nullif(p.nombre, ''), p.correo) from public.personas p where p.id = auth.uid()), '');
  new.que := btrim(new.que);
  new.beneficiario := btrim(new.beneficiario);
  new.beneficiario_doc := upper(btrim(new.beneficiario_doc));
  new.estado := 'pendiente';
  new.motivo_rechazo := '';
  new.memo_id := null;
  new.atendida_por := null;
  new.atendida_en := null;
  new.creado_en := now();
  return new;
end $$;

create trigger solicitud_al_crear
  before insert on public.solicitudes_memo
  for each row execute function public.solicitud_al_crear();

-- Quién la ve: quien la pidió, la jefatura y quienes emiten en esa área, y administración.
alter table public.solicitudes_memo enable row level security;
create policy leer on public.solicitudes_memo for select to authenticated
  using (
    (select public.persona_activa()) and (
      solicitante_id = (select auth.uid())
      or unidad_id = any ((select public.unidades_que_apruebo())::smallint[])
      or unidad_id = any ((select public.unidades_donde_emito())::smallint[])
      or (select public.es_admin())));
create policy crear on public.solicitudes_memo for insert to authenticated
  with check (solicitante_id = (select auth.uid()));
revoke all on public.solicitudes_memo from anon, authenticated;
grant select, insert on public.solicitudes_memo to authenticated;

-- ---------------------------------------------------------------------------
-- Atender, rechazar, cancelar: solo por estas funciones.
-- ---------------------------------------------------------------------------

-- Atender: quien emite en el área (o su jefatura) crea el borrador, ya llenado
-- con lo pedido. Quien lo pidió va en copia: ve el memo y recibe sus avisos.
create function public.atender_solicitud(sid uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  s public.solicitudes_memo;
  m public.memos;
  t public.tipos_memo;
  correo text;
begin
  select * into s from public.solicitudes_memo where id = sid for update;
  if not found then
    raise exception 'No existe esa solicitud.';
  end if;
  if not (public.es_miembro(s.unidad_id) or public.es_aprobador(s.unidad_id) or public.es_admin()) then
    raise exception 'La atiende quien emite memos en esa área, o su jefatura.';
  end if;
  if s.estado <> 'pendiente' then
    raise exception 'La solicitud ya está %.', s.estado;
  end if;
  select p.correo into correo from public.personas p where p.id = s.solicitante_id;
  select * into t from public.tipos_memo where codigo = coalesce(s.tipo_codigo, 'IN-COM');

  insert into public.memos (unidad_id, tipo_codigo, asunto, cuerpo, copias)
  values (s.unidad_id, t.codigo, left(split_part(s.que, E'\n', 1), 140), '',
          case when correo is not null and correo <> public.mi_correo() then array[correo] else '{}' end)
  returning * into m;

  -- Si dijo a quién y cuánto, la línea de pago va hecha. Si algo no pasa las
  -- reglas (un RUC mal escrito…), el borrador queda igual y se completa a mano.
  if t.lleva_pago and s.monto is not null and s.beneficiario_doc <> '' then
    begin
      insert into public.lineas_pago (memo_id, orden, empresa_pagadora_id, beneficiario_doc, beneficiario, monto, moneda,
                                      viaje_desde, viaje_hasta, observaciones)
      values (m.id, 1, m.empresa_id, s.beneficiario_doc, s.beneficiario, s.monto, s.moneda,
              s.viaje_desde, s.viaje_hasta, left(s.que, 300));
    exception when others then
      null;
    end;
  end if;

  update public.solicitudes_memo
     set estado = 'aceptada', memo_id = m.id, atendida_por = auth.uid(), atendida_en = now()
   where id = sid;
  return m.id;
end $$;

-- Rechazar: la jefatura del área (o administración), con su motivo.
create function public.rechazar_solicitud(sid uuid, motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s public.solicitudes_memo;
begin
  select * into s from public.solicitudes_memo where id = sid for update;
  if not found then
    raise exception 'No existe esa solicitud.';
  end if;
  if not (public.es_aprobador(s.unidad_id) or public.es_admin()) then
    raise exception 'Una solicitud la rechaza la jefatura del área.';
  end if;
  if s.estado <> 'pendiente' then
    raise exception 'La solicitud ya está %.', s.estado;
  end if;
  if length(btrim(coalesce(motivo, ''))) < 5 then
    raise exception 'Escribe por qué se rechaza (al menos 5 letras).';
  end if;
  update public.solicitudes_memo
     set estado = 'rechazada', motivo_rechazo = btrim(motivo), atendida_por = auth.uid(), atendida_en = now()
   where id = sid;
end $$;

-- Cancelar: quien la pidió, mientras nadie la atendió.
create function public.cancelar_solicitud(sid uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.solicitudes_memo set estado = 'cancelada', atendida_en = now()
   where id = sid and solicitante_id = auth.uid() and estado = 'pendiente';
  if not found then
    raise exception 'Solo quien la pidió la cancela, y mientras esté pendiente.';
  end if;
end $$;

revoke all on function public.solicitud_al_crear(), public.atender_solicitud(uuid),
  public.rechazar_solicitud(uuid, text), public.cancelar_solicitud(uuid) from public, anon, authenticated;
grant execute on function public.atender_solicitud(uuid), public.rechazar_solicitud(uuid, text),
  public.cancelar_solicitud(uuid) to authenticated;
