# INROMEMOS · app web

Next.js publicado como sitio estático en GitHub Pages, bajo `/InroScan/web/`.
Supabase hace de servidor: login con Google, base de datos con permisos por
fila e imágenes. Ver `CONTEXTO.md` en la raíz del repo.

```bash
npm install
npm run dev      # http://localhost:3000/InroScan/web/
npm run build    # exporta a out/
npm run lint
```

Esta versión de Next.js tiene cambios respecto a versiones anteriores: antes
de escribir código, leer la guía correspondiente en
`node_modules/next/dist/docs/` (ver `AGENTS.md`).
