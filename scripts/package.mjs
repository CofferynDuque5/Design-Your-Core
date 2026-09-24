// Genera los paquetes para subir a cPanel: release/design-your-core-{api,web,sitio}-<versión>.zip.
// Cada ZIP trae una carpeta con lo que hay que subir y un LEEME.txt con los pasos.
//
//   pnpm package
//
// Los dominios se toman de estas variables (por defecto, los provisionales de
// docs/lanzamiento.md): DYC_API_URL, DYC_APP_URL, DYC_SITE_URL, DYC_CONTACT_EMAIL.
// Ningún secreto entra en los paquetes: core-config.env se rellena en el servidor.
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const OUT = join(ROOT, 'release');
const STAGE = join(OUT, '.stage');

const url = (v) => v.replace(/\/+$/, '');
const API_URL = url(process.env.DYC_API_URL || 'https://designyourcorebackend.nvcorx.com');
const APP_URL = url(process.env.DYC_APP_URL || 'https://app.designyourcore.nvcorx.com');
const SITE_URL = url(process.env.DYC_SITE_URL || 'https://designyourcore.nvcorx.com');
const CONTACT = process.env.DYC_CONTACT_EMAIL || '';
// Dominio donde sigue la app anterior: se mantiene en CORS para no cortarla.
const LEGACY_APP_URL = 'https://desingyourcore.nvcorx.com';

const host = (u) => new URL(u).host;
const version = `${JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version}-${execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim()}`;

const run = (cmd, env = {}) => execSync(cmd, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...env } });

function zip(name, folder, readme) {
  const dir = join(STAGE, name);
  writeFileSync(join(dir, 'LEEME.txt'), readme.trim() + '\n');
  const file = join(OUT, `design-your-core-${name}-${version}.zip`);
  rmSync(file, { force: true });
  execSync(`zip -qr "${file}" .`, { cwd: dir });
  console.log(`✓ ${file.replace(ROOT + '/', '')}  (${folder})`);
}

rmSync(STAGE, { recursive: true, force: true });
mkdirSync(STAGE, { recursive: true });

// 1. Compilar con los dominios de producción.
run('pnpm build', { VITE_API_URL: API_URL, SITE_URL, PUBLIC_APP_URL: APP_URL, PUBLIC_CONTACT_EMAIL: CONTACT });
run('pnpm --filter @dyc/api bundle');

// 2. API.
const apiDir = join(STAGE, 'api', 'subir-a-la-app-node');
cpSync(join(ROOT, 'apps/api/release'), apiDir, { recursive: true });
const config = readFileSync(join(apiDir, 'core-config.env.example'), 'utf8')
  .replace(/^CLIENT_ORIGIN=.*$/m, `CLIENT_ORIGIN=${APP_URL},${LEGACY_APP_URL}`)
  .replace(/^PUBLIC_URL=.*$/m, `PUBLIC_URL=${API_URL}`);
writeFileSync(join(apiDir, 'core-config.env.example'), config);
zip('api', 'subir-a-la-app-node', `
Design Your Core · API ${version}
Dominio: ${API_URL}

1. Antes de nada, en Neon crea una rama (Branch) de la base de datos: es tu copia de seguridad.
2. En cPanel, abre el Administrador de archivos y entra en la carpeta de la app Node actual
   (la de ${host(API_URL)}). Descarga una copia de lo que hay, para poder volver atrás.
3. Sube el CONTENIDO de la carpeta "subir-a-la-app-node" a esa carpeta, reemplazando lo anterior.
   Conserva tu core-config.env: es el que tiene la base de datos.
4. Edita core-config.env tomando como guía core-config.env.example:
   - DATABASE_URL: la misma de siempre.
   - JWT_SECRET: pon uno NUEVO (el anterior se considera expuesto). Todos tendrán que volver a entrar una vez.
   - CLIENT_ORIGIN y PUBLIC_URL: copia las líneas del ejemplo.
5. En "Setup Node.js App": archivo de inicio dist/index.js, Node 20 o 22.
   Pulsa "Run NPM Install" y después "Restart".
6. Abre ${API_URL}/api/health: debe decir {"ok":true,"service":"core-cloud"}.

Al arrancar, la API añade sus tablas nuevas a la base de datos sin tocar las cuentas ni los datos.
Guía completa: docs/lanzamiento.md en el repositorio.
`);

// 3. App web.
const webDir = join(STAGE, 'web', 'subir-a-public_html');
cpSync(join(ROOT, 'apps/web/dist'), webDir, { recursive: true });
if (!existsSync(join(webDir, '.htaccess'))) throw new Error('Falta .htaccess en la web');
zip('web', 'subir-a-public_html', `
Design Your Core · App web ${version}
Dominio: ${APP_URL}   ·   Usa la API de ${API_URL}

1. En cPanel, en "Dominios", crea el subdominio ${host(APP_URL)} si aún no existe.
   Activa el certificado SSL (AutoSSL) para que abra con https.
2. En el Administrador de archivos, activa "Mostrar archivos ocultos" (hace falta para .htaccess).
3. Sube el CONTENIDO de la carpeta "subir-a-public_html" a la carpeta raíz de ese subdominio.
4. Abre ${APP_URL}: debe salir la pantalla para entrar.

La app anterior sigue funcionando en su dominio con las mismas cuentas mientras quieras.
`);

// 4. Sitio de marca.
const siteDir = join(STAGE, 'sitio', 'subir-a-public_html');
cpSync(join(ROOT, 'apps/site/dist'), siteDir, { recursive: true });
zip('sitio', 'subir-a-public_html', `
Design Your Core · Sitio de marca ${version}
Dominio: ${SITE_URL}   ·   Los botones llevan a ${APP_URL}

1. En cPanel, en "Dominios", crea ${host(SITE_URL)} si aún no existe y activa su SSL.
2. En el Administrador de archivos, activa "Mostrar archivos ocultos".
3. Sube el CONTENIDO de la carpeta "subir-a-public_html" a la carpeta raíz de ese dominio.
4. Abre ${SITE_URL}, ${SITE_URL}/privacidad y ${SITE_URL}/condiciones.
`);

rmSync(STAGE, { recursive: true, force: true });
