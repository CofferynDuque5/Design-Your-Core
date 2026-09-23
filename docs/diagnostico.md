# Design Your Core: diagnóstico técnico y plan de implementación

Fecha: 23 de septiembre de 2026
Material analizado: `Core-BACKEND.zip` (8 archivos) y `Core-WEB.zip` (150 archivos). El repositorio de GitHub `Design-Your-Core` está vacío.

---

## 0. Resumen en cinco líneas

1. **Ninguno de los dos ZIPs trae código fuente editable.** La web es el build compilado de Vite (un JS minificado de 1 MB). El backend solo trae `dist/index.js` (compilado desde TypeScript, pero legible y con comentarios), el esquema de Prisma y la configuración.
2. **El backend es pequeño y está bien protegido en lo básico** (bcrypt, JWT con revocación, rate limiting, helmet, Zod). Guarda todo el estado del usuario en **un único JSON** por persona.
3. **La app actual no es una app de bienestar: es "Core", una super-app de productividad** para creadores y estudiantes, con 24 secciones (agenda, tareas, cuadernos de código, kanban de contenido, finanzas, contraseñas, mascotas…). Bienestar es un grupo más.
4. **Se reutiliza mucho**: autenticación, recuperación de contraseña, sincronización, vinculación de pareja, PWA offline y los registros de sueño, ejercicio, diario, comidas, agua, meditación, metas y ciclo.
5. **Falta lo que define el producto nuevo**: los seis pilares, el onboarding, el historial diario (los hábitos no guardan historial, así que no hay progreso semanal ni mensual real), los retos adaptables, las recomendaciones, la app móvil nativa y el sistema de diseño.

---

## 1. Qué hay en cada ZIP

### 1.1 Core-BACKEND.zip → `core-api/`

| Archivo | Contenido |
|---|---|
| `package.json` | Proyecto `core-cloud` 1.0.0, ESM. Scripts: `start` (node dist), `dev` (tsx src/index.ts), `build` (tsc). **`src/` y `tsconfig.json` no vienen en el ZIP.** |
| `dist/index.js` | Toda la API en un archivo (514 líneas, salida de `tsc`, con comentarios en español). |
| `prisma/schema.prisma` | 3 modelos: `User`, `Blob`, `Image`. PostgreSQL. |
| `core-config.env` | Configuración de producción para cPanel. **Incluye un `JWT_SECRET` real.** `DATABASE_URL` tiene el valor de ejemplo (`ep-xxxx.neon.tech`). |
| `package-lock.json` | Dependencias fijadas. |

**Stack:** Node.js (ESM) + Express 4.21 + Prisma 5.22 + PostgreSQL (Neon) + Zod 3 + jsonwebtoken + bcryptjs + helmet + express-rate-limit + nodemailer 10 + dotenv.
**Despliegue previsto:** aplicación Node en cPanel (Passenger), base de datos en Neon, correo SMTP del propio hosting. Crea las tablas al arrancar con SQL directo (`ensureSchema`), sin migraciones.

**Modelo de datos**

```
User   id (cuid), email (único), name, passwordHash, inviteCode (único), partnerId,
       gender ('mujer'|'hombre'|'otro'), showCycle, tokenVersion,
       resetTokenHash (único), resetExpires, createdAt
Blob   userId (PK, FK User, cascade), data JSONB (TODO el estado de la app), updatedAt
Image  id (lo genera el cliente), userId (FK, cascade), data TEXT (data URL base64), createdAt
```

**API (16 rutas)**

| Método y ruta | Auth | Qué hace |
|---|---|---|
| `GET /api/health` | no | Comprobación de vida |
| `POST /api/auth/register` | no, estricto | Alta con email, contraseña ≥8, nombre y género. Devuelve JWT (60 días) + usuario |
| `POST /api/auth/login` | no, estricto | Login con hash señuelo contra enumeración por tiempo |
| `GET /api/me` | sí | Usuario actual |
| `POST /api/auth/change-password` | sí, estricto | Cambia contraseña, revoca otras sesiones y devuelve un token nuevo |
| `POST /api/auth/logout-others` | sí | Cierra sesión en los demás dispositivos (incrementa `tokenVersion`) |
| `POST /api/auth/forgot-password` | no, estricto | Envía enlace de recuperación (30 min). Siempre responde 200 |
| `GET/POST /reset` | no | Página HTML propia para poner la nueva contraseña |
| `GET /api/sync` | sí | Descarga el JSON completo del usuario |
| `PUT /api/sync` | sí | Sustituye el JSON completo (último que escribe gana) |
| `GET /api/images` | sí | Lista ids de imágenes del usuario |
| `POST /api/images` | sí | Sube hasta 50 imágenes (data URL, ≤4 MB) |
| `POST /api/images/fetch` | sí | Descarga imágenes por id |
| `POST /api/partner/invite` | sí | Genera código de pareja de 6 caracteres |
| `POST /api/partner/invite/email` | sí, estricto | Envía la invitación por correo con enlace `?invite=CODE` |
| `POST /api/partner/accept` | sí, estricto | Vincula a ambas personas |
| `GET /api/partner` | sí | Resumen de hábitos de la pareja (leído de su JSON) |
| `DELETE /api/partner` | sí | Desvincula |

Rate limit general de 600 peticiones por 15 min y 20 por 15 min en las rutas estrictas (en memoria). CORS permite `CLIENT_ORIGIN`, cualquier subdominio de `nvcorx.com`, localhost y peticiones sin Origin (apps nativas).

### 1.2 Core-WEB.zip → build de producción

| Archivo | Contenido |
|---|---|
| `index.html` + `assets/index-*.js` (992 KB) + `index-*.css` (80 KB) | SPA **React 18 compilada con Vite**. Sin código fuente. |
| `sitio/index.html` (53 KB) | **Landing estática** en HTML y CSS a mano: "Core, tu núcleo diario", orientada a creadores y estudiantes de Latinoamérica. |
| `sw.js`, `workbox-*.js`, `registerSW.js`, `manifest.webmanifest`, `icons/` | **PWA** con `vite-plugin-pwa` (Workbox). Instalable y funciona offline. |
| `ai.php` | Proxy PHP para el asistente de IA: reenvía a Gemini (compatible con OpenAI) o a OpenAI **con la API key que pone el propio usuario**. |
| `.htaccess` | Compresión, caché y paso del header Authorization a PHP (Apache/LiteSpeed en cPanel). |
| Fuentes | Space Grotesk y Manrope (Fontsource), KaTeX (fórmulas), highlight.js (código). |

**Arquitectura del cliente (reconstruida del bundle)**
- Estado global en un Context de React (`CoreProvider`/`useCore`) con acciones optimistas.
- **Local-first**: los datos viven en `localStorage["core_db_<userId>"]`, las imágenes en IndexedDB (`core-images`). Hay **cuentas locales sin nube** (`core_users`) y modo nube opcional.
- Sync: cada cambio dispara `PUT /api/sync` con el JSON entero tras 800 ms. Al iniciar sesión, el JSON del servidor **reemplaza** al local si no está vacío.
- URL de la nube por defecto, fijada en el código: `https://designyourcorebackend.nvcorx.com`. El usuario la puede cambiar en ajustes (`core_cloud_url`).
- Token JWT y usuario en `localStorage` (`core_token`, `core_user`).
- Tema claro/oscuro (`core_theme`, respeta `prefers-color-scheme`) y 4 acentos: esmeralda (por defecto), violeta, cian y ámbar.
- Notificaciones locales del navegador (Notification API + service worker). No hay push desde servidor.
- Exportación de copia de seguridad a JSON.
- Asistente de IA con function calling que puede actuar sobre los datos (por ejemplo, marcar hábitos), usando la key del usuario guardada en `localStorage`.

**Secciones de la app (24)**, agrupadas en el menú:

| Grupo | Secciones |
|---|---|
| Mi día | Inicio, Agenda (timeline, calendario, tareas), Enfoque (pomodoro + sonidos ambiente), Rutina (alarmas), Pendientes |
| Trabajo | Trabajo, Contenido (kanban idea→publicado), Ideas, Proyectos, Roadmaps, Bodega (notas + bóveda de contraseñas) |
| Estudio | Materias, Horario, Cuadernos (código resaltado, KaTeX) |
| Salud | Ejercicio, Respiración, Sueño, Diario (ánimo + gratitud), Ciclo menstrual, Mascotas |
| Progreso | Metas, Evolución (estadísticas) |
| Finanzas | Finanzas (transacciones, presupuesto) |
| IA y pareja | Asistente, Pareja |

**Forma del JSON sincronizado** (claves de nivel superior): `habits, tasks, blocks, workItems, reminders, notes, todos, subtasks, routines, meals, dayLog{water, waterGoal}, pets, petCares, ideas, content, period, cycle, workouts, sleep, journal, meditations, notebooks, noteBoxes, goals, transactions, subjects, projects, roadmaps, classes, focus, vault`.

Ejemplos de entidades:
- `habit {id, label, icon, streak, done, progress}`: **solo el estado de hoy y una racha, sin historial por día.**
- `sleep {id, date, bedtime, waketime, quality 1–5, note}`
- `journal {id, date, mood, gratitude, note}`
- `workout {id, date, plan, minutes}`, `meditation {id, date, minutes, kind}`
- `meal {id, label, time, note, dateKey}` + `dayLog {water, waterGoal}`
- `goal {id, title, target, current, unit, deadline, category, done}`
- `vault {id, name, user, pass}`: **contraseñas en texto plano.**

**Identidad visual actual:** verde esmeralda `#0FA968`, base oscura `#0B0D11` o papel `#F3F2EC`, tarjetas redondeadas y degradados verdes, Space Grotesk y Manrope. El estilo es tecnológico y juvenil, lejos del editorial cálido que buscas.

---

## 2. Hallazgos importantes (riesgos)

| # | Severidad | Hallazgo | Acción |
|---|---|---|---|
| 1 | Alta | **Falta el código fuente de la web** (y `src/` del backend). Una sesión anterior trabajó sobre `coreapp/src/api.ts` y `coreapp/vite.config.ts`, así que el fuente existe en algún lugar. | Recuperar la carpeta `coreapp` y el `src` del backend. Sin ellos, la web hay que reescribirla (el bundle sirve como referencia de lógica). El backend se puede reconstruir en TypeScript a partir de `dist` sin pérdida. |
| 2 | Alta | `core-config.env` incluye el `JWT_SECRET` de producción y ya circula dentro del ZIP. | Rotarlo al desplegar la nueva versión (cierra todas las sesiones) y sacar los secretos del paquete. |
| 3 | Alta | La **bóveda guarda contraseñas en texto plano** en `localStorage` y en la base de datos (dentro del JSON sincronizado). | Retirar la bóveda del producto de bienestar o cifrarla en el cliente (clave derivada de un PIN). Recomiendo retirarla. |
| 4 | Alta | **Sync de "último que escribe gana" con el JSON entero.** Dos dispositivos abiertos se pisan los datos, y al iniciar sesión el servidor reemplaza lo local. | Control de versiones (`version`/`If-Match`) y después sync por entidad. |
| 5 | Media | **Dominios inconsistentes:** la app llama a `designyourcorebackend.nvcorx.com`, la config del backend usa `api.desingyourcore.nvcorx.com` (con la errata *desing*) y `CLIENT_ORIGIN=desingyourcore.nvcorx.com`. Los enlaces de invitación y recuperación se construyen con esos valores. | Probable causa de los fallos de la invitación de pareja (inferido, no reproducido). Unificar dominios en una sola configuración. |
| 6 | Media | `POST /api/images` hace `upsert` por `id` sin comprobar el dueño: quien conozca el id de una imagen ajena puede sobrescribirla. Los ids son UUID, así que es difícil, pero es un fallo de autorización. | Filtrar por `userId` en el `update`. |
| 7 | Media | Imágenes en base64 dentro de Postgres y JSON de hasta 8 MB por petición. | Almacenamiento de objetos (S3/R2) o, como mínimo, límites por usuario. |
| 8 | Media | Sin migraciones (tablas creadas con SQL a mano al arrancar), sin tests, sin CI y sin borrado de cuenta en servidor. | Prisma Migrate, pruebas de integración, CI y `DELETE /api/me` con exportación de datos. |
| 9 | Baja | JWT de 60 días en `localStorage`, sin refresh token. Rate limit en memoria (se reinicia con el proceso). | Access token corto + refresh token rotatorio. En móvil, SecureStore. |
| 10 | Baja | La IA depende de que cada usuario pegue su propia API key de Gemini u OpenAI. | Para un producto premium, las recomendaciones deben venir del backend, con reglas primero y la IA como opción. |

---

## 3. Qué se puede reutilizar

**Backend (se conserva, se migra a TypeScript y se amplía):**
- Autenticación completa: registro, login, revocación por `tokenVersion`, cambio de contraseña, cerrar otras sesiones, recuperación por correo con token hasheado.
- Middlewares de seguridad (helmet, CORS, rate limit, `no-store`, manejador de errores) y validación con Zod.
- Vinculación de pareja: encaja en el pilar **Relaciones**.
- `GET/PUT /api/sync` se mantiene como **v1** para no romper la PWA actual mientras se migra.
- Infraestructura: Neon + Node en cPanel + SMTP. Ya funciona y es barata.

**Web (se reutiliza la lógica, no la interfaz):**
- Patrón local-first + PWA offline + IndexedDB para imágenes.
- Módulos que ya encajan en los pilares:

| Pilar | Qué existe hoy |
|---|---|
| Energía y movimiento | Ejercicio (planes con demos animadas, minutos), agua |
| Descanso | Sueño (horas y calidad 1–5), respiración, meditación, sonidos ambiente |
| Alimentación | Comidas del día, agua con meta |
| Enfoque mental | Pomodoro, bloques de agenda, pendientes, diario (ánimo) |
| Relaciones | Pareja (vinculación y hábitos compartidos) |
| Propósito | Metas con progreso, diario (gratitud), rutinas |

- Tema claro/oscuro con variables CSS, sistema de acentos, notificaciones locales, exportación a JSON, asistente con acciones.

**Se deja fuera del núcleo (queda en "Más" o se retira):** Trabajo, Contenido, Ideas, Proyectos, Roadmaps, Materias, Horario, Cuadernos de código, Finanzas, Mascotas y Bóveda. Son productividad, no bienestar. Está pendiente de tu decisión.

---

## 4. Qué falta

### Backend
- **Modelo de pilares**: perfil de onboarding (objetivos, rutina, energía, áreas a mejorar) y puntuación por pilar.
- **Historial diario** de hábitos y check-ins (ánimo, energía, sueño, actividad, alimentación, reflexión). Sin esto no hay progreso semanal ni mensual real.
- **Planes de acción y retos**: retos pequeños con dificultad adaptable según cumplimiento.
- **Motor de recomendaciones** (reglas sobre datos + respuestas del onboarding; IA opcional en servidor).
- Endpoints de **dashboard agregados** (día, semana, mes, por pilar).
- Sync robusto (versionado o por entidad), refresh tokens, **push notifications** (registro de dispositivos, Expo Push), borrado y exportación de cuenta, migraciones, tests y CI, logs.

### Web
- **Código fuente** (o reescritura).
- **Sitio de marca** nuevo, reposicionado en los seis pilares, con SEO, páginas legales (privacidad y términos, obligatorias en una app de salud) y acceso a la plataforma.
- Onboarding, dashboard día/semana/mes, vista de los seis cores, check-in diario, retos, recomendaciones, perfil y ajustes.
- **Sistema de diseño** editorial: tokens, tipografía, componentes, estados vacíos, de carga y de error, y accesibilidad (contraste AA, foco visible, lectores de pantalla).

### App móvil
- **No existe.** Hoy solo hay una PWA instalable. Falta una app nativa centrada en el uso diario (hoy, check-in rápido, retos, hábitos, recordatorios push, offline) conectada al mismo backend.

---

## 5. Arquitectura recomendada

Un **monorepo TypeScript** en `Design-Your-Core` (pnpm workspaces + Turborepo):

```
design-your-core/
├─ apps/
│  ├─ api/        Express + Prisma (TS, reconstruido de dist) → /api/v1 (compatible) + /api/v2
│  ├─ web/        App web: React + Vite + PWA (panel completo, escritorio y móvil)
│  ├─ site/       Sitio de marca: Astro (estático, SEO, se sube tal cual a cPanel)
│  └─ mobile/     App móvil: Expo (React Native) + Expo Router
├─ packages/
│  ├─ tokens/     Design tokens (JSON) → variables CSS + tema React Native
│  ├─ ui-web/     Componentes web (botones, tarjetas, formularios, gráficos)
│  ├─ core/       Dominio compartido: tipos, esquemas Zod, pilares, puntuaciones, retos, reglas
│  └─ api-client/ Cliente tipado del API (fetch + TanStack Query), usado por web y móvil
└─ docs/          Instalación, despliegue, API, sistema de diseño
```

Por qué así:
- **Expo / React Native** en vez de Flutter: la web ya es React, así que se comparten tipos, validación, lógica de pilares y cliente del API en TypeScript. Un solo lenguaje en todo el stack.
- **Astro** para el sitio de marca: HTML estático, rápido y bueno para SEO. Se despliega igual que la landing actual.
- **Backend único** con versionado: `/api/v1` (el actual, intacto) mientras la PWA vieja siga en uso, y `/api/v2` con el modelo normalizado.
- **Se mantiene** Neon + cPanel + SMTP. Opcional más adelante: almacenamiento de objetos para imágenes.

**Modelo de datos v2 (propuesta)**

```
User            (se amplía: timezone, locale, onboardedAt)
Profile         objetivos, energía base, rutina, pilares prioritarios (respuestas del onboarding)
PillarScore     userId, pillar, date, score 0–100            ← calculado, para el panel
Habit           userId, pillar, title, frequency, target, archivedAt
HabitLog        habitId, date, value, done                   ← historial diario
CheckIn         userId, date, mood 1–5, energy 1–5, stress, notes
SleepLog / ActivityLog / MealLog / Reflection                  (migrados del JSON actual)
Challenge       catálogo: pillar, nivel, duración, instrucciones
UserChallenge   userId, challengeId, start, estado, progreso, ajuste de dificultad
Recommendation  userId, pillar, tipo, motivo, estado (vista / aceptada / descartada)
Device          userId, pushToken, plataforma                ← notificaciones
RefreshToken    userId, hash, expiresAt, revokedAt
```

Migración de datos: un script lee el `Blob.data` de cada usuario y lo reparte en las tablas nuevas, conservando el JSON como respaldo.

---

## 6. Plan de implementación por etapas

| Etapa | Objetivo | Entregables | Depende de |
|---|---|---|---|
| **0. Rescate y base** | Tener el código en el repo, seguro y con pruebas | Monorepo; backend reconstruido en TS **sin cambiar su comportamiento**; fuente de la web (si aparece); corrección de la autorización de imágenes; dominios unificados (arregla invitación y recuperación); secreto rotado; migraciones Prisma; tests de integración de auth, sync, imágenes y pareja; CI en GitHub Actions | Fuente de `coreapp` |
| **1. Sistema de diseño** | Identidad editorial compartida | `packages/tokens` (paleta neutra + azul profundo, salvia, arena y terracota; claro y oscuro), escala tipográfica editorial (serif de titulares + sans de lectura), espaciado, radios y componentes base; página de documentación del sistema | — |
| **2. Backend v2** | Modelo de pilares y progreso | Tablas nuevas, `/api/v2` (perfil, check-ins, hábitos con historial, retos, recomendaciones por reglas, dashboard agregado), sync con control de versiones, refresh tokens, borrado y exportación de cuenta, migración del JSON | Etapa 0 |
| **3. App web** | Experiencia principal | Onboarding, panel día/semana/mes, vista de los seis cores, check-in, retos, recomendaciones, perfil y ajustes; estados vacíos, de carga y de error; módulos antiguos en "Más"; PWA | Etapas 1 y 2 |
| **4. Sitio de marca** | Presentación premium | Landing nueva con los seis pilares, cómo funciona, privacidad y términos, acceso a la app, SEO | Etapa 1 |
| **5. App móvil** | Uso diario | Expo: Hoy, check-in rápido, retos, hábitos, progreso, push, offline, login seguro (SecureStore); builds Android e iOS con EAS | Etapas 1 y 2 |
| **6. Calidad y lanzamiento** | Listo para usuarios | E2E (Playwright en web, Maestro en móvil), accesibilidad AA, rendimiento, guías de instalación y despliegue en cPanel y Neon, checklist de publicación en tiendas | Todas |

Las etapas 1 y 4 pueden avanzar en paralelo a la 0 y la 2.

---

## 7. Decisiones que necesito de ti

1. **Código fuente**: ¿tienes la carpeta `coreapp` (fuente de la web) y el `src/` del backend? Si no, la web se reescribe desde cero con el diseño nuevo (lo más probable de todos modos) y el backend se reconstruye desde `dist`.
2. **Alcance: decidido el 23/09/2026: "Pilares + Más".** El producto se centra en los seis pilares y los módulos de productividad pasan a "Más" (ocultos por defecto, sin borrar datos). Sigue pendiente confirmar si se retira la bóveda de contraseñas.
3. **Nombre y dominio**: la app se llama "Core" y los dominios mezclan *design* y *desing*. Propongo "Design Your Core" y un único dominio base (por ejemplo `designyourcore.nvcorx.com` y `api.designyourcore.nvcorx.com`).
4. **Móvil**: recomiendo Expo (React Native). Alternativa más barata: empaquetar la PWA con Capacitor, pero se siente menos nativa.
