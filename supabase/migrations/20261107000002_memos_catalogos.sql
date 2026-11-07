-- InroScan · catálogos de la Plataforma de Memorandums
--
-- Generado desde la hoja «Configuracion_Plataforma_Memos_v4» (traspaso del
-- 3-nov-2026). Solo lo que puede ir a un repositorio público: empresas,
-- áreas emisoras, tipos de memo y sustentos. Jefes, suplentes, personas,
-- carpetas de Drive y semillas de correlativo los carga administración en la
-- base (Administración › Memos), no acá.
--
-- Los códigos cortos de empresa y los tipos marcados «confirmado = false»
-- son PROPUESTOS: falta que Finanzas los confirme.

-- Empresas: las 20 de RG › DATA. INROPRIN ya existe (la usan las rendiciones).
insert into public.empresas (nombre) select 'INROPRIN' where not exists (select 1 from public.empresas where upper(nombre) = upper('INROPRIN'));
update public.empresas set codigo = 'INR' where upper(nombre) = upper('INROPRIN');
insert into public.empresas (nombre) select 'INROPLAS' where not exists (select 1 from public.empresas where upper(nombre) = upper('INROPLAS'));
update public.empresas set codigo = 'IPL' where upper(nombre) = upper('INROPLAS');
insert into public.empresas (nombre) select 'COOTEQ' where not exists (select 1 from public.empresas where upper(nombre) = upper('COOTEQ'));
update public.empresas set codigo = 'COO' where upper(nombre) = upper('COOTEQ');
insert into public.empresas (nombre) select 'CHATITEC' where not exists (select 1 from public.empresas where upper(nombre) = upper('CHATITEC'));
update public.empresas set codigo = 'CHA' where upper(nombre) = upper('CHATITEC');
insert into public.empresas (nombre) select 'CIVED' where not exists (select 1 from public.empresas where upper(nombre) = upper('CIVED'));
update public.empresas set codigo = 'CIV' where upper(nombre) = upper('CIVED');
insert into public.empresas (nombre) select 'PAIMARKET' where not exists (select 1 from public.empresas where upper(nombre) = upper('PAIMARKET'));
update public.empresas set codigo = 'PAI' where upper(nombre) = upper('PAIMARKET');
insert into public.empresas (nombre) select 'ECORCUETO' where not exists (select 1 from public.empresas where upper(nombre) = upper('ECORCUETO'));
update public.empresas set codigo = 'ECO' where upper(nombre) = upper('ECORCUETO');
insert into public.empresas (nombre) select 'GECOR' where not exists (select 1 from public.empresas where upper(nombre) = upper('GECOR'));
update public.empresas set codigo = 'GEC' where upper(nombre) = upper('GECOR');
insert into public.empresas (nombre) select 'CONSORCIO TALLERES ESPECIALIZADOS I' where not exists (select 1 from public.empresas where upper(nombre) = upper('CONSORCIO TALLERES ESPECIALIZADOS I'));
update public.empresas set codigo = 'CTE' where upper(nombre) = upper('CONSORCIO TALLERES ESPECIALIZADOS I');
insert into public.empresas (nombre) select 'CONSORCIO INROPRIN - BTD' where not exists (select 1 from public.empresas where upper(nombre) = upper('CONSORCIO INROPRIN - BTD'));
update public.empresas set codigo = 'CIB' where upper(nombre) = upper('CONSORCIO INROPRIN - BTD');
insert into public.empresas (nombre) select 'CONSORCIO BTD - INROPRIN' where not exists (select 1 from public.empresas where upper(nombre) = upper('CONSORCIO BTD - INROPRIN'));
update public.empresas set codigo = 'CBI' where upper(nombre) = upper('CONSORCIO BTD - INROPRIN');
insert into public.empresas (nombre) select 'CONSORCIO BTD - INROPLAS' where not exists (select 1 from public.empresas where upper(nombre) = upper('CONSORCIO BTD - INROPLAS'));
update public.empresas set codigo = 'CBP' where upper(nombre) = upper('CONSORCIO BTD - INROPLAS');
insert into public.empresas (nombre) select 'CONSORCIO INROPRIN - INROPLAS 1' where not exists (select 1 from public.empresas where upper(nombre) = upper('CONSORCIO INROPRIN - INROPLAS 1'));
update public.empresas set codigo = 'CI1' where upper(nombre) = upper('CONSORCIO INROPRIN - INROPLAS 1');
insert into public.empresas (nombre) select 'CONSORCIO INROPRIN - INROPLAS 2' where not exists (select 1 from public.empresas where upper(nombre) = upper('CONSORCIO INROPRIN - INROPLAS 2'));
update public.empresas set codigo = 'CI2' where upper(nombre) = upper('CONSORCIO INROPRIN - INROPLAS 2');
insert into public.empresas (nombre) select 'CONSORCIO INROPLAS - INROPRIN' where not exists (select 1 from public.empresas where upper(nombre) = upper('CONSORCIO INROPLAS - INROPRIN'));
update public.empresas set codigo = 'CIL' where upper(nombre) = upper('CONSORCIO INROPLAS - INROPRIN');
insert into public.empresas (nombre) select 'CONSORCIO INROPRIN INFORMATICO 2023' where not exists (select 1 from public.empresas where upper(nombre) = upper('CONSORCIO INROPRIN INFORMATICO 2023'));
update public.empresas set codigo = 'CII' where upper(nombre) = upper('CONSORCIO INROPRIN INFORMATICO 2023');
insert into public.empresas (nombre) select 'CONSORCIO CIENCIA Y LABORATORIOS' where not exists (select 1 from public.empresas where upper(nombre) = upper('CONSORCIO CIENCIA Y LABORATORIOS'));
update public.empresas set codigo = 'CCL' where upper(nombre) = upper('CONSORCIO CIENCIA Y LABORATORIOS');
insert into public.empresas (nombre) select 'CONSORCIO DIDACTICO 1' where not exists (select 1 from public.empresas where upper(nombre) = upper('CONSORCIO DIDACTICO 1'));
update public.empresas set codigo = 'CD1' where upper(nombre) = upper('CONSORCIO DIDACTICO 1');
insert into public.empresas (nombre) select 'CONSORCIO ROLAND PRINT - INNOVA PUCP' where not exists (select 1 from public.empresas where upper(nombre) = upper('CONSORCIO ROLAND PRINT - INNOVA PUCP'));
update public.empresas set codigo = 'CRI' where upper(nombre) = upper('CONSORCIO ROLAND PRINT - INNOVA PUCP');
insert into public.empresas (nombre) select 'CORPORACION O&M PERU' where not exists (select 1 from public.empresas where upper(nombre) = upper('CORPORACION O&M PERU'));
update public.empresas set codigo = 'COM' where upper(nombre) = upper('CORPORACION O&M PERU');

-- Áreas emisoras: una serie por empresa y área. Requieren aprobación salvo que
-- administración diga lo contrario; el jefe y el suplente se cargan en la base.
insert into public.unidades (empresa_id, codigo, nombre, modo_carpeta) select id, 'ADMINISTRACION', 'Administración', 'anio' from public.empresas where upper(nombre) = upper('INROPRIN');
insert into public.unidades (empresa_id, codigo, nombre, modo_carpeta) select id, 'FINANZAS', 'Finanzas', 'anio' from public.empresas where upper(nombre) = upper('INROPRIN');
insert into public.unidades (empresa_id, codigo, nombre, modo_carpeta) select id, 'POSTVENTA', 'Postventa', 'proyecto' from public.empresas where upper(nombre) = upper('INROPRIN');
insert into public.unidades (empresa_id, codigo, nombre, modo_carpeta) select id, 'COMEX', 'Importaciones - COMEX', 'anio' from public.empresas where upper(nombre) = upper('INROPRIN');
insert into public.unidades (empresa_id, codigo, nombre, modo_carpeta) select id, 'GESTION-PROYECTOS', 'Gestión de Proyectos', 'proyecto' from public.empresas where upper(nombre) = upper('INROPRIN');
insert into public.unidades (empresa_id, codigo, nombre, modo_carpeta) select id, 'CONTROL-GESTION', 'Control de Gestión', 'proyecto' from public.empresas where upper(nombre) = upper('INROPRIN');
insert into public.unidades (empresa_id, codigo, nombre, modo_carpeta) select id, 'COMPRAS-NACIONALES', 'Compras Nacionales', 'directo' from public.empresas where upper(nombre) = upper('INROPRIN');
insert into public.unidades (empresa_id, codigo, nombre, modo_carpeta) select id, 'COMERCIAL', 'Comercial', 'anio' from public.empresas where upper(nombre) = upper('INROPRIN');
insert into public.unidades (empresa_id, codigo, nombre, modo_carpeta) select id, 'RRHH', 'Recursos Humanos / Talento Humano', 'anio' from public.empresas where upper(nombre) = upper('INROPRIN');
insert into public.unidades (empresa_id, codigo, nombre, modo_carpeta) select id, 'FINANZAS', 'Finanzas', 'anio' from public.empresas where upper(nombre) = upper('INROPLAS');
insert into public.unidades (empresa_id, codigo, nombre, modo_carpeta) select id, 'ADMINISTRACION', 'Administración', 'anio' from public.empresas where upper(nombre) = upper('INROPLAS');

insert into public.tipos_memo (codigo, familia, nombre, area_habitual, lleva_pago, modo_lineas, agrupa_desde, pasa_analisis, confidencialidad, origen, confirmado) values
  ('RH-PLA', 'Planillas y RRHH', 'Pago de planilla (quincena / mensual)', 'RRHH', true, 'agrupado_cc', null, true, 'confidencial', 'PLATAFORMA', true),
  ('RH-PRA', 'Planillas y RRHH', 'Pago de practicantes / subvención económica', 'RRHH', true, 'agrupado_cc', null, true, 'confidencial', 'PLATAFORMA', false),
  ('RH-HON', 'Planillas y RRHH', 'Pago de locadores de servicio / honorarios (RxH)', 'RRHH', true, 'detalle', 15, true, 'restringido', 'PLATAFORMA', true),
  ('RH-HE', 'Planillas y RRHH', 'Pago de horas extras', 'RRHH', true, 'detalle', 15, true, 'restringido', 'PLATAFORMA', true),
  ('RH-VAC', 'Planillas y RRHH', 'Pago de vacaciones', 'RRHH', true, 'detalle', 15, true, 'restringido', 'PLATAFORMA', true),
  ('RH-LBS', 'Planillas y RRHH', 'Pago de LBS / liquidación', 'RRHH', true, 'detalle', 15, true, 'restringido', 'PLATAFORMA', true),
  ('RH-GRA', 'Planillas y RRHH', 'Gratificación y adelantos de gratificación', 'RRHH', true, 'detalle', 15, true, 'restringido', 'PLATAFORMA', true),
  ('RH-CTS', 'Planillas y RRHH', 'Pago de CTS', 'RRHH', true, 'detalle', 15, true, 'restringido', 'PLATAFORMA', false),
  ('RH-REI', 'Planillas y RRHH', 'Reintegros a planilla', 'RRHH', true, 'detalle', 15, true, 'restringido', 'PLATAFORMA', true),
  ('RH-EPS', 'Planillas y RRHH', 'Pago de EPS', 'RRHH', true, 'por_documento', null, true, 'normal', 'PLATAFORMA', true),
  ('RH-SEN', 'Planillas y RRHH', 'Pago de SENATI', 'RRHH', true, 'por_documento', null, true, 'normal', 'PLATAFORMA', true),
  ('RH-AFP', 'Planillas y RRHH', 'Pago de AFP / ONP', 'RRHH', true, 'por_documento', null, true, 'normal', 'PLATAFORMA', true),
  ('RH-SCT', 'Planillas y RRHH', 'Pago de SCTR', 'RRHH', true, 'por_documento', null, true, 'normal', 'PLATAFORMA', true),
  ('RH-SVL', 'Planillas y RRHH', 'Seguro vida ley', 'RRHH', true, 'por_documento', null, true, 'normal', 'PLATAFORMA', false),
  ('RH-RJ', 'Planillas y RRHH', 'Retenciones judiciales', 'RRHH', true, 'detalle', 15, true, 'restringido', 'PLATAFORMA', true),
  ('RH-UTI', 'Planillas y RRHH', 'Pago de utilidades', 'RRHH', true, 'detalle', 15, true, 'restringido', 'PLATAFORMA', false),
  ('RH-SUB', 'Planillas y RRHH', 'Subsidios y descansos médicos', 'RRHH', true, 'detalle', 15, true, 'confidencial', 'PLATAFORMA', false),
  ('RH-MOV', 'Planillas y RRHH', 'Pago de movilidad (fija, chofer, operarios, proyectos)', 'RRHH', true, 'detalle', 15, true, 'normal', 'PLATAFORMA', true),
  ('RH-CES', 'Planillas y RRHH', 'Días trabajados y LBS por cese', 'RRHH', true, 'detalle', 15, true, 'restringido', 'PLATAFORMA', true),
  ('RH-CVA', 'Planillas y RRHH', 'Compra de vacaciones', 'RRHH', true, 'detalle', 15, true, 'restringido', 'PLATAFORMA', true),
  ('RH-REM', 'Planillas y RRHH', 'Reembolso de movilidad o gastos de personal', 'RRHH', true, 'detalle', 15, true, 'normal', 'PLATAFORMA', true),
  ('RH-BIE', 'Planillas y RRHH', 'Gastos de bienestar (tortas, bocaditos)', 'RRHH', true, 'por_documento', null, true, 'normal', 'PLATAFORMA', true),
  ('RH-MED', 'Planillas y RRHH', 'Vigilancia y evaluación médica', 'RRHH', true, 'por_documento', null, true, 'normal', 'PLATAFORMA', true),
  ('RH-CAP', 'Planillas y RRHH', 'Capacitación (cursos)', 'RRHH', true, 'por_documento', null, true, 'normal', 'PLATAFORMA', true),
  ('FZ-EMI', 'Fianzas y garantías', 'Emisión de fianza', 'FINANZAS', true, 'por_documento', null, true, 'normal', 'FIANZAS', true),
  ('FZ-REN', 'Fianzas y garantías', 'Renovación de fianza', 'FINANZAS', true, 'por_documento', null, true, 'normal', 'FIANZAS', true),
  ('FZ-PRI', 'Fianzas y garantías', 'Pago de primas de fianza', 'FINANZAS', true, 'por_documento', null, true, 'normal', 'FIANZAS', true),
  ('FZ-DEV', 'Fianzas y garantías', 'Devolución / cancelación de fianza', 'FINANZAS', false, 'sin_pago', null, false, 'normal', 'FIANZAS', false),
  ('FZ-CGA', 'Fianzas y garantías', 'Pago por contragarantías', 'FINANZAS', true, 'por_documento', null, true, 'normal', 'PLATAFORMA', true),
  ('FZ-REC', 'Fianzas y garantías', 'Recálculo de prima / contragarantía', 'FINANZAS', true, 'por_documento', null, true, 'normal', 'FIANZAS', true),
  ('PV-SER', 'Proveedores y servicios', 'Pago a proveedor – servicios', 'VARIAS', true, 'por_documento', null, true, 'normal', 'PLATAFORMA', true),
  ('PV-BIE', 'Proveedores y servicios', 'Pago a proveedor – bienes', 'VARIAS', true, 'por_documento', null, true, 'normal', 'PLATAFORMA', true),
  ('PV-ANT', 'Proveedores y servicios', 'Anticipo a proveedor', 'VARIAS', true, 'por_documento', null, true, 'normal', 'PLATAFORMA', false),
  ('PV-REC', 'Proveedores y servicios', 'Servicios recurrentes', 'VARIAS', true, 'por_documento', null, true, 'normal', 'PLATAFORMA', false),
  ('PV-VAL', 'Proveedores y servicios', 'Valorizaciones', 'VARIAS', true, 'por_documento', null, true, 'normal', 'PLATAFORMA', false),
  ('PV-DEV', 'Proveedores y servicios', 'Devolución por doble pago', 'VARIAS', true, 'por_documento', null, true, 'normal', 'PLATAFORMA', true),
  ('TR-SUN', 'Tributos y aportes', 'Pago SUNAT', 'FINANZAS', true, 'por_documento', null, true, 'normal', 'PLATAFORMA', false),
  ('TR-ESS', 'Tributos y aportes', 'Pago EsSalud', 'FINANZAS', true, 'por_documento', null, true, 'normal', 'PLATAFORMA', false),
  ('TR-SEG', 'Tributos y aportes', 'Seguros y pólizas', 'FINANZAS', true, 'por_documento', null, true, 'normal', 'PLATAFORMA', false),
  ('RR-CCH', 'Rendiciones y reembolsos', 'Devolución de entrega a rendir / caja chica', 'VARIAS', true, 'detalle', 15, true, 'normal', 'PLATAFORMA', true),
  ('RR-VIA', 'Rendiciones y reembolsos', 'Viáticos', 'VARIAS', true, 'detalle', 15, true, 'normal', 'PLATAFORMA', false),
  ('RR-REE', 'Rendiciones y reembolsos', 'Reembolso por compras', 'VARIAS', true, 'detalle', 15, true, 'normal', 'PLATAFORMA', true),
  ('FN-PRE', 'Financieros y entre empresas', 'Préstamo entre relacionadas', 'FINANZAS', true, 'por_documento', null, true, 'normal', 'INROPAY-PROG', true),
  ('FN-DEV', 'Financieros y entre empresas', 'Devolución de préstamo entre relacionadas', 'FINANZAS', true, 'por_documento', null, true, 'normal', 'INROPAY-PROG', true),
  ('FN-TRF', 'Financieros y entre empresas', 'Transferencia intercompany', 'FINANZAS', true, 'por_documento', null, true, 'normal', 'PLATAFORMA', false),
  ('FN-LEA', 'Financieros y entre empresas', 'Leasing e intereses', 'FINANZAS', true, 'por_documento', null, true, 'normal', 'PLATAFORMA', false),
  ('SA-COM', 'Solicitudes administrativas', 'Solicitud de compra', 'VARIAS', false, 'sin_pago', null, false, 'normal', 'PLATAFORMA', false),
  ('SA-AUT', 'Solicitudes administrativas', 'Autorización de gasto', 'VARIAS', false, 'sin_pago', null, false, 'normal', 'PLATAFORMA', false),
  ('SA-ALB', 'Solicitudes administrativas', 'Altas y bajas', 'VARIAS', false, 'sin_pago', null, false, 'restringido', 'PLATAFORMA', false),
  ('IN-COM', 'Informativos', 'Comunicado', 'VARIAS', false, 'sin_pago', null, false, 'normal', 'PLATAFORMA', true),
  ('IN-DIS', 'Informativos', 'Disposición', 'VARIAS', false, 'sin_pago', null, false, 'normal', 'PLATAFORMA', true),
  ('IN-BAN', 'Informativos', 'Cambio de datos bancarios', 'VARIAS', false, 'sin_pago', null, false, 'restringido', 'PLATAFORMA', false),
  ('IN-OTR', 'Informativos', 'Otros / no catalogado', 'VARIAS', false, 'sin_pago', null, false, 'normal', 'PLATAFORMA', true);

insert into public.sustentos_tipo (tipo_codigo, documento, nivel, condicion, umbral, validacion_ia, confirmado) values
  ('FZ-PRI', 'Factura de la aseguradora', 'obligatorio', '', null, 'Cruzar RUC, N° de factura y monto con lo digitado', true),
  ('FZ-PRI', 'Carta fianza o endoso', 'obligatorio', '', null, 'Cruzar N° de fianza, monto asegurado y vigencia', true),
  ('FZ-REN', 'Factura de la aseguradora', 'obligatorio', '', null, 'Cruzar RUC, N° de factura y monto', true),
  ('FZ-REN', 'Carta fianza o endoso', 'obligatorio', '', null, 'Cruzar N° de fianza, monto y vigencia', true),
  ('FZ-EMI', 'Factura de la aseguradora', 'obligatorio', '', null, 'Cruzar RUC, N° de factura y monto', false),
  ('FZ-EMI', 'Carta fianza o endoso', 'obligatorio', '', null, 'Cruzar N° de fianza y monto', false),
  ('RH-VAC', 'Cálculo de vacaciones (Excel plantilla estándar)', 'obligatorio', '', null, 'Totales del Excel = total del memo; DNI y montos coherentes', true),
  ('RH-VAC', 'Solicitud o papeleta de vacaciones aprobada', 'condicional', 'Si la política del área lo exige', null, 'Fechas y persona coinciden con el cálculo', false),
  ('RH-PLA', 'Excel de planilla (plantilla estándar)', 'obligatorio', '', null, 'La plataforma separa administrativos y proyectos y verifica que los totales cuadren', true),
  ('RH-PLA', 'Plantilla de pagos masivos del banco', 'condicional', 'Si el pago se hará por archivo masivo', null, 'Total del archivo = total del memo', true),
  ('RH-PLA', 'Montos llenados por RRHH en plantilla estándar (concepto x centro de costo)', 'condicional', 'Transitorio: si el Excel actual no se puede leer', null, 'Suma por centro de costo = total del memo', false),
  ('PV-SER', 'Comprobante (factura, boleta o RxH)', 'obligatorio', '', null, 'Cruzar RUC, N° de comprobante, fecha y monto', true),
  ('PV-SER', 'Acta de conformidad', 'obligatorio', '', null, 'Debe estar firmada y referir al mismo servicio', true),
  ('PV-SER', 'Contrato firmado', 'condicional', 'Si el monto del servicio supera el umbral', 3000, 'Partes y monto coherentes con el comprobante', true),
  ('PV-SER', 'Cotización', 'condicional', 'Solo si es imposible obtener comprobante', null, 'Proveedor y monto coherentes', true),
  ('PV-BIE', 'Comprobante (factura o boleta)', 'obligatorio', '', null, 'Cruzar RUC, N° de comprobante, fecha y monto', true),
  ('PV-BIE', 'Guía de remisión', 'obligatorio', '', null, 'Cruzar proveedor y fecha de entrega', true);
