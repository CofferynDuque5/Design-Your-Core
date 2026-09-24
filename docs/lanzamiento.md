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

`pnpm package` compila todo con los dominios de producción y deja tres ZIP en `release/`: la API, la app web y el sitio. Cada ZIP se sube a su carpeta en el Administrador de archivos de cPanel y se pulsa «Extraer». El de la API trae la carpeta `core-api` (con un `LEEME.txt` con los pasos) y el `.htaccess` que conecta su dominio con la app Node, y se extrae en la carpeta de inicio; el de la web y el del sitio llevan los archivos sueltos y se extraen en la carpeta del dominio. Ningún secreto va dentro: `core-config.env` se completa en el servidor.

Los dominios salen de `DYC_API_URL`, `DYC_APP_URL`, `DYC_SITE_URL` y `DYC_CONTACT_EMAIL`; la carpeta de inicio del servidor, de `DYC_SERVER_HOME` (hoy `/home/nvcorxco`), y la versión de Node, de `DYC_NODE_MAJOR` (20). Sin ellas se usan los valores provisionales de la tabla del paso 1:

```bash
DYC_SITE_URL=https://midominio.com DYC_APP_URL=https://app.midominio.com pnpm package
```

Súbelos en este orden, porque la web y la app dependen de la API:

1. **API**: en «Setup Node.js App» comprueba que el «Application root» de la API sea `core-api`. Comprime esa carpeta y descárgala como copia. Sube el ZIP a la carpeta de inicio (donde está `public_html`) y extráelo ahí: actualiza `core-api`. Completa `core-config.env` (o las variables de la app en el panel), pulsa «Run NPM Install» y reinicia. Comprueba `https://TU-API/api/health`.
2. **App web**: crea el subdominio de la app en «Dominios» si no existe y extrae el ZIP en su carpeta raíz. Incluye un `.htaccess` oculto.
3. **Sitio de marca**: comprime y descarga lo que haya en la carpeta del dominio, bórralo y extrae el ZIP ahí.

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
