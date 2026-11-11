-- Pagos con segundo control (11-nov-2026). Dos huecos del diseño original:
--
-- 1. El jefe se aprobaba sus propios pagos. «Nadie aprueba su propio memo»,
--    pero si emitía el jefe o el suplente el memo salía aprobado. Ahora eso
--    vale solo para los memos SIN pago: un memo con pago que emite el jefe lo
--    aprueba el suplente (y al revés); si el área no tiene a nadie más, lo
--    aprueba administración. Los memos informativos siguen igual.
--
-- 2. Una cuenta bancaria distinta a la registrada, o nueva, quedaba
--    «pendiente de verificación» pero el memo pasaba igual a la cola de
--    InroPay. Ahora el memo no entra a la cola hasta que quien verifica
--    cuentas la apruebe. Si la rechaza, el memo vuelve a quien lo emitió
--    como observado, para que corrija la cuenta (mismo número).

-- ---------------------------------------------------------------------------
-- 1. Quién aprueba un memo: el jefe y el suplente, menos quien lo emitió; si
-- no queda nadie, administración (menos quien lo emitió).
-- ---------------------------------------------------------------------------

create function public.aprobadores_de(mid uuid) returns text[]
language sql stable security definer set search_path = '' as $$
  with m as (
    select x.unidad_id, public.correo_de(x.emisor_id) as emisor from public.memos x where x.id = mid
  ), j as (
    select array_remove(array_remove(array[n.jefe_correo, n.suplente_correo], null), m.emisor) as a
      from m join public.unidades n on n.id = m.unidad_id
  )
  select case when cardinality(j.a) > 0 then j.a
              else coalesce((select array_agg(p.correo order by p.correo)
                               from public.personas p, m
                              where p.activo and p.es_administracion and p.correo is not null
                                and p.correo is distinct from m.emisor), '{}') end
    from j
$$;

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
  -- pago: aprobado por emisión. Un pago siempre lo aprueba otra persona.
  auto := not n.requiere_aprobacion or (public.es_aprobador(m.unidad_id) and not m.requiere_pago);
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


-- El aviso «por aprobar» va a quien de verdad puede aprobar.
create or replace function public.encolar_aviso() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  m public.memos;
  n public.unidades;
  emisor text;
  jefes text[];
  aprueban text[];
begin
  if new.estado_despues is not distinct from new.estado_antes then
    return null;
  end if;
  select * into m from public.memos where id = new.memo_id;
  select * into n from public.unidades where id = m.unidad_id;
  emisor := public.correo_de(m.emisor_id);
  jefes := array_remove(array[n.jefe_correo, n.suplente_correo], null);

  if new.estado_despues = 'pendiente' then
    aprueban := public.aprobadores_de(m.id);
    if cardinality(aprueban) > 0 then
      insert into public.avisos (memo_id, tipo, para) values (m.id, 'por_aprobar', aprueban);
    end if;
  elsif new.estado_despues = 'aprobado' and m.destinatario_correo <> '' then
    insert into public.avisos (memo_id, tipo, para, copia)
    values (m.id, 'aprobado', array[m.destinatario_correo], array_remove(m.copias || emisor, m.destinatario_correo));
  elsif new.estado_despues = 'observado' then
    insert into public.avisos (memo_id, tipo, para) values (m.id, 'observado', array[emisor]);
  elsif new.estado_despues = 'recibido' then
    insert into public.avisos (memo_id, tipo, para) values (m.id, 'recibido', array[emisor]);
  elsif new.estado_despues = 'anulado' and new.estado_antes <> 'borrador' then
    insert into public.avisos (memo_id, tipo, para)
    values (m.id, 'anulado', array(select distinct x from unnest(array[emisor, nullif(m.destinatario_correo, '')] || jefes) x where x is not null));
  end if;
  return null;
end $$;

-- Los recordatorios de aprobación, también a quien puede aprobar.
create or replace function public.encolar_recordatorios(ahora timestamptz default now()) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  par public.parametros_memo;
  lima timestamp := ahora at time zone 'America/Lima';
  n integer := 0;
  k integer;
begin
  if extract(isodow from lima) > 5 or extract(hour from lima) < 8 or extract(hour from lima) >= 18 then
    return 0;
  end if;
  select * into par from public.parametros_memo;

  insert into public.avisos (memo_id, tipo, para, copia, fuera_de_meta, creado_en)
  select x.id, 'recordatorio_aprobar', x.aprueban,
         case when ahora - x.actualizado_en > make_interval(hours => par.meta_atencion_horas)
              then array[public.correo_de(x.emisor_id)] else '{}' end,
         ahora - x.actualizado_en > make_interval(hours => par.meta_atencion_horas), ahora
    from (select m.id, m.emisor_id, m.actualizado_en, public.aprobadores_de(m.id) as aprueban
            from public.memos m
           where m.estado = 'pendiente'
             and ahora - m.actualizado_en >= make_interval(hours => par.horas_recordatorio)
             and not exists (select 1 from public.avisos a where a.memo_id = m.id
                               and a.creado_en > ahora - make_interval(hours => par.horas_recordatorio))) x
   where cardinality(x.aprueban) > 0
   limit 40;
  get diagnostics k = row_count;
  n := n + k;

  insert into public.avisos (memo_id, tipo, para, copia, fuera_de_meta, creado_en)
  select m.id, 'recordatorio_cargo', array[m.destinatario_correo],
         case when ahora - coalesce(m.enviado_en, m.aprobado_en) > make_interval(hours => par.meta_atencion_horas)
              then array[public.correo_de(m.emisor_id)] else '{}' end,
         ahora - coalesce(m.enviado_en, m.aprobado_en) > make_interval(hours => par.meta_atencion_horas), ahora
    from public.memos m
   where m.estado in ('aprobado', 'enviado') and m.destinatario_correo <> ''
     and ahora - coalesce(m.enviado_en, m.aprobado_en) >= make_interval(hours => par.horas_recordatorio)
     and not exists (select 1 from public.avisos a where a.memo_id = m.id
                       and a.creado_en > ahora - make_interval(hours => par.horas_recordatorio))
   limit 40;
  get diagnostics k = row_count;
  return n + k;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Cuentas sin verificar no pasan a pagos
-- ---------------------------------------------------------------------------

create or replace function public.revisar_cuentas(mid uuid)
returns table (nivel text, mensaje text)
language sql stable security definer set search_path = '' as $$
  select case when l.estado_cuenta = 'rechazada' then 'error' else 'aviso' end,
         case l.estado_cuenta
           when 'rechazada' then format('Línea %s: la cuenta de %s fue rechazada por el verificador.', l.orden, l.beneficiario)
           when 'distinta' then format('Línea %s: la cuenta no es la registrada para %s. El memo no pasa a pagos hasta que quien verifica cuentas la apruebe.', l.orden, l.beneficiario)
           else format('Línea %s: cuenta nueva de %s. El memo no pasa a pagos hasta que quien verifica cuentas la apruebe.', l.orden, l.beneficiario) end
    from public.lineas_pago l
   where l.memo_id = mid and l.estado_cuenta in ('rechazada', 'distinta', 'pendiente')
$$;

-- Si el verificador rechaza la cuenta, los memos aprobados que la usan y
-- todavía no pasaron a pagos vuelven a quien los emitió, como observados.
create or replace function public.decidir_cuenta(cid uuid, aprobar boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c public.cuentas_bancarias;
  x record;
begin
  if not public.es_verificador() then
    raise exception 'Las cuentas nuevas las decide quien verifica cuentas.';
  end if;
  select * into c from public.cuentas_bancarias where id = cid for update;
  if not found or c.estado <> 'pendiente' then
    raise exception 'Esa cuenta no está pendiente de verificación.';
  end if;
  update public.cuentas_bancarias
     set estado = case when aprobar then 'verificada' else 'rechazada' end,
         decidida_por = public.mi_correo(), decidida_en = now(), actualizado_en = now()
   where id = cid;
  update public.lineas_pago l
     set estado_cuenta = case when aprobar then 'coincide' else 'rechazada' end
   where l.beneficiario_doc = c.identificador
     and ((c.huella_cuenta is not null and l.huella_cuenta = c.huella_cuenta)
          or (c.huella_cci is not null and l.huella_cci = c.huella_cci));

  if not aprobar then
    for x in
      select distinct m.id, l.beneficiario
        from public.memos m join public.lineas_pago l on l.memo_id = m.id
       where l.estado_cuenta = 'rechazada' and l.beneficiario_doc = c.identificador
         and m.estado in ('aprobado', 'enviado', 'recibido') and m.estado_pago is null
    loop
      perform set_config('memos.transicion', 'si', true);
      perform set_config('memos.evento', 'observado', true);
      perform set_config('memos.detalle', jsonb_build_object(
        'comentario', format('Quien verifica cuentas rechazó la cuenta de %s. Corrige la cuenta y vuelve a enviar.', x.beneficiario))::text, true);
      update public.memos
         set estado = 'observado',
             ultima_observacion = format('Quien verifica cuentas rechazó la cuenta de %s. Corrige la cuenta y vuelve a enviar.', x.beneficiario)
       where id = x.id;
    end loop;
  end if;
end $$;

-- La cola de InroPay: un memo con alguna cuenta distinta, nueva o rechazada
-- no entra hasta que todas estén verificadas. Lo que InroPay ya tomó
-- (en análisis) sigue a la vista.
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
              and not exists (select 1 from public.lineas_pago x
                               where x.memo_id = m.id and x.estado_cuenta in ('distinta', 'pendiente', 'rechazada'))));

revoke all on public.cola_inropay from public, anon, authenticated;
grant select on public.cola_inropay to service_role;
revoke all on function public.aprobadores_de(uuid) from public, anon, authenticated;
