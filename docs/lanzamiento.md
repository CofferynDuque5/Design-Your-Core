# Salir a producción

Lista ordenada para publicar esta versión: la API, la app web, el sitio de marca y la app móvil. Los detalles técnicos de cada despliegue están en [instalacion.md](instalacion.md). La app móvil tiene su propia guía en [apps/mobile/README.md](../apps/mobile/README.md).

## 1. Decisiones del dueño del producto

Son las únicas cosas que el código no puede decidir. Mientras no se decidan, se usan los valores provisionales de la tabla.

| Decisión | Valor provisional | Dónde se cambia |
|---|---|---|
| Dominio del sitio de marca | `https://designyourcore.nvcorx.com` | `SITE_URL` en `apps/site/.env.production` |
| Dominio de la app web | `https://app.designyourcore.nvcorx.com` | `PUBLIC_APP_URL` (sitio) y `CLIENT_ORIGIN` (API) |
| Dominio de la API | `https://designyourcorebackend.nvcorx.com` (el que ya usa la app publicada) | `VITE_API_URL` (web), `eas.json` (móvil), `PUBLIC_URL` (API) |
| Identificador de la app en las tiendas | `com.nvcorx.designyourcore` | `apps/mobile/app.json`. **No se puede cambiar después de publicar** |
| Correo de contacto en la página de privacidad | ninguno | `PUBLIC_CONTACT_EMAIL` (sitio) |
| Bóveda de contraseñas de la app anterior | la app nueva no la muestra, pero sus datos siguen guardados en la cuenta | Guardaba contraseñas en texto plano: se recomienda borrar esos datos |
| Texto de privacidad | borrador que describe lo que la app guarda hoy | `apps/site/src/pages/privacidad.astro`. Conviene una revisión legal |

## 2. Preparar la configuración de la API

1. **Genera un `JWT_SECRET` nuevo.** El anterior viajó dentro de un ZIP y se considera expuesto:

   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```

   Al cambiarlo, todas las personas tienen que volver a entrar una vez. Es lo esperado.
2. **Corrige los dominios con «desing».** La configuración anterior usa `desingyourcore.nvcorx.com` en `CLIENT_ORIGIN` y en el correo. Si el dominio real se escribe «design», los enlaces de invitación y los correos fallan.
3. Rellena `core-config.env` a partir de `apps/api/core-config.env.example`. No lo subas nunca a git.

## 3. Copia de seguridad de la base de datos

Al arrancar, la API nueva aplica las migraciones pendientes. Son aditivas: crean tablas nuevas y hacen que al borrar una cuenta se borren también sus datos. No tocan cuentas ni datos existentes, y la API anterior sigue funcionando sobre el esquema nuevo. Aun así, antes de desplegar:

- En Neon, crea una rama (*branch*) de la base de producción. Es una copia instantánea a la que se puede volver.

## 4. Desplegar

En este orden, porque la web y la app dependen de la API:

1. **API**: `pnpm build && pnpm --filter @dyc/api bundle`, sube `apps/api/release/` y reinicia. Comprueba `https://TU-API/api/health`. Guarda la carpeta de la versión anterior para poder volver.
2. **App web**: `pnpm build` y sube `apps/web/dist/` a su dominio.
3. **Sitio de marca**: sube `apps/site/dist/` a su dominio.

## 5. Comprobar después de desplegar

Con una cuenta nueva y con una cuenta que ya existía:

- [ ] Crear cuenta, completar la bienvenida y ver la pantalla Hoy.
- [ ] Hacer el check-in, marcar un hábito y un reto. Recargar la página: todo sigue marcado.
- [ ] Entrar con una cuenta de la app anterior: sus datos aparecen en «Más».
- [ ] La app anterior (si sigue publicada) sigue entrando con la misma cuenta.
- [ ] «¿Olvidaste tu contraseña?» envía el correo y el enlace abre la página para elegir una nueva.
- [ ] Invitar a la pareja por correo: el enlace abre la app web.
- [ ] En el móvil, instalar la web como app (PWA). Con la app abierta, quitar la conexión: aparece el aviso «Estás sin conexión» y se sigue viendo lo último que se cargó.
- [ ] El sitio de marca: los botones «Entrar» y «Crear cuenta» llevan a la app web.

## 6. App móvil

Hace falta una cuenta de Expo (gratis), una de Google Play (pago único) y una de Apple Developer (anual), a nombre del dueño del producto. Los pasos están en [apps/mobile/README.md](../apps/mobile/README.md#publicar-en-las-tiendas). Antes de enviarla a revisión:

- [ ] Compilar el perfil `preview` e instalarlo en un Android y un iPhone reales.
- [ ] Entrar, activar el recordatorio diario y comprobar que llega a la hora elegida.
- [ ] Probar con VoiceOver (iOS) o TalkBack (Android) la pantalla Hoy y el check-in.
- [ ] Borrar una cuenta de prueba desde Perfil. Las dos tiendas lo exigen.

## Volver atrás

- **API**: vuelve a subir la carpeta de la versión anterior y reinicia. La base de datos no necesita cambios.
- **Web y sitio**: son archivos estáticos; vuelve a subir la versión anterior.
- **Base de datos**: solo si algo salió mal con los datos, restaura desde la rama de Neon del paso 3.
