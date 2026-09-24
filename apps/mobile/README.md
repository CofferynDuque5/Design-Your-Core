# App móvil (Expo)

App de Design Your Core para iOS y Android. Usa Expo SDK 57 con Expo Router y comparte con la web la lógica (`@dyc/core`), el cliente de la API (`@dyc/api-client`) y los tokens de diseño (`@dyc/tokens`).

## Qué incluye

- **Acceso**: entrar, crear cuenta y recuperar contraseña. La sesión usa un token de acceso de 15 minutos y uno de renovación de 90 días que rota en cada uso. Ambos se guardan en el llavero del sistema (`expo-secure-store`). Sin conexión la sesión se conserva; solo se cierra si la API rechaza la renovación.
- **Bienvenida** en cuatro pasos: pilares de enfoque, punto de partida, ritmo y primer reto.
- **Pestañas**: Hoy, Progreso (día, semana y mes), Retos, Hábitos y Perfil. El check-in completo se abre como hoja modal.
- **Tema** claro u oscuro según el sistema, o fijado desde Perfil.
- **Recordatorio diario** del check-in (notificación local, funciona sin servidor). Al tocarlo se abre el check-in.
- **Eliminar la cuenta** desde Perfil, como exigen las tiendas.

## Desarrollo

Con la API en marcha (`pnpm dev:api` en la raíz):

```bash
pnpm dev:mobile        # o: pnpm --filter @dyc/mobile start
```

Escanea el QR con Expo Go. En desarrollo la app llama a `http://<IP del ordenador>:4600`; el teléfono y el ordenador tienen que estar en la misma red. Para usar otra API, crea `.env` a partir de `.env.example` y define `EXPO_PUBLIC_API_URL`.

La vista web (`pnpm --filter @dyc/mobile web`) sirve para revisar pantallas rápido; en ella no hay notificaciones.

## Pruebas

```bash
pnpm --filter @dyc/mobile test       # Jest (jest-expo) + Testing Library
pnpm --filter @dyc/mobile typecheck
```

- `src/lib/auth.test.ts`: guardar, recuperar, renovar y cerrar la sesión.
- `src/lib/notifications.test.ts`: programar y quitar el recordatorio, y el caso sin permiso.
- `src/test/app.test.tsx`: recorridos con el enrutador real y una API falsa (entrar, bienvenida, error de acceso, renovación automática del token caducado).
- `src/test/a11y.test.tsx`: en cada pantalla, todo lo que se puede tocar tiene un rol y un nombre que VoiceOver y TalkBack pueden leer, y cada campo tiene etiqueta.

## Iconos

`pnpm --filter @dyc/mobile icons` regenera `assets/` (icono, icono adaptable de Android, pantalla de carga y favicon) a partir del logotipo. Usa el Chromium de Playwright de `@dyc/web`.

## Publicar en las tiendas

`eas.json` ya define dos perfiles de compilación, los dos contra la API de producción:

- `preview`: instalable directamente (APK en Android, distribución interna en iOS) para probar con personas reales antes de publicar.
- `production`: la versión para Google Play y App Store. El número de compilación sube solo en cada build.

Pasos, en orden:

1. **Identificador de la app**: `app.json` usa `com.nvcorx.designyourcore` para iOS y Android. Es el nombre interno único de la app en las tiendas y no se puede cambiar después de la primera publicación.
2. **Cuenta de Expo (EAS)**: `npx eas-cli login` y después `npx eas-cli init`, que añade `extra.eas.projectId` a `app.json`. Con eso la app registra el token push del dispositivo en la API (`PUT /api/v2/devices`) al activar el recordatorio. Sin él, el recordatorio local funciona igual y el registro push se omite.
3. **Prueba interna**: `npx eas-cli build --profile preview --platform android` genera un APK para instalar en cualquier Android.
4. **Compilar para las tiendas**: `npx eas-cli build --profile production --platform all` (en la nube; no hay carpetas `ios/` ni `android/` en el repositorio). EAS pide las credenciales de Apple la primera vez y genera los certificados.
5. **Enviar**: `npx eas-cli submit --platform ios` y `--platform android`. Google Play exige que la primera subida se haga a mano desde su consola.
6. **Ficha de la tienda**: la política de privacidad es la página `/privacidad` del sitio de marca. Las dos tiendas piden poder borrar la cuenta desde la app: está en Perfil → Borrar mi cuenta.

La lista completa para salir a producción (API, web, sitio y app) está en [docs/lanzamiento.md](../../docs/lanzamiento.md).
