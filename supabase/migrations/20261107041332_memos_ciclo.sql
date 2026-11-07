-- InroScan · el ciclo completo del memo
--
-- Lo que convierte la plataforma de memos en el ciclo del dinero:
--   1. Roles: quién verifica cuentas y quién registra pagos (Tesorería).
--   2. El memo de entrega de viáticos y la rendición que sale de él.
--   3. El estado del pago (a mano, o desde InroPay) y el cierre de la rendición.
--   4. Sustentos adjuntos al memo.
--   5. La bandeja de correos (avisos) y los recordatorios cada hora.
--   6. Cuentas bancarias: una copia SIN números completos (solo huellas y máscaras).
--   7. La cola hacia InroPay Análisis y Registro (los 17 campos del RG).
--   8. Los KPIs, solo para quien tiene el permiso.
--
-- Tipos de usuario (todos con cuenta @inroprin.com):
--   persona        rinde lo suyo; ve los memos donde participa
--   emisor         emite en sus áreas y ve lo de ellas (menos lo confidencial)
--   jefe/suplente  aprueba y observa en su área; ve todo lo de ella
--   interárea      ve lo NORMAL de otras áreas
--   ve KPIs        indicadores
--   verificador    decide las cuentas bancarias nuevas o distintas
--   tesorería      registra el estado del pago
--   administración todo
--   sistema        las funciones (llave de servicio)

-- ---------------------------------------------------------------------------
-- 1. Roles
-- ---------------------------------------------------------------------------

alter table public.usuarios_memo
  add column verifica_cuentas boolean not null default false,
  add column registra_pagos boolean not null default false;

create function public.es_verificador() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.es_admin() or exists (
    select 1 from public.usuarios_memo x where x.correo = public.mi_correo() and x.activo and x.verifica_cuentas)
$$;

create function public.es_tesoreria() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.es_admin() or exists (
    select 1 from public.usuarios_memo x where x.correo = public.mi_correo() and x.activo and x.registra_pagos)
$$;

-- Tesorería ve los memos con pago ya aprobados, de todas las áreas, para
-- registrar su pago (no los confidenciales: esos los ve administración).
create policy leer_tesoreria on public.memos for select to authenticated
  using ((select public.es_tesoreria()) and requiere_pago and estado in ('aprobado', 'enviado', 'recibido')
         and confidencialidad <> 'confidencial');

create function public.memo_para_tesoreria(mid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.es_tesoreria() and exists (
    select 1 from public.memos m
     where m.id = mid and m.requiere_pago and m.estado in ('aprobado', 'enviado', 'recibido', 'observado')
       and m.confidencialidad <> 'confidencial')
$$;

create policy leer_tesoreria on public.lineas_pago for select to authenticated
  using (public.memo_para_tesoreria(memo_id));
create policy leer_tesoreria on public.memo_eventos for select to authenticated
  using (public.memo_para_tesoreria(memo_id));

-- ---------------------------------------------------------------------------
-- 2. El DNI propio y el memo de entrega de viáticos
-- ---------------------------------------------------------------------------

create unique index personas_dni_unico on public.personas (dni) where dni is not null;

-- De qué versión del memo es el PDF que está en Drive: si se corrige y se
-- vuelve a aprobar, se genera otro (el anterior queda en el legajo).
alter table public.memos add column pdf_version integer;

-- Cada persona escribe su DNI una vez: con él se encuentran sus memos de
-- viáticos y se le paga un reembolso.
create function public.guardar_mi_dni(dni text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.persona_activa() then
    raise exception 'Tu cuenta no está habilitada.';
  end if;
  if dni !~ '^[0-9]{8}$' then
    raise exception 'El DNI tiene 8 dígitos.';
  end if;
  if exists (select 1 from public.personas p where p.dni = guardar_mi_dni.dni and p.id <> auth.uid()) then
    raise exception 'Ese DNI ya está registrado a nombre de otra persona. Avísale a administración.';
  end if;
  update public.personas set dni = guardar_mi_dni.dni where id = auth.uid();
end $$;

create function public.mi_dni() returns text
language sql stable security definer set search_path = '' as $$
  select p.dni from public.personas p where p.id = auth.uid() and p.activo
$$;

create function public.es_beneficiario(mid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.mi_dni() is not null and exists (
    select 1 from public.lineas_pago l join public.memos m on m.id = l.memo_id
     where l.memo_id = mid and m.estado <> 'borrador' and l.beneficiario_doc = public.mi_dni())
$$;

-- Quien recibe dinero por un memo lo ve, y ve solo sus propias líneas.
create policy leer_beneficiario on public.memos for select to authenticated
  using (estado <> 'borrador' and public.es_beneficiario(id));
create policy leer_beneficiario on public.lineas_pago for select to authenticated
  using (beneficiario_doc = (select public.mi_dni()) and public.es_beneficiario(memo_id));

-- La rendición de viáticos sale del memo que entregó el dinero.
alter table public.rendiciones add column memo_entrega_id uuid references public.memos (id);
create unique index rendiciones_una_por_memo_y_persona
  on public.rendiciones (memo_entrega_id, responsable_id) where memo_entrega_id is not null;

-- Los memos de viáticos aprobados que me entregaron dinero y todavía no rendí.
create function public.memos_para_rendir()
returns table (id uuid, numero_visible text, asunto text, empresa_id smallint, monto numeric, moneda text)
language sql stable security definer set search_path = '' as $$
  select m.id, m.numero_visible, m.asunto, min(l.empresa_pagadora_id), sum(l.monto), min(l.moneda)
    from public.memos m
    join public.lineas_pago l on l.memo_id = m.id
    join public.personas p on p.id = auth.uid() and p.activo and p.dni is not null and l.beneficiario_doc = p.dni
   where m.tipo_codigo = 'RR-VIA' and m.estado in ('aprobado', 'enviado', 'recibido')
     and not exists (select 1 from public.rendiciones r where r.memo_entrega_id = m.id and r.responsable_id = p.id)
   group by m.id, m.numero_visible, m.asunto
   order by m.numero_visible
$$;

-- Lo que una rendición toma de su memo de entrega: número, empresa y lo recibido.
create function public.rendicion_desde_memo() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  m public.memos;
  dni text;
  recibido numeric;
  empresa smallint;
begin
  if new.memo_entrega_id is null then
    return new;
  end if;
  if new.tipo <> 'memo' then
    raise exception 'Solo una rendición de viáticos sale de un memo de entrega.';
  end if;
  select * into m from public.memos where id = new.memo_entrega_id;
  if not found or m.tipo_codigo <> 'RR-VIA' or m.estado not in ('aprobado', 'enviado', 'recibido') then
    raise exception 'Ese memo no es un memo de viáticos aprobado.';
  end if;
  select p.dni into dni from public.personas p where p.id = new.responsable_id;
  select sum(l.monto), min(l.empresa_pagadora_id) into recibido, empresa
    from public.lineas_pago l where l.memo_id = m.id and l.beneficiario_doc = dni;
  if recibido is null and not public.es_admin() then
    raise exception 'Ese memo no te entrega dinero a ti (revisa tu DNI).';
  end if;
  new.numero_memo := m.numero_visible;
  new.monto := coalesce(recibido, m.total);
  new.empresa_id := coalesce(empresa, m.empresa_id);
  return new;
end $$;

-- Corre después de rendicion_al_crear (orden alfabético de los triggers).
create trigger rendicion_desde_memo
  before insert on public.rendiciones
  for each row execute function public.rendicion_desde_memo();

create function public.rendicion_memo_fijo() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.memo_entrega_id is distinct from old.memo_entrega_id and auth.uid() is not null and not public.es_admin() then
    raise exception 'El memo de entrega de una rendición no se cambia.';
  end if;
  return new;
end $$;

create trigger rendicion_memo_fijo
  before update on public.rendiciones
  for each row execute function public.rendicion_memo_fijo();

-- ---------------------------------------------------------------------------
-- 3. El estado del pago
-- ---------------------------------------------------------------------------

-- Lo registra Tesorería a mano, o InroPay por su función (como sistema).
-- «Observado en análisis» devuelve el memo a quien lo emitió. «Pagado» cierra
-- la rendición de la que salió el memo (reposición o liquidación).
create function public.registrar_estado_pago(mid uuid, estado public.estado_pago, detalle text default '')
returns public.memos
language plpgsql security definer set search_path = '' as $$
declare
  m public.memos;
  r public.rendiciones;
  claims text;
begin
  if auth.uid() is not null and not public.es_tesoreria() then
    raise exception 'El estado del pago lo registra Tesorería.';
  end if;
  select * into m from public.memos where id = mid for update;
  if not found or not m.requiere_pago or m.estado not in ('aprobado', 'enviado', 'recibido') then
    raise exception 'Solo un memo de pago aprobado tiene estado de pago.';
  end if;
  if m.estado_pago = 'pagado' and not (auth.uid() is null or public.es_admin()) then
    raise exception 'El memo ya está pagado.';
  end if;
  if estado = 'observado_analisis' and length(btrim(coalesce(detalle, ''))) < 5 then
    raise exception 'Escribe qué observó Análisis y Registro (al menos 5 letras).';
  end if;

  perform set_config('memos.transicion', 'si', true);
  perform set_config('memos.evento', 'pago', true);
  perform set_config('memos.detalle',
    jsonb_build_object('estado_pago', estado, 'detalle', btrim(coalesce(detalle, '')))::text, true);
  update public.memos set
    estado_pago = registrar_estado_pago.estado,
    estado = case when registrar_estado_pago.estado = 'observado_analisis' then 'observado'::public.estado_memo else m.estado end,
    ultima_observacion = case when registrar_estado_pago.estado = 'observado_analisis'
                              then 'Análisis y Registro: ' || btrim(detalle) else m.ultima_observacion end
  where id = mid returning * into m;

  if estado = 'pagado' and m.rendicion_id is not null then
    select * into r from public.rendiciones where id = m.rendicion_id;
    if found and r.estado = 'aprobada' then
      -- El cierre lo hace el sistema: quien registra el pago puede no ser
      -- administración, que es quien cierra una rendición a mano.
      claims := current_setting('request.jwt.claims', true);
      perform set_config('request.jwt.claims', '{"role": "service_role"}', true);
      update public.rendiciones
         set estado = case r.tipo when 'caja' then 'repuesta'::public.estado_rendicion else 'liquidada'::public.estado_rendicion end
       where id = r.id;
      perform set_config('request.jwt.claims', coalesce(claims, ''), true);
    end if;
  end if;
  return m;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Sustentos
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sustentos', 'sustentos', false, 20 * 1024 * 1024,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp',
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'application/vnd.ms-excel',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do nothing;

create table public.memo_sustentos (
  id uuid primary key default gen_random_uuid(),
  memo_id uuid not null references public.memos (id),
  -- Qué documento pedido cubre; nulo = otro documento de apoyo.
  sustento_id smallint references public.sustentos_tipo (id),
  nombre text not null check (nombre <> '' and length(nombre) <= 200),
  ruta text not null unique,
  tipo_mime text not null,
  tamano integer not null check (tamano > 0 and tamano <= 20 * 1024 * 1024),
  descartado boolean not null default false,
  drive_id text,
  -- Lo que leyó la IA y cómo cruza con las líneas: {ruc, numero, total, avisos[]}.
  lectura jsonb not null default '{}',
  subido_por uuid references public.personas (id) default auth.uid(),
  creado_en timestamptz not null default now(),
  constraint ruta_del_memo check (ruta like memo_id::text || '/%')
);
create index memo_sustentos_memo on public.memo_sustentos (memo_id);

create function public.sustento_al_guardar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    return new;  -- el sistema (Drive, lectura)
  end if;
  if tg_op = 'INSERT' then
    new.subido_por := auth.uid();
    new.descartado := false;
    new.drive_id := null;
    new.lectura := '{}';
  elsif new.memo_id <> old.memo_id or new.ruta <> old.ruta or new.tamano <> old.tamano
        or new.tipo_mime <> old.tipo_mime or new.drive_id is distinct from old.drive_id
        or new.lectura <> old.lectura or new.subido_por is distinct from old.subido_por then
    raise exception 'De un sustento solo se cambia a qué documento corresponde o se descarta.';
  end if;
  return new;
end $$;

create trigger sustento_al_guardar
  before insert or update on public.memo_sustentos
  for each row execute function public.sustento_al_guardar();

-- Las mismas reglas que las líneas: lo de un memo reservado lo ven los
-- participantes, el jefe y administración.
create function public.puede_ver_detalle_memo(mid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memos m
     where m.id = mid
       and public.puede_ver_memo(m.unidad_id, m.emisor_id, m.destinatario_correo, m.copias, m.confidencialidad, m.estado)
       and (m.confidencialidad = 'normal' or m.emisor_id = auth.uid()
            or m.destinatario_correo = public.mi_correo()
            or public.es_aprobador(m.unidad_id) or public.es_admin()))
$$;

alter table public.memo_sustentos enable row level security;
create policy leer on public.memo_sustentos for select to authenticated
  using (public.puede_ver_detalle_memo(memo_id));
create policy crear on public.memo_sustentos for insert to authenticated
  with check (public.puede_editar_memo(memo_id));
create policy cambiar on public.memo_sustentos for update to authenticated
  using (public.puede_editar_memo(memo_id)) with check (public.puede_editar_memo(memo_id));

create policy "sustentos: subir a un memo editable"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'sustentos'
              and public.puede_editar_memo(public.uuid_o_nulo((storage.foldername(name))[1])));
create policy "sustentos: ver los de memos visibles"
  on storage.objects for select to authenticated
  using (bucket_id = 'sustentos'
         and public.puede_ver_detalle_memo(public.uuid_o_nulo((storage.foldername(name))[1])));

-- ---------------------------------------------------------------------------
-- 5. Avisos por correo: una bandeja de salida que llenan los cambios de
-- estado y vacía la función «drive» (Gmail de la cuenta conectada).
-- ---------------------------------------------------------------------------

create table public.avisos (
  id bigint generated always as identity primary key,
  memo_id uuid not null references public.memos (id),
  -- por_aprobar, aprobado, observado, recibido, anulado, recordatorio_aprobar, recordatorio_cargo
  tipo text not null,
  para text[] not null,
  copia text[] not null default '{}',
  fuera_de_meta boolean not null default false,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'enviado', 'error', 'omitido')),
  intentos smallint not null default 0,
  error text,
  creado_en timestamptz not null default now(),
  enviado_en timestamptz
);
create index avisos_pendientes on public.avisos (creado_en) where estado in ('pendiente', 'error');
create index avisos_memo on public.avisos (memo_id, creado_en desc);

create function public.correo_de(persona uuid) returns text
language sql stable security definer set search_path = '' as $$
  select p.correo from public.personas p where p.id = persona
$$;

create function public.encolar_aviso() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  m public.memos;
  n public.unidades;
  emisor text;
  jefes text[];
begin
  if new.estado_despues is not distinct from new.estado_antes then
    return null;
  end if;
  select * into m from public.memos where id = new.memo_id;
  select * into n from public.unidades where id = m.unidad_id;
  emisor := public.correo_de(m.emisor_id);
  jefes := array_remove(array[n.jefe_correo, n.suplente_correo], null);

  if new.estado_despues = 'pendiente' and cardinality(jefes) > 0 then
    insert into public.avisos (memo_id, tipo, para) values (m.id, 'por_aprobar', jefes);
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

create trigger encolar_aviso
  after insert on public.memo_eventos
  for each row execute function public.encolar_aviso();

-- Cada hora, de lunes a viernes de 8:00 a 18:00 (Lima): lo que espera
-- aprobación o cargo y no tuvo aviso en la última hora. Pasada la meta de
-- atención (3 h), el aviso va con copia a quien emitió.
create function public.encolar_recordatorios(ahora timestamptz default now()) returns integer
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
  select m.id, 'recordatorio_aprobar', array_remove(array[u.jefe_correo, u.suplente_correo], null),
         case when ahora - m.actualizado_en > make_interval(hours => par.meta_atencion_horas)
              then array[public.correo_de(m.emisor_id)] else '{}' end,
         ahora - m.actualizado_en > make_interval(hours => par.meta_atencion_horas), ahora
    from public.memos m join public.unidades u on u.id = m.unidad_id
   where m.estado = 'pendiente' and coalesce(u.jefe_correo, u.suplente_correo) is not null
     and ahora - m.actualizado_en >= make_interval(hours => par.horas_recordatorio)
     and not exists (select 1 from public.avisos a where a.memo_id = m.id
                       and a.creado_en > ahora - make_interval(hours => par.horas_recordatorio))
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

alter table public.avisos enable row level security;
create policy leer on public.avisos for select to authenticated using ((select public.es_admin()));

-- ---------------------------------------------------------------------------
-- 6. Cuentas bancarias. Las tres bases (Compras Nacionales, Importaciones,
-- RRHH) son hojas de Google que no se tocan. Acá se guarda una copia SIN el
-- número: los últimos 4 dígitos para mostrar y una huella (HMAC con una clave
-- que solo conoce la función) para comparar. Con la huella se sabe si una
-- cuenta coincide, pero no se puede reconstruir el número.
-- ---------------------------------------------------------------------------

create table public.bases_cuentas (
  base text primary key check (base in ('NACIONAL', 'IMPORTACIONES', 'RRHH')),
  hoja_id text not null,
  pestana text not null,
  -- Áreas (códigos de unidad) que la consultan; vacía = la base por omisión.
  areas text[] not null default '{}',
  activo boolean not null default true
);

create table public.cuentas_bancarias (
  id uuid primary key default gen_random_uuid(),
  base text not null check (base in ('NACIONAL', 'IMPORTACIONES', 'RRHH', 'PLATAFORMA')),
  -- RUC, DNI o código del proveedor del exterior, sin ceros a la izquierda.
  identificador text not null,
  titular text,
  banco text,
  moneda text,
  tipo text not null default 'PRINCIPAL',
  cuenta text not null default '' check (cuenta ~ '^(••••)?[0-9A-Z]{0,4}$'),
  cci text not null default '' check (cci ~ '^(••••)?[0-9]{0,4}$'),
  huella_cuenta text check (huella_cuenta ~ '^[0-9a-f]{64}$'),
  huella_cci text check (huella_cci ~ '^[0-9a-f]{64}$'),
  -- verificada: de la base o aprobada; pendiente: la ingresó un emisor; rechazada.
  estado text not null default 'verificada' check (estado in ('verificada', 'pendiente', 'rechazada')),
  -- alta: beneficiario nuevo; discrepancia: distinta a la registrada.
  motivo text,
  registrada_por text,
  memo_id uuid references public.memos (id),
  decidida_por text,
  decidida_en timestamptz,
  actualizado_en timestamptz not null default now(),
  llave text generated always as (
    base || '|' || identificador || '|' || coalesce(huella_cuenta, '') || '|' || coalesce(huella_cci, '')) stored unique
);
create index cuentas_por_identificador on public.cuentas_bancarias (identificador);
create index cuentas_pendientes on public.cuentas_bancarias (actualizado_en) where estado = 'pendiente';

alter table public.lineas_pago
  add column huella_cuenta text check (huella_cuenta ~ '^[0-9a-f]{64}$'),
  add column huella_cci text check (huella_cci ~ '^[0-9a-f]{64}$');

-- El verificador decide una cuenta pendiente: verificada pasa a valer para la
-- próxima vez; las líneas con esa cuenta cambian de estado.
create function public.decidir_cuenta(cid uuid, aprobar boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c public.cuentas_bancarias;
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
end $$;

alter table public.bases_cuentas enable row level security;
alter table public.cuentas_bancarias enable row level security;
create policy leer on public.bases_cuentas for select to authenticated using ((select public.es_admin()));
create policy leer on public.cuentas_bancarias for select to authenticated using ((select public.es_verificador()));

-- Una cuenta rechazada no se paga; una pendiente o distinta se avisa.
create function public.revisar_cuentas(mid uuid)
returns table (nivel text, mensaje text)
language sql stable security definer set search_path = '' as $$
  select case when l.estado_cuenta = 'rechazada' then 'error' else 'aviso' end,
         case l.estado_cuenta
           when 'rechazada' then format('Línea %s: la cuenta de %s fue rechazada por el verificador.', l.orden, l.beneficiario)
           when 'distinta' then format('Línea %s: la cuenta no es la registrada para %s. Queda pendiente de verificación.', l.orden, l.beneficiario)
           else format('Línea %s: cuenta nueva de %s, pendiente de verificación.', l.orden, l.beneficiario) end
    from public.lineas_pago l
   where l.memo_id = mid and l.estado_cuenta in ('rechazada', 'distinta', 'pendiente')
$$;

-- ---------------------------------------------------------------------------
-- 7. La cola hacia InroPay Análisis y Registro: una fila por línea de pago de
-- los memos aprobados que pasan a análisis, con los encabezados del RG. La
-- lee solo el sistema (función «inropay», con el token de InroPay).
-- ---------------------------------------------------------------------------

create view public.cola_inropay as
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
         left(coalesce(nullif(l.observaciones, ''), m.asunto), 300) as "OBSERVACIONES",
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

revoke all on public.cola_inropay from public, anon, authenticated;
grant select on public.cola_inropay to service_role;

-- ---------------------------------------------------------------------------
-- 8. KPIs: solo para quien tiene «Ver KPIs» (o administración). Se calculan
-- sobre los memos emitidos en el período.
-- ---------------------------------------------------------------------------

create function public.kpis_memos(desde date, hasta date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  par public.parametros_memo;
  r jsonb;
begin
  if not public.ve_kpis() then
    raise exception 'Los indicadores son solo para quien tiene el permiso «Ver KPIs».';
  end if;
  select * into par from public.parametros_memo;
  with base as (
    select m.*,
           exists (select 1 from public.memo_eventos e where e.memo_id = m.id and e.tipo = 'observado') as fue_observado,
           (select (e.detalle ->> 'aprobado_por_emision')::boolean from public.memo_eventos e
             where e.memo_id = m.id and e.tipo = 'emitido' limit 1) as auto
      from public.memos m
     where m.emitido_en >= desde::timestamp at time zone 'America/Lima'
       and m.emitido_en < (hasta + 1)::timestamp at time zone 'America/Lima'),
  aprob as (
    select extract(epoch from aprobado_en - emitido_en) / 3600 as horas
      from base where aprobado_en is not null and not coalesce(auto, false)),
  cargo as (
    select extract(epoch from recibido_en - coalesce(enviado_en, aprobado_en)) / 3600 as horas
      from base where recibido_en is not null)
  select jsonb_build_object(
    'emitidos', (select count(*) from base),
    'anulados', (select count(*) from base where estado = 'anulado'),
    'pendientes', (select count(*) from base where estado = 'pendiente'),
    'observados_alguna_vez', (select count(*) from base where fue_observado),
    'a_la_primera_pct', (select round(100.0 * count(*) filter (where not fue_observado) / nullif(count(*), 0), 1)
                           from base where aprobado_en is not null),
    'horas_aprobacion', (select round(avg(horas)::numeric, 1) from aprob),
    'horas_aprobacion_mediana', (select round((percentile_cont(0.5) within group (order by horas))::numeric, 1) from aprob),
    'horas_cargo', (select round(avg(horas)::numeric, 1) from cargo),
    'cargo_en_meta_pct', (select round(100.0 * count(*) filter (where horas <= par.meta_atencion_horas) / nullif(count(*), 0), 1) from cargo),
    'meta_horas', par.meta_atencion_horas,
    'valoracion', (select round(avg(valoracion)::numeric, 2) from base where valoracion is not null),
    'valoraciones', (select coalesce(jsonb_object_agg(v, n), '{}') from
                      (select valoracion as v, count(*) as n from base where valoracion is not null group by valoracion) x),
    'monto_pen', (select coalesce(sum(total), 0) from base where requiere_pago and moneda = 'PEN' and estado <> 'anulado'),
    'pagados', (select count(*) from base where estado_pago = 'pagado'),
    'por_area', (select coalesce(jsonb_agg(x order by x.emitidos desc), '[]') from (
                   select u.nombre as area, e.codigo as empresa, count(*) as emitidos,
                          count(*) filter (where b.estado = 'pendiente') as pendientes,
                          count(*) filter (where b.fue_observado) as observados,
                          coalesce(sum(b.total) filter (where b.requiere_pago and b.moneda = 'PEN' and b.estado <> 'anulado'), 0) as monto
                     from base b join public.unidades u on u.id = b.unidad_id join public.empresas e on e.id = u.empresa_id
                    group by u.nombre, e.codigo) x),
    'por_semana', (select coalesce(jsonb_agg(x order by x.semana), '[]') from (
                     select to_char(date_trunc('week', emitido_en at time zone 'America/Lima'), 'YYYY-MM-DD') as semana,
                            count(*) as emitidos
                       from base group by 1) x)
  ) into r;
  return r;
end $$;

-- ---------------------------------------------------------------------------
-- Privilegios
-- ---------------------------------------------------------------------------

revoke all on public.memo_sustentos, public.avisos, public.bases_cuentas, public.cuentas_bancarias
  from anon, authenticated;
grant select, insert, update on public.memo_sustentos to authenticated;
grant select on public.avisos, public.bases_cuentas, public.cuentas_bancarias to authenticated;
grant all on public.memo_sustentos, public.avisos, public.bases_cuentas, public.cuentas_bancarias to service_role;

revoke all on function public.es_verificador(), public.es_tesoreria(), public.guardar_mi_dni(text),
  public.memos_para_rendir(), public.rendicion_desde_memo(), public.rendicion_memo_fijo(),
  public.registrar_estado_pago(uuid, public.estado_pago, text), public.sustento_al_guardar(),
  public.puede_ver_detalle_memo(uuid), public.correo_de(uuid), public.encolar_aviso(),
  public.encolar_recordatorios(timestamptz), public.decidir_cuenta(uuid, boolean),
  public.revisar_cuentas(uuid), public.kpis_memos(date, date), public.memo_para_tesoreria(uuid),
  public.mi_dni(), public.es_beneficiario(uuid)
  from public, anon, authenticated;

grant execute on function public.es_verificador(), public.es_tesoreria(), public.guardar_mi_dni(text),
  public.memos_para_rendir(), public.registrar_estado_pago(uuid, public.estado_pago, text),
  public.puede_ver_detalle_memo(uuid), public.decidir_cuenta(uuid, boolean), public.revisar_cuentas(uuid),
  public.kpis_memos(date, date), public.memo_para_tesoreria(uuid), public.mi_dni(),
  public.es_beneficiario(uuid) to authenticated;
grant execute on function public.registrar_estado_pago(uuid, public.estado_pago, text),
  public.encolar_recordatorios(timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- El reloj: recordatorios cada hora. Solo donde existe pg_cron (Supabase); en
-- el Postgres de las pruebas no está y esto se salta. El envío de la bandeja
-- y la copia de INROCONTA los programa …_reloj (necesita la URL del proyecto
-- y un secreto que no van al repositorio).
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('memos-recordatorios', '5 * * * *', 'select public.encolar_recordatorios()');
  end if;
end $$;
