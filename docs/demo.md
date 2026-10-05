# Versión de prueba de la web

Una copia de la app web que funciona entera en el navegador, sin API ni servidor: un solo archivo HTML que se puede abrir o alojar en cualquier sitio (y en cualquier ruta) para enseñar la app y probar todas las secciones.

## Cómo se genera

```bash
pnpm --filter @dyc/web build:demo
```

Deja el archivo en `apps/web/dist-demo/design-your-core-demo.html` (unos 0,9 MB; la carpeta no se sube al repositorio). Hace tres pasos:

1. Comprueba los tipos (`tsc`).
2. `vite build --mode demo`: el modo `demo` (o la variable `VITE_DEMO=1`) activa la versión de prueba y genera un solo JS y un solo CSS, con todo lo demás incrustado.
3. `node scripts/inline-demo.mjs`: mete ese JS y ese CSS dentro del HTML y falla si queda algún archivo local sin incrustar.

Para probarla en local basta con servir la carpeta, por ejemplo `python3 -m http.server` dentro de `apps/web/dist-demo/`, y abrir el archivo. También se puede trabajar en ella con recarga en vivo: `pnpm --filter @dyc/web exec vite --mode demo`.

## Qué cambia respecto a la app normal

Todo lo propio de la prueba está en `apps/web/src/demo/` y solo entra en el paquete cuando `import.meta.env.VITE_DEMO` vale `'1'` (lo fija `vite.config.ts`). En la app normal esas ramas desaparecen al compilar: `pnpm --filter @dyc/web build` no incluye nada de la prueba y se comporta igual que antes.

- **API falsa** (`src/demo/server.ts`): se pasa como `fetch` a `@dyc/api-client` (en `src/app/api.ts`). Responde a las mismas rutas que la API real, con las mismas formas y reglas, reutilizando la lógica de `@dyc/core` (puntuaciones, recomendaciones, retos, validación con los mismos esquemas y los módulos de la app anterior, incluida la bóveda cifrada). Espera unos 120 ms por petición para que se vean los estados de carga. Cualquier dirección que no sea `/api/…` falla como si no hubiera conexión.
- **Datos** (`src/demo/seed.ts` y `src/demo/db.ts`): una cuenta de ejemplo, Lucía Romero, con tres semanas de check-ins y hábitos, dos retos en curso y contenido en todas las herramientas. Las fechas son relativas a hoy y, si se vuelve otro día, todas se mueven los mismos días. Todo se guarda en el `localStorage` de ese navegador (`dyc.demo.db`); si el navegador no deja guardar, dura lo que dure la pestaña.
- **Sesión**: la prueba empieza con la sesión de Lucía abierta. Al entrar vale cualquier correo y contraseña; crear una cuenta nueva lleva a la bienvenida, como en la app real.
- **Aviso** (`src/demo/DemoBanner.tsx`): una franja arriba explica que es una versión de prueba y tiene el botón «Restablecer datos», que vuelve a los datos de ejemplo (el estilo, la tipografía y la paleta elegidos se conservan).
- **Asistente** (`src/demo/assistant.ts`): no se conecta a Gemini. Contesta con ejemplos y, si se le pide añadir un pendiente o anotar agua, propone la acción igual que el de verdad. Viene configurado con una clave de ejemplo que no se usa.
- **Rutas**: van tras `#` (`HashRouter`), porque el archivo puede estar en cualquier dirección.
- **Sin service worker ni avisos de versión nueva**: no se registra la PWA.
- **Fuentes**: no se incluyen las de `@fontsource`; el HTML carga de Google Fonts todas las familias y grosores de las cinco tipografías (los mismos nombres de familia que usa `styles/tipografias.css`). Sin conexión se ve la letra de repuesto.

Lo único que el HTML pide fuera es la hoja de Google Fonts (`fonts.googleapis.com` y `fonts.gstatic.com`).

## Si cambia la API

Cuando se añada o cambie una ruta que use la web, hay que reflejarlo en `src/demo/server.ts` (las pruebas de `src/demo/server.test.ts` recorren las principales a través del cliente real). Si cambia la forma de un módulo de la app anterior, los datos de ejemplo se validan con los mismos esquemas de `@dyc/core` al sembrarse, así que un dato que ya no valga hace fallar las pruebas.
