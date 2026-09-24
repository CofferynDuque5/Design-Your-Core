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

## Iconos

`pnpm --filter @dyc/mobile icons` regenera `assets/` (icono, icono adaptable de Android, pantalla de carga y favicon) a partir del logotipo. Usa el Chromium de Playwright de `@dyc/web`.

## Publicar en las tiendas

Pendiente de decidir con el equipo:

1. **Identificadores**: `app.json` usa `com.nvcorx.designyourcore` como provisional para iOS y Android. Cámbialo antes de la primera compilación; después no se puede cambiar sin publicar una app nueva.
2. **Cuenta de Expo (EAS)**: `npx eas-cli init` añade `extra.eas.projectId` a la configuración. Con eso la app registra el token push del dispositivo en la API (`PUT /api/v2/devices`) al activar el recordatorio. Sin él, el recordatorio local funciona igual y el registro push se omite.
3. **Compilar**: `npx eas-cli build --platform all` (en la nube; no hay carpetas `ios/` ni `android/` en el repositorio).
4. **Textos de la ficha**: la política de privacidad del sitio de marca sirve de base, pero conviene revisarla con criterio legal.
