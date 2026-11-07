# Plan: InroScan como la app de INROPRIN para memos y rendiciones

> Decisiones del 7-nov-2026: cómo la **Plataforma de Memorandums** (diseñada en
> Apps Script por Finanzas, traspaso del 3-nov-2026) entra en InroScan, cómo se
> conecta con **INROCONTA** (Contabilidad) y qué sigue. Lo que ya estaba en
> InroScan sigue en [CONTEXTO.md](CONTEXTO.md).

---

## 1. La idea: una súper app hecha de sistemas que se hablan

No es un monolito. Cada sistema es **dueño de su tema** y los demás lo leen
por un contrato:

| Sistema | Es dueño de | Cómo lo leen los demás |
|---|---|---|
| **InroScan** (este repo) | Memos de todas las empresas y áreas; rendiciones de caja chica y viáticos | Su base Supabase, con permisos por fila. A futuro, la cola de pagos hacia InroPay (§5) |
| **INROCONTA** (`Inroprin-Apps/Inroconta`) | Lo que viene de SUNAT: padrón de RUC, lista SSCO, registro de compras (SIRE), XML/PDF, OC, centros de costo, detracciones, CONCAR | `/api/apps/<app>/datos/<padron\|ssco\|sire\|concar>` con un token por app |
| **InroPay** (Apps Script) | Análisis y Registro → RG → Programación y Pagos | Los 17 campos de `MAPEO_RG` (pendiente, §5) |
| **Bases de cuentas** (3 Google Sheets) | Cuentas bancarias de proveedores, importaciones y personal | Lectura por encabezado (pendiente, §5) |

Lo que comparten todos: **cuentas @inroprin.com con Google**, el **sistema
visual INROCONTA** (Manrope, colores por rol de la marca Roland Print) y la
regla de que **el servidor decide; la pantalla solo muestra**.

---

## 2. Decisiones (y por qué)

| Tema | Decisión | Por qué |
|---|---|---|
| Vercel | **No hace falta** | InroScan ya tiene su servidor en Supabase (base, permisos por fila, funciones, reloj). Vercel solo serviría para páginas armadas en un servidor, que esta app no necesita: es estática en GitHub Pages y funciona sin señal. Un sistema menos que mantener. |
| Apps Script → InroScan | La plataforma de memos **se construye en InroScan**, no en Apps Script | El código de Apps Script nunca corrió en Google real y no vino en el traspaso (solo documentos, vistas y la hoja de configuración). Postgres hace mejor lo que Apps Script resolvía con candados y hojas: la numeración (una transacción con candado de fila: dos emisiones a la vez nunca reciben el mismo número), los estados (funciones y triggers), la visibilidad por área (permisos por fila) y el historial. Y se comparte con las rendiciones: mismas personas, empresas, proyectos y conceptos. |
| Diseño | **INROCONTA** para toda la app | Es el sistema visual vigente del grupo. Del prototipo aprobado de memos se conserva la estructura (panel, emitir, detalle, papel, bitácora), pintada con los roles de INROCONTA. |
| INROCONTA | **Copia local** de padrón, SSCO y SIRE en la base de InroScan | Cada revisión de un memo consulta la propia base, al instante, aunque INROCONTA no responda en ese momento. La función `inroconta` la refresca a mano o una vez al día. La base v2 de INROCONTA está en otro proyecto de Supabase y es solo de servidor: la puerta correcta es su API para apps. |
| Hoja de configuración | Sus catálogos pasan a la base | Empresas (20, con código corto), áreas emisoras, los **53 tipos de memo** y sus sustentos están en la migración `…_memos_catalogos.sql`. Jefes, personas, carpetas y semillas **no** van al repositorio (es público): los carga administración en «Áreas y permisos de memos». |

### De INROCONTA se tomó, además del diseño

- **Pedir menos:** el panel trae los memos sin su cuerpo, por páginas de 1000 (lo máximo que entrega Supabase).
- **«Quién soy» una vez por consulta:** la política de memos calcula las áreas de la persona una vez y no memo por memo (lo que dejó sin responder a la base vieja de INROCONTA).
- **Filtros en la dirección:** compartir el enlace del panel muestra lo mismo.
- **Huecos de carga del tamaño del valor**, sin pantallas de «cargando».
- **Corridas:** cada vez que una función del sistema trabaja deja su fila (`corridas`), para la salud del sistema.
- **Uno detrás de otro:** la copia de INROCONTA trae padrón, SSCO y SIRE en fila, no a la vez.

---

## 3. Lo que ya está hecho (rama `claude/practical-planck-hdvk36`)

**Base** (`supabase/migrations/2026110700000*`), con sus pruebas en `supabase/pruebas/memos.sql`:

- Unidades emisoras (empresa + área), personas por correo, interárea, KPIs.
- Memos con serie **empresa + área + año** (`029-2026-FINANZAS`, técnico `INR|029-2026-FINANZAS`), que nunca se repite ni retrocede; anulado conserva su número.
- Estados: borrador → pendiente → aprobado → (enviado) → recibido; observado vuelve con el mismo número y versión +1; anulado es final. Solo cambian por `emitir_memo`, `aprobar_memo`, `observar_memo`, `anular_memo` y `dar_cargo`.
- Aprobación: jefe o suplente del área, nunca el propio emisor; si emite el jefe o el área no exige aprobación, se aprueba al emitir. Sello con código (`7F3A-91C2`).
- Visibilidad: cada área lo suyo; restringido sin interárea; confidencial (planilla) solo participantes, jefe y administración.
- Líneas de pago (los 17 campos de InroPay): RUC con dígito verificador, comprobante normalizado, duplicados contra todos los memos, **la cuenta solo enmascarada** (la base rechaza una completa), agrupar desde 15 personas, monedas.
- `revisar_memo()`: todo lo que falta, en palabras, antes de enviar.
- **Cruces con INROCONTA:** proveedor en la lista **SSCO** → no se envía; no habido o de baja → aviso; factura que **no está en el SIRE**, con **monto distinto** o **ya en CONCAR** → aviso.
- **El puente con las rendiciones:** `memo_desde_rendicion()` convierte una rendición aprobada en su memo de pago ya armado (caja chica → `RR-CCH` reposición; viáticos → `RR-VIA` reembolso de lo gastado de más).

**App** (`web/src/app/memos/`): Panel de memos, Emitir memo, el memo (editor con vista previa del papel y detalle con aprobar / observar / dar cargo / anular, y bitácora), Áreas y permisos de memos (con la tarjeta Datos de INROCONTA), y el botón «Pedir el pago con un memo» en cada rendición aprobada.

**Función** `supabase/functions/inroconta/`: trae padrón, SSCO y SIRE de INROCONTA, con sus pruebas.

---

## 4. Para ponerlo en marcha (en orden)

1. **Aplicar las 3 migraciones** en Supabase (`memos`, `…02_memos_catalogos`, `…03_inroconta`) y publicar la función `inroconta`.
2. **Token de INROCONTA** (en el repositorio de INROCONTA): `pnpm apps:token inroscan`; la entrada `inroscan=<sha256>` va a `APPS_DATOS_TOKENS` en Vercel (y redesplegar); el token y la dirección de INROCONTA van a los secretos de Supabase `INROCONTA_TOKEN` e `INROCONTA_URL`.
3. **Configurar** en «Áreas y permisos de memos»: jefe y suplente de cada área, quién emite dónde, KPIs e interárea, y la **semilla** de cada serie (Finanzas 28, Administración 213, RRHH 624, Compras Nacionales 5, COMEX 1, INROPLAS Finanzas 5 al 6-oct; confirmar con Drive).
4. **Traer ahora** los datos de INROCONTA y emitir un memo de prueba.

---

## 5. Lo que sigue

| # | Qué | Depende de |
|---|---|---|
| 1 | **PDF membretado en Drive** y legajo por memo (reusar la función `drive` y su carpeta madre) | Drive conectado (CONTEXTO §5.1) |
| 2 | **Correo**: aviso al aprobador, envío al destinatario con «Dar cargo», recordatorios cada hora (meta 3 h) con el reloj de Supabase | Decidir la cuenta que envía (delegación de dominio o una cuenta del sistema) |
| 3 | **Redacción con Gemini** (asunto + cuerpo de una vez; plantilla si falla): la clave ya está en Supabase | — |
| 4 | **Sustentos adjuntos** por memo y su lectura con IA (cruzar RUC, número y monto) | 1 |
| 5 | **Verificación de cuentas** contra las 3 bases (Nacionales, Importaciones, RRHH) y alta pendiente de verificación | Acceso de la cuenta de Drive a esas hojas |
| 6 | **Cola hacia InroPay** Análisis y Registro (17 campos de `MAPEO_RG`) y vuelta de estados de pago (registrado, programado, pagado) → la rendición pasa a repuesta/liquidada sola | Contrato con quien mantiene InroPay |
| 7 | **KPIs** (tiempos, aprobados a la primera, felicidad del cargo) y **Salud** como panel lateral (las `corridas`) | — |
| 8 | **Servicio central de correlativos** para Fianzas e InroPay Programación (un `doPost` que pide número a la base) | Fase de pruebas acordada con Finanzas |
| 9 | Planilla: memo por concepto y centro de costo, lote con observación por memo | La planilla nueva de RRHH |
| 10 | Unir `proyectos` con los **centros de costo** de INROCONTA (código `PROY-2025-189`, código CONCAR) | — |

### Decisiones que siguen abiertas

- Códigos cortos de empresa y tipos de memo marcados «propuesto».
- Quién emite y quién aprueba en cada área (lo carga administración).
- Si se importan los 204 memos históricos del respaldo de foto-grama.
- INROCONTA v2 también diseña memos de viáticos (`006_viaticos.sql`): **conviene acordar que memos y rendiciones vivan en InroScan** y que INROCONTA los lea, para no tener dos sistemas con lo mismo.
