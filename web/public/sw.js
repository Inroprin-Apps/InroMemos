// La cáscara de INROMEMOS para abrirla sin señal. Solo guarda la app (HTML,
// JS, CSS, íconos), nunca datos: esos los guarda la propia app y las fotos
// esperan en su cola (src/lib/cola.ts).
const CACHE = "inroscan-v1";
const BASE = "/InroScan/web/";
const PAGINAS = [BASE, `${BASE}rendicion/`, `${BASE}rendicion/revisar/`];

// Cada página y los scripts y estilos que nombra. Sin estos, la página abre
// sin señal pero no arranca: la primera visita los bajó antes de que este
// trabajador existiera.
async function guardarTodo() {
  const c = await caches.open(CACHE);
  const archivos = new Set();
  for (const pagina of PAGINAS) {
    const r = await fetch(pagina, { cache: "no-cache" });
    if (!r.ok) continue;
    await c.put(pagina, r.clone());
    const html = await r.text();
    for (const m of html.matchAll(/["'](\/InroScan\/web\/(?:_next\/static\/[^"'\\]+|[\w.-]+\.(?:svg|png|webmanifest)))["']/g)) archivos.add(m[1]);
  }
  // Uno que falle no impide guardar los demás.
  await Promise.all([...archivos].map((u) => c.add(u).catch(() => {})));
}

self.addEventListener("install", (e) => {
  e.waitUntil(guardarTodo().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // Supabase, Google y todo lo de afuera van directo, sin pasar por acá.
  if (req.method !== "GET" || url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;

  if (req.mode === "navigate") {
    // Primero la red, para que una versión nueva llegue apenas hay señal; sin
    // ella, la última guardada (el ?id= no cambia la página).
    e.respondWith(
      fetch(req)
        .then((r) => {
          const copia = r.clone();
          caches.open(CACHE).then((c) => c.put(url.pathname, copia));
          return r;
        })
        .catch(() => caches.match(url.pathname).then((r) => r ?? caches.match(BASE))),
    );
    return;
  }

  // Lo demás (JS y CSS con su huella en el nombre, íconos): lo guardado, y se
  // renueva por detrás.
  e.respondWith(
    caches.match(req).then((guardada) => {
      const red = fetch(req)
        .then((r) => {
          if (r.ok) {
            const copia = r.clone();
            caches.open(CACHE).then((c) => c.put(req, copia));
          }
          return r;
        })
        .catch(() => guardada);
      return guardada ?? red;
    }),
  );
});
