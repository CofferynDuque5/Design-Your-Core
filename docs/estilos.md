# Estilos visuales de la app web

La app web tiene cuatro **estilos visuales** que se eligen en **Perfil → Preferencias → Estilo visual**. El estilo es independiente del tema: cada uno funciona en claro y en oscuro (del sistema o elegido en «Apariencia»), en escritorio y en móvil, y en todas las pantallas, incluidas las 24 herramientas.

| Estilo | Valor | Qué cambia |
|---|---|---|
| **Editorial** (por defecto) | `editorial` | El diseño de siempre: Newsreader para títulos y Figtree para el texto, azul profundo, salvia y arena, neutros cálidos. |
| **Minimalista** | `minimal` | Casi monocromo: superficies neutras, líneas finas en vez de sombras, un solo acento azul (foco y enlace activo), radios pequeños, más aire, títulos en Figtree ligera. Los pilares se quedan en puntos y gráficos de tono apagado. |
| **Cristal** (glassmorphism) | `glass` | Fondo fijo de manchas de color (solo CSS, sin imágenes ni animación) y superficies translúcidas con `backdrop-filter: blur() saturate()`, borde claro de 1 px, brillo interior y radios grandes. Sin `backdrop-filter`, las superficies pasan a ser opacas. |
| **Suave** | `suave` | Radios grandes, botones de píldora, tarjetas de un pilar con un velo pastel de su color, sombras ligeras, barra de pestañas flotante en el móvil y Newsreader en los títulos. |

## Cómo funciona

- La preferencia se guarda **en el navegador** (`localStorage`, clave `dyc.style`), como el tema. No viaja a la API ni a otros dispositivos.
- Se aplica con `data-style` en `<html>`. Un script en `apps/web/index.html` lo pone **antes de pintar**, igual que el tema, para que no haya destello.
- Cada estilo es un archivo en `apps/web/src/styles/estilos/` (`minimal.css`, `glass.css`, `suave.css`), importado una vez desde `index.css`. Editorial no añade nada: es la base (`tokens.css`, `components.css` y `app.css`).
- Los estilos **no cambian el marcado** de ninguna página. Solo tocan:
  - **tokens** (colores, tipos, radios, sombras) en `:root[data-style='…']`, con su versión oscura para `prefers-color-scheme` y para `data-theme="dark"`;
  - **componentes base** (tarjetas, botones, campos, chips, controles segmentados, estados vacíos) en la capa `dyc.estilo`, que va antes de las páginas;
  - **estructura** (fondo, barra lateral, pestañas, diálogos, cabeceras, tarjetas con color) en la capa `dyc.estilo-app`, que va después.
  El orden de capas se declara al principio de `app.css`: `dyc.base, dyc.components, dyc.estilo, dyc.app, dyc.estilo-app`.

## Cambiar el estilo por defecto

El estilo por defecto es el que ve quien no ha elegido ninguno. Está en dos sitios que deben coincidir (lo comprueba `src/app/style.test.ts`):

1. `DEFAULT_STYLE` en `apps/web/src/app/style.ts`.
2. El atributo `data-style` de `<html>` en `apps/web/index.html`.

Por ejemplo, para que la app arranque en Suave: `DEFAULT_STYLE = 'suave'` y `<html lang="es" data-style="suave">`. Quien ya eligió un estilo lo conserva; quien eligió el que era el de por defecto no lo tiene guardado y pasa al nuevo.

## Accesibilidad

- `src/app/style.test.ts` lee los CSS de los estilos y comprueba el contraste WCAG AA en claro y en oscuro: texto, botón principal, estados y pilares sobre fondo, tarjetas, zonas hundidas y fondos de pilar (4,5:1), y foco y gráficos de pilar (3:1). En **Cristal** calcula el peor caso: el texto de página sobre el centro de cada mancha del fondo, y el texto sobre las tarjetas, barras, diálogos, campos y chips translúcidos compuestos sobre esas manchas, además de las superficies opacas de repuesto.
- La barra de pestañas y los diálogos de Cristal son casi opacos (90 % en claro, 92 % en oscuro): Chrome no desenfoca el contenido de otra superficie que ya usa `backdrop-filter`, así que lo que pasa por debajo se vería nítido.
- `apps/web/e2e/a11y.spec.ts` elige cada estilo desde Perfil y pasa axe (WCAG 2.2 AA) por Hoy, Progreso, Agenda, Pendientes, Finanzas, Notas, Bóveda, Más y Perfil, en escritorio claro y en móvil oscuro.

## Añadir un estilo

1. Crea `apps/web/src/styles/estilos/<valor>.css` con los tokens en claro y en oscuro (los mismos colores en los tres bloques) y las reglas en las capas `dyc.estilo` y `dyc.estilo-app`, siempre bajo `[data-style='<valor>']`.
2. Impórtalo en `index.css` y añádelo a `STYLE_OPTIONS` en `style.ts`, a la lista del script de `index.html` y a la muestra del selector (`[data-preview='<valor>']` en `app.css`).
3. Las pruebas de contraste y de accesibilidad lo recorren solas en cuanto está en `STYLE_OPTIONS` (en el recorrido de axe hay que añadirlo a la lista).
