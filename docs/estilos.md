# Estilos, tipografías y colores de la app web

La app web se personaliza en **Perfil → Preferencias** con tres elecciones independientes entre sí y del tema claro/oscuro («Apariencia»):

- **Estilo visual**: la forma de las superficies (tarjetas, botones, sombras, radios, fondo).
- **Tipografía**: la pareja de letras de títulos y texto.
- **Color**: la paleta de marca (botones, enlaces, selección y foco) con un leve tinte de los neutros.

Cualquier combinación funciona en claro y en oscuro, en escritorio y en móvil y en todas las pantallas, incluidas las 24 herramientas: 4 estilos × 5 tipografías × 5 paletas.

## Estilos

| Estilo | Valor | Qué cambia |
|---|---|---|
| **Editorial** (por defecto) | `editorial` | El diseño de siempre: títulos con serif, neutros cálidos, tarjetas con borde fino. |
| **Minimalista** | `minimal` | Casi monocromo: superficies neutras, líneas finas en vez de sombras, un solo acento (foco y enlace activo), radios pequeños, más aire y títulos ligeros con la letra del texto. Los pilares se quedan en puntos y gráficos de tono apagado. |
| **Cristal** (glassmorphism) | `glass` | Fondo fijo de manchas de color (solo CSS, sin imágenes ni animación) y superficies translúcidas con `backdrop-filter: blur() saturate()`, borde claro de 1 px, brillo interior y radios grandes. Sin `backdrop-filter`, las superficies pasan a ser opacas. |
| **Suave** | `suave` | Radios grandes, botones de píldora, tarjetas de un pilar con un velo pastel de su color, sombras ligeras y barra de pestañas flotante en el móvil. |

## Tipografías

| Tipografía | Valor | Títulos | Texto |
|---|---|---|---|
| **Clásica** (por defecto) | `clasica` | Newsreader (serif, 400) | Figtree |
| **Moderna** | `moderna` | Manrope (600) | Manrope |
| **Geométrica** | `geometrica` | Outfit (500) | DM Sans |
| **Elegante** | `elegante` | Fraunces (400) | Source Sans 3 |
| **Amable** | `amable` | Nunito (700, redondeada) | Nunito |

- Las fuentes se sirven desde la propia app (paquetes `@fontsource/*`, solo el subconjunto latino y los pesos que se usan), sin Google Fonts.
- **Clásica** va en el paquete inicial. Las demás no: `src/app/font.ts` importa su CSS (`src/styles/fuentes/<valor>.css`) solo cuando alguien la elige o abre el selector de Perfil, que muestra cada opción con su letra. El navegador, además, descarga cada archivo de fuente solo si lo pinta. Mientras llegan, se ve la letra de repuesto de la pila (sin bloquear el primer pintado).
- Las fuentes opcionales no se precachean en el service worker (para no descargarlas todas al instalar); se guardan la primera vez que se usan (caché `dyc-fuentes`).
- Las familias y el grosor de los títulos (`--weight-display`) de cada tipografía están en `src/styles/tipografias.css`. La tipografía elegida gana a la del estilo: Minimalista usa la letra del texto en los títulos solo con Clásica, aunque mantiene sus títulos finos.

## Paletas de color

| Paleta | Valor | Principal en claro | Principal en oscuro | Idea |
|---|---|---|---|---|
| **Lima** (por defecto) | `lima` | `#151714` | `#C8F23A` | Negro con verde lima: en claro, botones negros con texto lima; en oscuro, fondo casi negro y lima como color principal. |
| **Azul** | `azul` | `#1E3A5F` | `#9DB9E0` | El azul profundo del principio. |
| **Salvia** | `salvia` | `#2F5D46` | `#9CCBAE` | Verde salvia profundo, neutros con un toque verde. |
| **Terracota** | `terracota` | `#96482C` | `#EBA78A` | Arcilla cálida, neutros cálidos. |
| **Lavanda** | `lavanda` | `#563A87` | `#C4B0EC` | Violeta y ciruela. |
| **Grafito** | `grafito` | `#2E3136` | `#D6D6D3` | Casi monocromo, con un acento cálido (cobre `#B5552A` / `#EE9D6C`) en el foco y en el tono de selección. |

(Valores de Editorial. Cada estilo tiene su versión: en Suave, por ejemplo, el principal es algo más claro, y en Cristal las manchas del fondo toman los tonos de la paleta.)

- Cada paleta cambia, **para cada estilo** y en claro y oscuro: `--color-primary`, `--color-primary-hover`, `--color-primary-soft`, `--color-on-primary`, `--color-focus` y un leve tinte de fondo, superficies y líneas. En **Cristal** cambian también las manchas del fondo (`--glass-blob-1…4`). En **Minimalista** solo cambian el acento y el foco: el estilo sigue siendo monocromo.
- Los colores de **estado** (éxito, aviso, peligro) y de los **pilares** no cambian con la paleta.
- Todo está en `src/styles/paletas.css`: un bloque por estilo y paleta, bajo `:root[data-style='…'][data-palette='…']`, con su versión oscura para `prefers-color-scheme` y para `data-theme="dark"`. **Azul** no añade nada: es la paleta propia de cada estilo. La de por defecto es **Lima** (`data-palette` de `index.html` y `DEFAULT_PALETTE` en `palette.ts`).

## Cómo funciona

- El **tema** por defecto es **oscuro** (`DEFAULT_THEME` en `src/app/theme.ts` y `data-theme="dark"` en `index.html`). En Perfil → Apariencia se puede elegir Claro o Sistema (sigue el tema del dispositivo; se guarda como `system`).
- Las tres preferencias se guardan **en el navegador** (`localStorage`, claves `dyc.style`, `dyc.font` y `dyc.palette`), como el tema. No viajan a la API ni a otros dispositivos. El valor por defecto no se guarda: si cambia, quien no eligió nada lo recibe.
- Se aplican con `data-style`, `data-font` y `data-palette` en `<html>`. Un script en `apps/web/index.html` los pone **antes de pintar**, igual que el tema, para que no haya destello; `main.tsx` los vuelve a aplicar y carga las fuentes de la tipografía elegida.
- Las tres usan la misma pieza, `src/app/preference.ts`; cada una tiene su módulo (`style.ts`, `font.ts`, `palette.ts`) con sus opciones y textos.
- Cada estilo es un archivo en `apps/web/src/styles/estilos/` (`minimal.css`, `glass.css`, `suave.css`), importado una vez desde `index.css`. Editorial no añade nada: es la base (`tokens.css`, `components.css` y `app.css`). Después se importan `paletas.css` y `tipografias.css`.
- Ni estilos, ni tipografías, ni paletas **cambian el marcado** de ninguna página. Solo tocan:
  - **tokens** (colores, tipos, radios, sombras) en `:root[data-…]`, con su versión oscura;
  - en los estilos, **componentes base** (tarjetas, botones, campos, chips, controles segmentados, estados vacíos) en la capa `dyc.estilo`, que va antes de las páginas, y **estructura** (fondo, barra lateral, pestañas, diálogos, cabeceras, tarjetas con color) en la capa `dyc.estilo-app`, que va después.
  El orden de capas se declara al principio de `app.css`: `dyc.base, dyc.components, dyc.estilo, dyc.app, dyc.estilo-app`.

## Cambiar los valores por defecto

Cada valor por defecto está en dos sitios que deben coincidir (lo comprueban las pruebas de `src/app/`):

| Preferencia | En el código | En `apps/web/index.html` |
|---|---|---|
| Estilo | `DEFAULT_STYLE` en `src/app/style.ts` | `data-style` de `<html>` |
| Tipografía | `DEFAULT_FONT` en `src/app/font.ts` | `data-font` de `<html>` |
| Paleta | `DEFAULT_PALETTE` en `src/app/palette.ts` | `data-palette` de `<html>` |

Por ejemplo, para que la app arranque en Suave con Salvia: `DEFAULT_STYLE = 'suave'`, `DEFAULT_PALETTE = 'salvia'` y `<html lang="es" data-style="suave" data-font="clasica" data-palette="salvia">`. Quien ya eligió algo lo conserva; quien eligió el que era el valor por defecto no lo tiene guardado y pasa al nuevo.

Si cambias la **tipografía** por defecto, mueve también sus `@fontsource` de `src/styles/fuentes/` a los imports de `main.tsx` (y los de Clásica a su propio archivo en `fuentes/` y a `font.ts`), para que la de por defecto vaya en el paquete inicial y no espere a cargarse.

## Accesibilidad

- `src/app/style.test.ts` lee los CSS de estilos y paletas y comprueba el contraste WCAG AA de **cada estilo con cada paleta, en claro y en oscuro** (40 combinaciones): texto, botón principal (también al pasar el ratón), estados y pilares sobre fondo, tarjetas, zonas hundidas y fondos de pilar (4,5:1), y foco, acento de Minimalista y gráficos de pilar (3:1). En **Cristal** calcula el peor caso: el texto de página sobre el centro de cada mancha del fondo, y el texto sobre las tarjetas, barras, diálogos, campos y chips translúcidos compuestos sobre esas manchas, además de las superficies opacas de repuesto.
- `src/app/palette.test.ts` comprueba que cada paleta define en oscuro lo mismo que en claro (igual con el tema del sistema que con el elegido) y que solo cambia marca, foco, neutros y manchas, nunca estados ni pilares. `src/app/font.test.ts` comprueba las familias, los pesos y que las fuentes se cargan una sola vez.
- La barra de pestañas y los diálogos de Cristal son casi opacos (90 % en claro, 92 % en oscuro): Chrome no desenfoca el contenido de otra superficie que ya usa `backdrop-filter`, así que lo que pasa por debajo se vería nítido.
- `apps/web/e2e/a11y.spec.ts` elige cada estilo desde Perfil y pasa axe (WCAG 2.2 AA) por Hoy, Progreso, Agenda, Pendientes, Finanzas, Notas, Bóveda, Más y Perfil; y elige cada paleta y cada tipografía y pasa axe por Hoy, Agenda y Finanzas (comprobando que la fuente elegida se carga y se usa). Todo en escritorio claro y en móvil oscuro.
- Los selectores de Perfil son grupos de radios nativos con su leyenda («Estilo visual», «Tipografía», «Color»); la muestra de cada opción es decorativa (`aria-hidden`) y la descripción va en `aria-describedby`.

## Añadir un estilo

1. Crea `apps/web/src/styles/estilos/<valor>.css` con los tokens en claro y en oscuro (los mismos colores en los tres bloques) y las reglas en las capas `dyc.estilo` y `dyc.estilo-app`, siempre bajo `[data-style='<valor>']`.
2. Impórtalo en `index.css` y añádelo a `STYLE_OPTIONS` en `style.ts`, a la lista del script de `index.html` y a la muestra del selector (`[data-preview='<valor>']` en `app.css`).
3. Añade sus bloques en `paletas.css` para cada paleta que no sea Azul.
4. Las pruebas de contraste y de accesibilidad lo recorren solas en cuanto está en `STYLE_OPTIONS` (en el recorrido de axe hay que añadirlo a la lista).

## Añadir una paleta

1. Añádela a `PALETTE_OPTIONS` en `palette.ts` y a la lista del script de `index.html`.
2. En `paletas.css`, un bloque por estilo (claro, oscuro del sistema y oscuro elegido, con los mismos colores en los dos oscuros). Si dudas del contraste, ejecuta `pnpm --filter @dyc/web test`: las pruebas dicen qué color no llega y por cuánto.
3. Su muestra en el selector: `[data-swatch='<valor>']` en `app.css`, en claro y en oscuro.

## Añadir una tipografía

1. `pnpm --filter @dyc/web add @fontsource/<familia>` y crea `src/styles/fuentes/<valor>.css` con los `@import` de sus pesos latinos (`latin-400.css`, …).
2. Añádela a `FONT_OPTIONS` y a los cargadores de `font.ts`, a la lista del script de `index.html`, al patrón `OPTIONAL_FONTS` de `vite.config.ts` y a `tipografias.css` (su pila con repuesto genérico, el bloque `:root[data-font='<valor>']` y su muestra `[data-font-option='<valor>']`).
