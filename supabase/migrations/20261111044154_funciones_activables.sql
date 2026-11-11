-- Funciones activables (11-nov-2026). Lo que INROMEMOS agregó al diseño de
-- Franco se puede apagar desde administración, para que él decida:
--   · segundo_control_pagos: un pago que emite el jefe lo aprueba otra persona.
--   · cuenta_verificada_para_pagar: una cuenta nueva o distinta no pasa a
--     InroPay hasta que quien verifica cuentas la apruebe.
--   · solicitar_memo: pedir un memo a un área desde Memorandums (apagado:
--     sigue «Solicitar viáticos» en Rendiciones).
-- Y los tipos de memo que propuso INROMEMOS (no están en la hoja de Franco)
-- quedan marcados para mostrarlos con su etiqueta.

alter table public.parametros_memo
  add column segundo_control_pagos boolean not null default true,
  add column cuenta_verificada_para_pagar boolean not null default true,
  add column solicitar_memo boolean not null default false;

alter table public.tipos_memo
  add column propuesto_inromemos boolean not null default false;
update public.tipos_memo set propuesto_inromemos = true where codigo = 'RR-EVI';

create or replace function public.emitir_memo(mid uuid) returns public.memos
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
  segundo boolean := coalesce((select p.segundo_control_pagos from public.parametros_memo p), true);
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

  -- El área no exige aprobación, o emite el jefe o el suplente un memo SIN
  -- pago: aprobado por emisión. Un pago lo aprueba otra persona, salvo que
  -- administración apague el «segundo control de pagos».
  auto := not n.requiere_aprobacion
          or (public.es_aprobador(m.unidad_id) and (not m.requiere_pago or not segundo));
  perform set_config('memos.evento', case when m.version = 0 then 'emitido' else 'corregido' end, true);
  perform set_config('memos.detalle', jsonb_build_object('aprobado_por_emision', auto)::text, true);

  update public.memos set
    anio = m.anio, numero = m.numero, numero_visible = m.numero_visible,
    id_tecnico = m.id_tecnico, emitido_en = m.emitido_en,
    version = m.version + 1,
    -- Observado por Análisis y Registro: al corregir vuelve a la cola de pago.
    estado_pago = case when m.estado_pago = 'observado_analisis' then null else m.estado_pago end,
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
     and (m.estado_pago = 'en_analisis'
          or (m.estado_pago is null
              and (not coalesce((select p.cuenta_verificada_para_pagar from public.parametros_memo p), true)
                   or not exists (select 1 from public.lineas_pago x
                               where x.memo_id = m.id and x.estado_cuenta in ('distinta', 'pendiente', 'rechazada')))));

revoke all on public.cola_inropay from public, anon, authenticated;
grant select on public.cola_inropay to service_role;

-- Pedir un memo desde Memorandums solo si administración lo activó; pedir
-- viáticos desde Rendiciones sigue siempre.
create function public.solicitud_permitida() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.origen = 'memos' and not coalesce((select p.solicitar_memo from public.parametros_memo p), false) then
    raise exception 'Pedir memos a otras áreas está desactivado. Pídeselo a quien emite en tu área.';
  end if;
  return new;
end $$;

create trigger solicitud_permitida
  before insert on public.solicitudes_memo
  for each row execute function public.solicitud_permitida();

revoke all on function public.solicitud_permitida() from public, anon, authenticated;
