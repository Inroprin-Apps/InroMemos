-- Pruebas del esquema: quién ve qué, qué se puede cambiar en cada estado y que
-- nada se borre. Corre después de las migraciones (ver correr.sh).
--
-- Personas:
--   ana@   rinde sus memos
--   beto@  rinde los suyos y no debe ver nada de Ana
--   carla@ es administración
--   dario@ administra la caja chica 03
--
-- Cada bloque cambia de identidad con «reset role; select pruebas.como(…)».

\set ON_ERROR_STOP on
\set QUIET on
-- El resultado de cada verificación es una fila vacía: se descarta. Los
-- avisos «ok» y los \echo siguen saliendo.
\o /dev/null
set client_min_messages = notice;

create schema pruebas;
grant usage on schema pruebas to public;

create function pruebas.ok(cumple boolean, que text) returns void language plpgsql as $$
begin
  if cumple is not true then
    raise exception 'FALLA: %', que;
  end if;
  raise notice 'ok    %', que;
end $$;

-- Ejecuta y exige que falle; muestra el motivo para ver que falló por lo que se esperaba.
create function pruebas.falla(sentencia text, que text) returns void language plpgsql as $$
begin
  begin
    execute sentencia;
  exception when others then
    raise notice 'ok    % — %', que, sqlerrm;
    return;
  end;
  raise exception 'FALLA (tenía que fallar): %', que;
end $$;

create function pruebas.como(correo text) returns void language plpgsql as $$
declare
  uid uuid;
begin
  select id into uid from auth.users where lower(email) = lower(correo);
  if uid is null then
    raise exception 'no existe la cuenta %', correo;
  end if;
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'email', correo)::text, false);
  perform set_config('role', 'authenticated', false);
end $$;

create function pruebas.como_sistema() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role": "service_role"}', false);
  perform set_config('role', 'service_role', false);
end $$;

create function pruebas.como_anonimo() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role": "anon"}', false);
  perform set_config('role', 'anon', false);
end $$;

\echo '\n· Alta de personas'

insert into auth.users (email, raw_user_meta_data) values
  ('ana@inroprin.com',   '{"full_name": "Ana Prueba"}'),
  ('Beto@INROPRIN.com',  '{}'),
  ('carla@inroprin.com', '{}'),
  ('dario@inroprin.com', '{}');

select pruebas.ok((select nombre = 'Ana Prueba' from personas where correo = 'ana@inroprin.com'),
  'al primer ingreso se crea la persona con su nombre de Google');
select pruebas.ok(exists (select 1 from personas where correo = 'beto@inroprin.com'),
  'el correo se guarda en minúsculas');
select pruebas.falla($$insert into auth.users (email) values ('intruso@gmail.com')$$,
  'una cuenta de otro dominio no entra');

update personas set es_administracion = true where correo = 'carla@inroprin.com';

select id as ana from personas where correo = 'ana@inroprin.com' \gset
select id as beto from personas where correo = 'beto@inroprin.com' \gset
select id as carla from personas where correo = 'carla@inroprin.com' \gset
select id as dario from personas where correo = 'dario@inroprin.com' \gset
select id as empresa from empresas where nombre = 'INROPRIN' \gset
select id as contabilidad from areas where nombre = 'CONTABILIDAD' \gset

\echo '\n· Ana crea su memo'

reset role; select pruebas.como('ana@inroprin.com');

insert into rendiciones (tipo, numero_memo, empresa_id, responsable_id, monto, observacion)
values ('memo', ' 675-2026 ', :empresa, :'ana', 334, 'me lo apruebo yo')
returning id as memo_ana \gset

select pruebas.ok((
  select estado = 'abierta' and version = 0 and numero_memo = '675-2026'
         and no_sustentan = '{DJ}' and observacion = ''
    from rendiciones where id = :'memo_ana'),
  'nace abierta, con el número normalizado, la DJ fuera del sustento y sin observaciones propias');

select pruebas.falla(format($$
  insert into rendiciones (tipo, numero_memo, empresa_id, responsable_id, monto)
  values ('memo', '675-2026', %s, %L, 10)$$, :empresa, :'ana'),
  'el mismo memo no se rinde dos veces');

select pruebas.falla(format($$
  insert into rendiciones (tipo, numero_memo, empresa_id, responsable_id, monto)
  values ('memo', '999-2026', %s, %L, 10)$$, :empresa, :'beto'),
  'no se puede crear un memo a nombre de otro');

insert into archivos (rendicion_id, client_id, ruta, huella, tipo_mime, tamano, estado_lectura, drive_id)
values (:'memo_ana', gen_random_uuid(), :'memo_ana' || '/a.jpg', repeat('a', 64), 'image/jpeg', 1000, 'leido', 'trampa')
returning id as archivo_ana \gset

select pruebas.ok((
  select estado_lectura = 'pendiente' and drive_id is null and subido_por = :'ana'
    from archivos where id = :'archivo_ana'),
  'lo que sube una persona entra pendiente de leer y a su nombre, aunque mande otra cosa');

select pruebas.falla(format($$
  insert into archivos (rendicion_id, client_id, ruta, huella, tipo_mime, tamano)
  values (%L, gen_random_uuid(), %L, %L, 'image/jpeg', 1000)$$,
  :'memo_ana', :'memo_ana' || '/b.jpg', repeat('a', 64)),
  'la misma foto dos veces en la misma rendición no entra');

insert into comprobantes (rendicion_id, archivo_id, client_id, total, observacion)
values (:'memo_ana', :'archivo_ana', gen_random_uuid(), 25.50, 'aprobado')
returning id as comp_ana \gset

select pruebas.ok((
  select observacion = '' and creado_por = :'ana' from comprobantes where id = :'comp_ana'),
  'la persona no se escribe observaciones de administración');

select pruebas.falla(format($$update comprobantes set via = 'ia' where id = %L$$, :'comp_ana'),
  'cómo se leyó lo anota solo el procesador');
select pruebas.falla(format($$update archivos set estado_lectura = 'leido' where id = %L$$, :'archivo_ana'),
  'la persona no cambia el estado de lectura de sus archivos');
select pruebas.falla(format($$delete from comprobantes where id = %L$$, :'comp_ana'),
  'nadie borra comprobantes: se descartan');
select pruebas.falla(format($$update rendiciones set observacion = 'x' where id = %L$$, :'memo_ana'),
  'la persona no escribe observaciones en su rendición');
select pruebas.falla(format($$update rendiciones set estado = 'aprobada' where id = %L$$, :'memo_ana'),
  'la persona no se aprueba sola');
update rendiciones set version = 9 where id = :'memo_ana';
select pruebas.ok((select version = 0 from rendiciones where id = :'memo_ana'),
  'la versión la lleva el sistema: tocarla a mano no la cambia');

with cambio as (update personas set es_administracion = true where id = auth.uid() returning 1)
select pruebas.ok((select count(*) from cambio) = 0, 'nadie se nombra administración');

\echo '\n· Beto no ve nada de Ana'

reset role; select pruebas.como('beto@inroprin.com');

insert into rendiciones (tipo, numero_memo, empresa_id, responsable_id, monto)
values ('memo', '800-2026', :empresa, :'beto', 100)
returning id as memo_beto \gset

select pruebas.ok((select count(*) from rendiciones) = 1, 've solo su propio memo');
select pruebas.ok((select count(*) from comprobantes) = 0, 'no ve los comprobantes de Ana');
select pruebas.ok((select count(*) from archivos) = 0, 'no ve los archivos de Ana');
select pruebas.ok((select count(*) from historial where rendicion_id = :'memo_ana') = 0,
  'no ve el historial de Ana');

with cambio as (update comprobantes set total = 0 where id = :'comp_ana' returning 1)
select pruebas.ok((select count(*) from cambio) = 0, 'no puede cambiar un comprobante de Ana');

select pruebas.falla(format($$
  insert into comprobantes (rendicion_id, client_id, total) values (%L, gen_random_uuid(), 1)$$,
  :'memo_ana'),
  'no puede agregar comprobantes a la rendición de Ana');

\echo '\n· Ana envía: ya no edita'

reset role; select pruebas.como('ana@inroprin.com');

update rendiciones set estado = 'enviada' where id = :'memo_ana';
select pruebas.ok((
  select version = 1 and enviada_en is not null from rendiciones where id = :'memo_ana'),
  'el envío sube la versión a 1');

with cambio as (update comprobantes set total = 99 where id = :'comp_ana' returning 1)
select pruebas.ok((select count(*) from cambio) = 0, 'enviada, sus comprobantes quedan bloqueados');

select pruebas.falla(format($$update rendiciones set numero_memo = 'OTRO' where id = %L$$, :'memo_ana'),
  'enviada, la cabecera queda bloqueada');
select pruebas.falla(format($$update rendiciones set estado = 'abierta' where id = %L$$, :'memo_ana'),
  'no se puede «desenviar»');

\echo '\n· Carla observa, Ana corrige y reenvía, Carla aprueba'

reset role; select pruebas.como('carla@inroprin.com');

select pruebas.ok((select count(*) from rendiciones) >= 2, 'administración ve las rendiciones de todos');

update rendiciones set estado = 'observada', observacion = 'Falta el RUC de la boleta'
 where id = :'memo_ana';

reset role; select pruebas.como('ana@inroprin.com');

with cambio as (update comprobantes set total = 26 where id = :'comp_ana' returning 1)
select pruebas.ok((select count(*) from cambio) = 1, 'observada, la persona vuelve a editar');

update rendiciones set estado = 'enviada' where id = :'memo_ana';
select pruebas.ok((select version = 2 from rendiciones where id = :'memo_ana'), 'el reenvío es la versión 2');

reset role; select pruebas.como('carla@inroprin.com');

update rendiciones set estado = 'aprobada' where id = :'memo_ana';

with cambio as (update comprobantes set total = 1 where id = :'comp_ana' returning 1)
select pruebas.ok((select count(*) from cambio) = 0, 'aprobada, ni administración la edita');

select pruebas.falla(format($$update rendiciones set estado = 'repuesta' where id = %L$$, :'memo_ana'),
  'un memo no se «repone»: se liquida');
update rendiciones set estado = 'liquidada' where id = :'memo_ana';
select pruebas.ok((select estado = 'liquidada' from rendiciones where id = :'memo_ana'), 'el memo se liquida');

\echo '\n· Historial'

reset role; select pruebas.como('ana@inroprin.com');

select pruebas.ok(exists (
  select 1 from historial
   where fila = :'comp_ana' and actor = :'ana' and accion = 'cambiar'
     and cambios -> 'total' ->> 'antes' = '25.50' and cambios -> 'total' ->> 'despues' = '26.00'),
  'el cambio de importe queda con su autor, el antes y el después');
select pruebas.ok(exists (
  select 1 from historial
   where fila = :'memo_ana' and actor = :'carla' and cambios -> 'estado' ->> 'despues' = 'aprobada'),
  'la aprobación queda con quién aprobó');
select pruebas.falla(format($$
  insert into historial (rendicion_id, tabla, fila, accion, cambios) values (%L, 'x', %L, 'crear', '{}')$$,
  :'memo_ana', :'memo_ana'),
  'nadie escribe el historial a mano');

\echo '\n· Caja chica'

reset role; select pruebas.como('carla@inroprin.com');

insert into cajas (numero, empresa_id, area_id, administrador_id, monto_fondo)
values ('03', :empresa, :contabilidad, :'dario', 2000)
returning id as caja \gset

reset role; select pruebas.como('ana@inroprin.com');

select pruebas.ok((select count(*) from cajas) = 0, 'quien no administra la caja no la ve');
select pruebas.falla(format($$
  insert into rendiciones (tipo, caja_id, empresa_id, responsable_id, monto)
  values ('caja', %s, %s, %L, 1)$$, :caja, :empresa, :'ana'),
  'solo el administrador de la caja abre sus reposiciones');

reset role; select pruebas.como('dario@inroprin.com');

insert into rendiciones (tipo, caja_id, empresa_id, responsable_id, monto)
values ('caja', :caja, :empresa, :'dario', 99999)
returning id as repo1 \gset

select pruebas.ok((
  select correlativo = 1 and monto = 2000 and responsable_id = :'dario'
    from rendiciones where id = :'repo1'),
  'la reposición se numera sola y toma el fondo de la caja, no lo que se mande');

select pruebas.falla(format($$
  insert into rendiciones (tipo, caja_id, empresa_id, responsable_id, monto)
  values ('caja', %s, %s, %L, 1)$$, :caja, :empresa, :'dario'),
  'una caja tiene un solo ciclo en curso');

insert into archivos (rendicion_id, client_id, ruta, huella, tipo_mime, tamano)
values (:'repo1', gen_random_uuid(), :'repo1' || '/c.jpg', repeat('c', 64), 'image/jpeg', 2000)
returning id as archivo_caja \gset

insert into comprobantes (rendicion_id, archivo_id, client_id, solicitante, area_id, total)
values (:'repo1', :'archivo_caja', gen_random_uuid(), 'Rosa', :contabilidad, 40);

update rendiciones set estado = 'enviada' where id = :'repo1';

reset role; select pruebas.como('carla@inroprin.com');

update rendiciones set estado = 'aprobada' where id = :'repo1';
select pruebas.falla(format($$update rendiciones set estado = 'liquidada' where id = %L$$, :'repo1'),
  'una caja no se «liquida»: se repone');
update rendiciones set estado = 'repuesta' where id = :'repo1';

reset role; select pruebas.como('dario@inroprin.com');

insert into rendiciones (tipo, caja_id, empresa_id, responsable_id, monto)
values ('caja', :caja, :empresa, :'dario', 1)
returning id as repo2 \gset

select pruebas.ok((select correlativo = 2 from rendiciones where id = :'repo2'),
  'repuesta la anterior, la siguiente es la reposición 2');

\echo '\n· Catálogos'

reset role; select pruebas.como('ana@inroprin.com');

select pruebas.ok((select count(*) from areas) = 16, 'las 16 áreas están cargadas');
select pruebas.ok((select count(*) from tipos_comprobante) = 9, 'los 9 tipos de comprobante están cargados');
select pruebas.falla($$insert into proyectos (nombre) values ('PROYECTO PROPIO')$$,
  'una persona no crea proyectos');
select pruebas.falla($$delete from proyectos$$, 'nadie borra proyectos: se desactivan');

reset role; select pruebas.como('carla@inroprin.com');

insert into proyectos (nombre) values ('PAQ 09 CHINA CIVIL');
select pruebas.falla($$insert into proyectos (nombre) values ('paq 02 china civil')$$,
  'el mismo proyecto con otras mayúsculas no se duplica');

\echo '\n· Catálogos: proponer un proyecto desde la hoja'

reset role; select pruebas.como('ana@inroprin.com');
select proponer_proyecto('  taller   nuevo  puno ') as propuesto \gset
select pruebas.ok((select nombre = 'TALLER NUEVO PUNO' and not confirmado and activo and propuesto_por = auth.uid()
                     from proyectos where id = :propuesto),
  'quien rinde propone un proyecto que falta: queda en mayúsculas, por confirmar y a su nombre');
select pruebas.ok(proponer_proyecto('Taller nuevo PUNO') = :propuesto, 'proponer uno que ya existe devuelve el mismo, no lo duplica');
select pruebas.ok(proponer_proyecto('paq 02 china civil') = (select id from proyectos where nombre = 'PAQ 02 CHINA CIVIL'),
  'ni duplica uno confirmado');
select pruebas.falla($$select proponer_proyecto('ab')$$, 'un nombre de dos letras no es un proyecto');
update proyectos set confirmado = true where id = :propuesto;
select pruebas.ok((select not confirmado from proyectos where id = :propuesto), 'quien propone no se lo confirma solo');
select proponer_proyecto('PROPUESTO 2'); select proponer_proyecto('PROPUESTO 3');
select proponer_proyecto('PROPUESTO 4'); select proponer_proyecto('PROPUESTO 5');
select pruebas.falla($$select proponer_proyecto('PROPUESTO 6')$$, 'a lo más cinco propuestas esperando confirmación por persona');

reset role; select pruebas.como('carla@inroprin.com');
update proyectos set confirmado = true where id = :propuesto;
select pruebas.ok((select confirmado from proyectos where id = :propuesto), 'administración lo confirma');
update proyectos set activo = false where nombre in ('PROPUESTO 2', 'PROPUESTO 3', 'PROPUESTO 4', 'PROPUESTO 5');
select proponer_proyecto('PROYECTO DE ADMINISTRACION') as de_admin \gset
select pruebas.ok((select confirmado from proyectos where id = :de_admin), 'lo que agrega administración nace confirmado');

reset role; select pruebas.como('ana@inroprin.com');
select pruebas.falla($$select proponer_proyecto('propuesto 2')$$, 'uno desactivado no se vuelve a proponer');
select pruebas.ok(proponer_proyecto('OTRO MAS') > 0, 'confirmados o desactivados los anteriores, puede proponer otro');
reset role; select pruebas.como('carla@inroprin.com');
update proyectos set activo = false where nombre in ('OTRO MAS', 'PROYECTO DE ADMINISTRACION', 'TALLER NUEVO PUNO');

\echo '\n· Procesador (sistema)'

reset role; select pruebas.como_sistema();

select pruebas.ok((select count(*) from tomar_pendientes(10)) = 2,
  'el procesador toma lo pendiente');
select pruebas.ok((select count(*) from tomar_pendientes(10)) = 0,
  'lo que ya está tomado no lo agarra otra corrida');

update archivos set estado_lectura = 'leido', leido_en = now() where id = :'archivo_ana';
update comprobantes set via = 'ocr', confianza = '{"total": 0.97}' where id = :'comp_ana';
select pruebas.ok((select via = 'ocr' from comprobantes where id = :'comp_ana'),
  'el procesador sí anota cómo se leyó, incluso en una rendición cerrada');

reset role; select pruebas.como('ana@inroprin.com');
select pruebas.falla($$select * from tomar_pendientes(1)$$, 'una persona no toma trabajo del procesador');

\echo '\n· Repetidos'

insert into rendiciones (tipo, numero_memo, empresa_id, responsable_id, monto)
values ('memo', '700-2026', :empresa, :'ana', 100) returning id as memo700 \gset
insert into rendiciones (tipo, numero_memo, empresa_id, responsable_id, monto)
values ('memo', '701-2026', :empresa, :'ana', 100) returning id as memo701 \gset

insert into comprobantes (rendicion_id, client_id, ruc, serie, numero, total)
values (:'memo700', gen_random_uuid(), '20123456789', 'F001', '6384', 50),
       (:'memo701', gen_random_uuid(), '20123456789', 'F001', '006384', 50);

select pruebas.ok((select count(*) from comprobantes_repetidos) = 2,
  'F001-6384 y F001-006384 del mismo RUC en dos rendiciones se marcan como repetidos');
select pruebas.falla(format($$
  insert into comprobantes (rendicion_id, client_id, ruc) values (%L, gen_random_uuid(), '12345')$$,
  :'memo700'),
  'un RUC mal formado no entra');

reset role; select pruebas.como('beto@inroprin.com');
select pruebas.ok((select count(*) from comprobantes_repetidos) = 0, 'Beto no ve repetidos ajenos');

\echo '\n· Imágenes en Storage'

reset role; select pruebas.como('ana@inroprin.com');

insert into storage.objects (bucket_id, name) values ('comprobantes', :'memo700' || '/x.jpg');
select pruebas.ok(true, 'sube una imagen a su rendición abierta');
select pruebas.falla(format($$insert into storage.objects (bucket_id, name) values ('comprobantes', %L)$$,
  :'memo_ana' || '/y.jpg'),
  'no sube imágenes a una rendición cerrada');
select pruebas.falla(format($$insert into storage.objects (bucket_id, name) values ('comprobantes', %L)$$,
  :'memo_beto' || '/z.jpg'),
  'no sube imágenes a la rendición de otro');
select pruebas.falla($$insert into storage.objects (bucket_id, name) values ('comprobantes', 'basura/z.jpg')$$,
  'una ruta que no es de ninguna rendición no entra');

reset role; select pruebas.como('beto@inroprin.com');
select pruebas.ok((select count(*) from storage.objects) = 0, 'Beto no ve las imágenes de Ana');

\echo '\n· Persona desactivada'

reset role; select pruebas.como('carla@inroprin.com');
update personas set activo = false where id = :'beto';

reset role; select pruebas.como('beto@inroprin.com');
select pruebas.ok((select count(*) from rendiciones) = 0, 'desactivada, ya no ve ni lo suyo');
select pruebas.ok((select count(*) from areas) = 0, 'desactivada, tampoco los catálogos');

\echo '\n· Sin sesión'

reset role; select pruebas.como_anonimo();
select pruebas.falla($$select * from rendiciones$$, 'sin sesión no se lee ninguna tabla');
select pruebas.falla($$select * from areas$$, 'ni los catálogos');

reset role;
\echo '\n· Drive: lo que escribe el sistema'

reset role; select pruebas.como('ana@inroprin.com');
select pruebas.falla($$select * from integraciones$$, 'una persona no lee la conexión con Drive');
select pruebas.falla($$insert into integraciones values ('drive', '{}')$$, 'ni la escribe');

reset role; select pruebas.como('carla@inroprin.com');
select pruebas.falla($$select * from integraciones$$, 'ni administración: solo el sistema');

reset role; select pruebas.como_sistema();
insert into integraciones values ('drive', '{"cuenta": "prueba"}');
select pruebas.ok((select datos ->> 'cuenta' = 'prueba' from integraciones where clave = 'drive'), 'el sistema guarda la conexión');
update rendiciones set drive_carpeta_id = 'carpeta-1' where id = :'memo700';

reset role; select pruebas.como('ana@inroprin.com');
update rendiciones set drive_carpeta_id = 'otra', fecha_solicitud = '2026-10-02' where id = :'memo700';
select pruebas.ok((select fecha_solicitud = '2026-10-02' and drive_carpeta_id = 'carpeta-1' from rendiciones where id = :'memo700'),
  'una persona edita su memo pero no cambia su carpeta de Drive');

\echo '\nTodo en orden\n'

