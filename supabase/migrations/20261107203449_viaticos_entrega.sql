-- Viáticos en dos momentos, como se trabaja hoy con los memos de Word:
--
--   · ANTES del viaje, la jefatura pide el dinero: «Entrega de viáticos (a
--     rendir)», RR-EVI, una línea por persona con las fechas del viaje.
--   · DESPUÉS, la rendición con los comprobantes, una por persona. La hace
--     quien recibió el dinero si tiene cuenta en InroScan (se la reconoce por
--     su DNI); si no la tiene (personal de campo), la jefatura que emitió el
--     memo, a nombre de esa persona.
--   · Si gastó más de lo recibido, el memo de reembolso (RR-VIA, ahora
--     «Reembolso de viáticos») paga a la persona que viajó, no a quien rindió.

-- ---------------------------------------------------------------------------
-- 1. Los tipos
-- ---------------------------------------------------------------------------

insert into public.tipos_memo (codigo, familia, nombre, area_habitual, lleva_pago, modo_lineas, agrupa_desde,
                               pasa_analisis, confidencialidad, origen, confirmado)
values ('RR-EVI', 'Rendiciones y reembolsos', 'Entrega de viáticos (a rendir)', 'VARIAS', true, 'detalle', 15,
        true, 'normal', 'PLATAFORMA', false);

update public.tipos_memo set nombre = 'Reembolso de viáticos' where codigo = 'RR-VIA';

-- ---------------------------------------------------------------------------
-- 2. Las fechas del viaje, en cada línea de la entrega
-- ---------------------------------------------------------------------------

alter table public.lineas_pago
  add column viaje_desde date,
  add column viaje_hasta date,
  add constraint viaje_en_orden check (viaje_desde is null or viaje_hasta is null or viaje_hasta >= viaje_desde);

-- ---------------------------------------------------------------------------
-- 3. La rendición, por persona: sale de una línea de la entrega
-- ---------------------------------------------------------------------------

alter table public.rendiciones
  add column linea_entrega_id uuid references public.lineas_pago (id),
  -- A nombre de quién: la persona que recibió el dinero (puede no tener cuenta).
  add column beneficiario_doc text,
  add column beneficiario text;

-- Cada persona de una entrega se rinde una sola vez. Varias personas del mismo
-- memo son varias rendiciones con el mismo número de memo: el índice que lo
-- impedía queda para los memos escritos a mano (fuera de la plataforma).
drop index public.rendiciones_una_por_memo_y_persona;
create unique index rendiciones_una_por_linea on public.rendiciones (linea_entrega_id) where linea_entrega_id is not null;
drop index public.rendiciones_memo_unico;
create unique index rendiciones_memo_unico
  on public.rendiciones (empresa_id, upper(btrim(numero_memo)))
  where tipo = 'memo' and linea_entrega_id is null;

-- Quién rinde una línea de entrega: la persona con ese DNI, si tiene cuenta
-- activa; si nadie la tiene, quien emitió el memo o la jefatura de su área.
create function public.puede_rendir_linea(lid uuid, quien uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from public.lineas_pago l
      join public.memos m on m.id = l.memo_id
      join public.unidades u on u.id = m.unidad_id
      join public.personas yo on yo.id = quien and yo.activo
     where l.id = lid
       and m.tipo_codigo = 'RR-EVI' and m.estado in ('aprobado', 'enviado', 'recibido')
       and (yo.dni = l.beneficiario_doc
            or (not exists (select 1 from public.personas b where b.dni = l.beneficiario_doc and b.activo)
                and (m.emisor_id = yo.id or yo.correo in (u.jefe_correo, u.suplente_correo)))))
$$;

-- Lo que me toca rendir: mis propias entregas y las de mi gente sin cuenta.
drop function public.memos_para_rendir();
create function public.memos_para_rendir()
returns table (linea_id uuid, id uuid, numero_visible text, asunto text, empresa_id smallint, monto numeric,
               moneda text, beneficiario text, beneficiario_doc text, a_nombre_de_otro boolean,
               viaje_desde date, viaje_hasta date)
language sql stable security definer set search_path = '' as $$
  select l.id, m.id, m.numero_visible, m.asunto, coalesce(l.empresa_pagadora_id, m.empresa_id), l.monto,
         l.moneda::text, l.beneficiario, l.beneficiario_doc, l.beneficiario_doc is distinct from public.mi_dni(),
         l.viaje_desde, l.viaje_hasta
    from public.lineas_pago l
    join public.memos m on m.id = l.memo_id
   where m.tipo_codigo = 'RR-EVI' and m.estado in ('aprobado', 'enviado', 'recibido')
     and public.puede_rendir_linea(l.id, auth.uid())
     and not exists (select 1 from public.rendiciones r where r.linea_entrega_id = l.id)
   order by m.numero_visible, l.orden
$$;

-- Lo que una rendición toma de su línea de entrega: número, empresa, lo
-- recibido y a nombre de quién.
create or replace function public.rendicion_desde_memo() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  l public.lineas_pago;
  m public.memos;
begin
  if new.memo_entrega_id is null and new.linea_entrega_id is null then
    new.beneficiario := null;
    new.beneficiario_doc := null;
    return new;
  end if;
  if new.tipo <> 'memo' then
    raise exception 'Solo una rendición de viáticos sale de un memo de entrega.';
  end if;
  if new.linea_entrega_id is null then
    raise exception 'Elige a nombre de quién es la rendición (la persona del memo de entrega).';
  end if;
  select * into l from public.lineas_pago where id = new.linea_entrega_id;
  select * into m from public.memos where id = l.memo_id;
  if not found or m.tipo_codigo <> 'RR-EVI' or m.estado not in ('aprobado', 'enviado', 'recibido') then
    raise exception 'Ese memo no es una entrega de viáticos aprobada.';
  end if;
  if not public.puede_rendir_linea(l.id, new.responsable_id) and not public.es_admin() then
    raise exception 'Esa entrega la rinde quien recibió el dinero; si no tiene cuenta en InroScan, la jefatura que emitió el memo.';
  end if;
  new.memo_entrega_id := m.id;
  new.numero_memo := m.numero_visible;
  new.monto := l.monto;
  new.empresa_id := coalesce(l.empresa_pagadora_id, m.empresa_id);
  new.beneficiario_doc := l.beneficiario_doc;
  new.beneficiario := l.beneficiario;
  return new;
end $$;

create or replace function public.rendicion_memo_fijo() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not public.es_admin() and (
       new.memo_entrega_id is distinct from old.memo_entrega_id
    or new.linea_entrega_id is distinct from old.linea_entrega_id
    or new.beneficiario_doc is distinct from old.beneficiario_doc
    or new.beneficiario is distinct from old.beneficiario
    or (old.linea_entrega_id is not null
        and (new.numero_memo is distinct from old.numero_memo or new.monto is distinct from old.monto
             or new.empresa_id is distinct from old.empresa_id))) then
    raise exception 'Lo que la rendición toma del memo de entrega no se cambia.';
  end if;
  return new;
end $$;

-- Una línea que ya se está rindiendo no cambia de persona ni de monto (por
-- ejemplo, si Análisis observa el memo y vuelve a quien lo emitió).
create function public.linea_con_rendicion() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.rendiciones r where r.linea_entrega_id = old.id) and (
       tg_op = 'DELETE'
    or new.beneficiario_doc is distinct from old.beneficiario_doc
    or new.monto is distinct from old.monto
    or new.empresa_pagadora_id is distinct from old.empresa_pagadora_id) then
    raise exception 'Esa persona ya está rindiendo esta entrega: su línea no se quita ni cambia de persona, monto o empresa.';
  end if;
  return case tg_op when 'DELETE' then old else new end;
end $$;

create trigger linea_con_rendicion
  before update or delete on public.lineas_pago
  for each row execute function public.linea_con_rendicion();

-- ---------------------------------------------------------------------------
-- 4. El reembolso paga a quien viajó
-- ---------------------------------------------------------------------------

create or replace function public.memo_desde_rendicion(rid uuid, unidad smallint) returns public.memos
language plpgsql security definer set search_path = '' as $$
declare
  r public.rendiciones;
  p public.personas;
  gastado numeric(14, 2);
  pagar numeric(14, 2);
  tipo text;
  m public.memos;
  titulo text;
  doc text;
  nombre text;
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

  -- Caja chica: se repone a quien la administra. Viáticos: se reembolsa a
  -- quien viajó (la rendición a nombre de otro lo dice), aunque rinda la jefatura.
  doc := case when r.tipo = 'memo' and r.beneficiario_doc is not null then r.beneficiario_doc else coalesce(p.dni, '') end;
  nombre := case when r.tipo = 'memo' and nullif(r.beneficiario, '') is not null then r.beneficiario
                 else coalesce(nullif(p.nombre, ''), p.correo) end;

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
        nombre, to_char(-pagar, 'FM999,999,990.00');
    end if;
  end if;
  if pagar <= 0 then
    raise exception 'La rendición no tiene gastos en soles para reponer.';
  end if;

  insert into public.memos (unidad_id, tipo_codigo, asunto, cuerpo, rendicion_id)
  values (unidad, tipo, titulo,
          format('Me dirijo a usted a fin de solicitar el pago de S/ %s a %s por %s, según la rendición aprobada y sus comprobantes.'
                 || E'\n\nSu despacho servirá para disponer el pago correspondiente.',
                 to_char(pagar, 'FM999,999,990.00'), nombre, lower(titulo)),
          rid)
  returning * into m;

  insert into public.lineas_pago (memo_id, orden, empresa_pagadora_id, beneficiario_doc, beneficiario,
                                  monto, moneda, observaciones)
  values (m.id, 1, r.empresa_id, doc, nombre, pagar, 'PEN', left(titulo, 300));
  return m;
end $$;

-- ---------------------------------------------------------------------------
-- 5. La cola de InroPay dice el periodo del viaje
-- ---------------------------------------------------------------------------

create or replace view public.cola_inropay as
  select m.id_tecnico || '|L' || lpad(l.orden::text, 2, '0') || '|v' || m.version as id_linea,
         m.id as memo_id,
         m.id_tecnico,
         m.estado_pago,
         ep.nombre as "EMPRESA",
         coalesce(pl.nombre, pm.nombre, '') as "PROYECTO",
         l.beneficiario_doc as "RUC - DNI",
         l.beneficiario as "PROVEEDOR",
         coalesce(c.nombre, '') as "CONCEPTO",
         l.sede as "SEDE",
         left(concat_ws(' · ', coalesce(nullif(l.observaciones, ''), m.asunto),
                        case when l.viaje_desde is not null
                             then 'viaje del ' || to_char(l.viaje_desde, 'DD/MM/YYYY')
                                  || coalesce(' al ' || to_char(l.viaje_hasta, 'DD/MM/YYYY'), '') end), 300) as "OBSERVACIONES",
         l.monto as "MONTO INC IGV",
         l.moneda as "MONEDA",
         m.numero_visible as "N° OC / OS / MEMO / CAJA CHICA",
         case when m.drive_carpeta_id is not null
              then 'https://drive.google.com/drive/folders/' || m.drive_carpeta_id else '' end as "LINK FILE",
         upper(replace(l.forma_pago::text, '_', ' ')) as "FORMA DE PAGO",
         l.pct_adelanto_saldo as "% ADELANTO / SALDO",
         l.dias_credito as "DIAS CREDITO",
         l.tipo_comprobante as "TIPO COMPROBANTE",
         case when l.numero <> '' then l.serie || '-' || l.numero else '' end as "Nº COMPROBANTE",
         to_char(l.fecha_comprobante, 'DD/MM/YYYY') as "FECHA EMISION COMPROBANTE",
         m.aprobado_en
    from public.memos m
    join public.tipos_memo t on t.codigo = m.tipo_codigo and t.pasa_analisis
    join public.lineas_pago l on l.memo_id = m.id
    left join public.empresas ep on ep.id = l.empresa_pagadora_id
    left join public.proyectos pl on pl.id = l.proyecto_id
    left join public.proyectos pm on pm.id = m.proyecto_id
    left join public.conceptos c on c.id = l.concepto_id
   where m.requiere_pago and m.estado in ('aprobado', 'enviado', 'recibido')
     and (m.estado_pago is null or m.estado_pago = 'en_analisis');

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------

revoke all on function public.puede_rendir_linea(uuid, uuid), public.memos_para_rendir(),
  public.linea_con_rendicion() from public, anon, authenticated;
grant execute on function public.memos_para_rendir() to authenticated;
