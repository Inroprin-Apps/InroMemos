# InroScan — contexto del proyecto

> Documento de traspaso: para que cualquier persona, o cualquier asistente en
> otra sesión, pueda retomar el proyecto sin reconstruir la conversación que lo
> produjo. Contiene el problema, las decisiones con su razón, lo aprendido con
> documentos reales y lo que queda abierto.
>
> Última actualización: 7 de noviembre de 2026. La plataforma de memos y la
> conexión con INROCONTA están en [PLAN.md](PLAN.md).

---

## 1. Qué es

El sistema de rendiciones de INROPRIN (= Roland Print = Industria Roland
Print). Dos procesos con los mismos campos:

- **Caja chica:** la registra su **administrador**. El número de caja es fijo;
  cada ciclo es una **reposición** con correlativo («Caja 03 · Reposición 7»)
  y su fecha de solicitud.
- **Memo de viáticos:** quien viajó suma sus gastos contra lo recibido hasta
  cerrar y enviar.

Ambos terminan en la misma hoja de **14 columnas**: N° DE CAJA, FECHA DE
SOLICITUD, EMPRESA, ADMINISTRADOR, FECHA, TIPO DE COMPROBANTE, N° DE
COMPROBANTE, PROVEEDOR, PROYECTO, AREA DEL SOLICITANTE, SOLICITANTE, CONCEPTO,
DESCRIPCION-MOTIVO, TOTAL INC IGV. *El formato del memo puede cambiar más
adelante: está pendiente revisarlo.*

**INRO VIÁTICOS quedó descontinuado y no es referencia.** InroScan dejó de ser
un puente temporal: es *el* sistema.

### Historia breve

- **Hasta octubre de 2026** existió una primera InroScan: estática, sin base de
  datos, leyendo en el navegador con OCR y una clave de Gemini por persona, y
  guardando en Drive y Sheets como la persona. Su código se retiró el
  26-oct-2026; está en el historial de git (último commit con ella:
  `f0c3fcc`). Lo que se aprendió con ella está en §6.
- **26-oct-2026:** se diseñó y construyó la actual (Next.js + Supabase), se
  cerró el diseño con barra lateral en un lienzo aprobado por el usuario y se
  retiró la anterior. `/inroscan/` redirige a `/InroScan/web/`.
- **28-oct-2026:** el repositorio pasó a `Inroprin-Apps/InroScan` (antes `tsdonoso-beep/inroscan`, donde queda el historial previo). La app se publica en <https://inroprin-apps.github.io/InroScan/web/>.
- **7-nov-2026:** entra la **Plataforma de Memorandums** (diseñada por Finanzas
  en Apps Script, nunca desplegada) construida sobre la misma base; la app toma
  el sistema visual de **INROCONTA** y lee de él padrón, SSCO y SIRE. Ver
  [PLAN.md](PLAN.md).

---

## 2. Cómo está armado

```
Teléfono / PC — web/ (Next.js estático en GitHub Pages, /InroScan/web/)
  ├─ cola en IndexedDB: lo capturado espera ahí si no hay señal
  ├─ service worker: la app abre sin señal; copia local de lo último visto
  └─ Supabase
       ├─ login con Google (solo @inroprin.com, lo exige la base)
       ├─ Postgres con permisos por fila, triggers de estado e historial
       ├─ Storage «comprobantes» (privado): las imágenes en tránsito
       └─ función «leer»: lee cada archivo apenas sube (Gemini, clave en el servidor)
```

| Tema | Decisión | Por qué |
|---|---|---|
| Datos | Supabase (Postgres + RLS) | Trazabilidad real: historial de cada cambio, quién y cuándo |
| Publicación | GitHub Pages, exportación estática | Sin servidor propio que mantener; Supabase hace de backend |
| Lectura | Función de Supabase con Gemini, al subir | Inmediata; la clave no sale del servidor; el teléfono no carga con la lectura. Antes se pensó en un programa en la PC: se descartó porque obligaba a esperar |
| Sin señal | Cola en IndexedDB + service worker | Se captura en obra o en viaje; se sube y lee al volver la señal. En iPhone solo con la app abierta |
| Visibilidad | Cada persona ve lo suyo; administración ve todo | Pedido explícito |
| Borrar | No existe: se **descarta** (queda en el historial) | Trazabilidad |
| Editar | Solo en `abierta` u `observada`; enviada se bloquea | Lo hacen cumplir los triggers, no la pantalla |
| Catálogos | Solo administración los crea o desactiva | Un vocabulario único para poder sumar |
| Categoría y subcategoría | Salen del concepto, viven en la base, no en la hoja | Pedido: la hoja lleva las 14 columnas |
| Dólares | Se muestran aparte, sin convertir | Sumarlos como soles falseaba los saldos |
| Drive | La función «drive» entra con una cuenta de administración conectada una vez (su token vive en `integraciones`, que solo lee el sistema) | Nadie tiene que dejar un programa corriendo en su PC; y cuentas de servicio con clave suelen estar bloqueadas en organizaciones nuevas |

### Estados de una rendición

`abierta → enviada → observada ↺ enviada → aprobada → repuesta (caja) / liquidada (memo)`.
Cada envío sube la versión. Administración observa **por comprobante y por
rendición**, devuelve, o aprueba.

---

## 3. Mapa del código

**`web/src/app/`**
- `marco.tsx`: sesión, barra lateral contraíble (se recuerda por equipo),
  barra inferior del teléfono, «Por subir», ingreso.
- `mis-rendiciones.tsx`, `nueva-rendicion.tsx`: inicio y alta.
- `rendicion/`: la hoja (`vista.tsx`, `hoja.tsx`, `cabecera.tsx`,
  `celdas.tsx`), las subidas (`subidas.tsx`), el historial y `revisar/`
  (revisión con imagen y decisiones de administración).
- `bandeja/`, `cajas/`, `catalogos/`, `personas/`, `reportes/`: administración.

**`web/src/lib/`**: datos (`datos.ts`, `admin.ts`), cuentas (`cuentas.ts`),
reglas de una fila (`comprobante.ts`), errores en palabras (`errores-de-base.ts`),
subida y cola sin señal (`subida.ts`, `cola.ts`, `envio.ts`), Excel
(`hoja-excel.ts`), reportes, sesión y fechas. Lo puro tiene pruebas (Vitest).

**`supabase/`**: migraciones, pruebas de permisos (`pruebas/correr.sh`, 62
verificaciones contra un Postgres que imita a Supabase) y la función `leer`
(con sus pruebas en Deno).

**`procesador/`**: reglas de lectura en Python (portadas de la primera app);
base para la generación de la hoja en Drive si se hace desde una PC.

---

## 4. Lo que está fuera del repo

- **Supabase:** proyecto `vqabgnynidehfqueupki`. Secretos de funciones:
  `GEMINI_API_KEY` (opcional `GEMINI_MODELO`). Ahí mismo, en el esquema
  `respaldo_fotograma`, queda un respaldo del proyecto «foto-grama» que ocupaba
  ese Supabase antes (se puede borrar con `drop schema respaldo_fotograma cascade`).
- **Google Cloud:** proyecto `inroscan-contabilidad`, cliente OAuth web; la URI
  de retorno es la de Supabase (`…supabase.co/auth/v1/callback`).
- **Ejemplos históricos de gastos** (3,820 filas con nombres de personas): no
  van al repo. Solo la lista de conceptos (`supabase/semillas/conceptos.csv`).

---

## 5. Lo que está abierto

1. **Drive: conectar y probar de punta a punta.** La función
   `supabase/functions/drive` ya genera, al enviar, la carpeta de la
   rendición, la hoja (un .xlsx que Drive convierte a Google Sheets, con
   fórmulas vivas y cada N° enlazado a su imagen) y su PDF; copia las imágenes
   verificando su MD5, y al aprobar las borra de Supabase solo si la copia en
   Drive coincide. Todo cuelga de una **carpeta madre** que se elige al
   conectar (hoy, INROSCAN › Rendiciones, en una unidad compartida). Falta del lado de Google: la URI de retorno
   `…/InroScan/web/drive/` en el cliente OAuth, el secreto
   `GOOGLE_CLIENT_SECRET` en Supabase, y conectar desde Administración › Drive
   pegando el enlace de la carpeta madre. (La API de Drive ya está activada.)
2. **Validar la tabla de conceptos** (MEDICINA sin definir; hay propuestas por
   analogía marcadas `propuesta`).
3. **Confirmar el nombre que se imprime en EMPRESA.**
4. **Medir la lectura** con 30–50 comprobantes reales: precisión por campo.
5. **Formato del memo:** revisar si cambia respecto de la caja chica.
6. **Tipo de cambio** para los comprobantes en dólares, si se decide convertir.
7. **Migrar los 204 memos históricos** del respaldo de foto-grama, si sirven.
8. **Supabase gratis se pausa tras 7 días sin uso**, y tiene límites de 500 MB
   de base y 1 GB de Storage. Con uso diario no pasa; el plan Pro lo evita.

---

## 6. Lo aprendido con documentos reales (vale para siempre)

### Series de comprobante
Conviven `F001-6384`, `EB01-135`, `FW01-434`, `F018-00001185` y series
puramente numéricas como `0001-003936` y `002-001175`. Una regla que solo
aceptara la letra inicial perdía un tercio de las filas, en silencio.
`F001-6384` y `F001-006384` son el mismo papel: la columna generada
`comprobantes.clave` normaliza ceros y guiones para encontrar repetidos. Las
planillas de movilidad traen un correlativo sin serie (`010010`): se copia tal
cual.

### La IA y las boletas
Una boleta con cuatro platos es **un** comprobante; Gemini tendía a devolver
cuatro. El prompt lo dice explícitamente y separa por número de comprobante:
«en la duda, devuelve menos». Un dato que no se lee se deja vacío: un campo
vacío se corrige en dos segundos; uno inventado que parece correcto se registra
mal y nadie lo nota.

### La aritmética de la rendición (memo 675, verificado al centavo)
```
12 comprobantes            S/ 347.50   ← gastado
− 2 declaraciones juradas  S/ 105.50
= sustentado               S/ 242.00   (72 % de S/ 334.00)
```
- La planilla de movilidad **sí** sustenta (sin ella daría 217.00). Falta
  confirmarlo con contabilidad: la plantilla decía «SOLO FT Y BOLETA».
- El saldo se mide contra lo **gastado**, no lo sustentado: una DJ es plata que
  salió del bolsillo. Qué sustenta es un criterio de cada rendición, no una
  constante (la DJ arranca fuera).

### La hoja en Google Sheets (para cuando se genere en Drive)
- **Fórmulas vivas**, no números: si contabilidad corrige un importe, el total
  lo sigue. Cada N° de comprobante enlaza a su imagen.
- `es_PE` **no** es un idioma válido para Sheets («Unsupported locale»): se
  intenta y no se exige. Y en Perú el separador de fórmulas es la **coma**
  (el decimal es punto); se deduce del idioma que quedó, no se supone.
- Crear la hoja **por la API de Drive** para que nazca dentro de la carpeta; por
  la de Sheets queda en la raíz y hay que moverla.

### Sobre el control
Que la hoja sea editable no es un defecto, es el punto. La doble validación no
desaparece, cambia de pregunta: ya no «¿tecleó bien?» (nadie tecleó), sino
«¿corresponde este gasto?». Por eso la revisión pone la imagen al lado. Y una
trampa a evitar: revalidar una rendición contra los mismos comprobantes de los
que salió siempre cuadra y no valida nada.

---

## 7. Para quien retome esto

- Los comentarios del código están en castellano y explican **por qué**. Si uno
  dice que algo es deliberado, probablemente costó un error descubrirlo.
- Las reglas viven en la base (triggers y permisos); la app no las duplica, solo
  traduce el error cuando una salta (`errores-de-base.ts`).
- Antes de confiar en una suposición sobre una API externa, probarla aparte.
- Nunca subir al repo claves, tokens ni datos con nombres de personas: es público.
