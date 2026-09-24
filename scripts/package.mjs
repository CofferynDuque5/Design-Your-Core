// Genera los paquetes para subir a cPanel: release/design-your-core-{api,web,sitio}-<versión>.zip.
// Los archivos van en la raíz del ZIP: se sube a la carpeta de destino y se usa
// «Extraer» del Administrador de archivos, sin mover nada después. El de la API
// trae además LEEME.txt con los pasos (esa carpeta no es pública).
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

function zip(name, dir) {
  const file = join(OUT, `design-your-core-${name}-${version}.zip`);
  execSync(`zip -qr "${file}" .`, { cwd: dir });
  console.log(`✓ ${file.replace(ROOT + '/', '')}`);
}

// Empezar de cero: solo quedan los paquetes de esta versión.
rmSync(OUT, { recursive: true, force: true });
mkdirSync(STAGE, { recursive: true });

// 1. Compilar con los dominios de producción.
run('pnpm build', { VITE_API_URL: API_URL, SITE_URL, PUBLIC_APP_URL: APP_URL, PUBLIC_CONTACT_EMAIL: CONTACT });
run('pnpm --filter @dyc/api bundle');

// 2. API: se extrae en la carpeta raíz de la app Node (Application root en «Setup Node.js App»).
const apiDir = join(STAGE, 'api');
cpSync(join(ROOT, 'apps/api/release'), apiDir, { recursive: true });
const config = readFileSync(join(apiDir, 'core-config.env.example'), 'utf8')
  .replace(/^CLIENT_ORIGIN=.*$/m, `CLIENT_ORIGIN=${APP_URL},${LEGACY_APP_URL}`)
  .replace(/^PUBLIC_URL=.*$/m, `PUBLIC_URL=${API_URL}`);
writeFileSync(join(apiDir, 'core-config.env.example'), config);
writeFileSync(
  join(apiDir, 'LEEME.txt'),
  `
Design Your Core · API ${version}
Dominio: ${API_URL}

1. En Neon crea una rama (Branch) de la base de datos: es tu copia de seguridad.
2. En cPanel, «Setup Node.js App»: mira qué carpeta es el «Application root» de ${host(API_URL)}.
   En el Administrador de archivos, comprime esa carpeta y descarga el ZIP: es tu copia para volver atrás.
3. Sube este ZIP a esa carpeta, selecciónalo y pulsa «Extraer». Acepta reemplazar los archivos.
   Tu core-config.env no se toca: este ZIP no trae uno.
4. Edita core-config.env tomando como guía core-config.env.example:
   - DATABASE_URL: la misma de siempre.
   - JWT_SECRET: pon uno NUEVO (el anterior se considera expuesto). Todos tendrán que volver a entrar una vez.
   - CLIENT_ORIGIN y PUBLIC_URL: copia las líneas del ejemplo.
5. En «Setup Node.js App»: archivo de inicio dist/index.js, Node 20 o 22.
   Pulsa «Run NPM Install» y después «Restart».
6. Abre ${API_URL}/api/health: debe decir {"ok":true,"service":"core-cloud"}.

Al arrancar, la API añade sus tablas nuevas a la base de datos sin tocar las cuentas ni los datos.
`.trimStart(),
);
zip('api', apiDir);

// 3. App web: se extrae en la carpeta raíz de ${APP_URL}.
const webDir = join(STAGE, 'web');
cpSync(join(ROOT, 'apps/web/dist'), webDir, { recursive: true });
if (!existsSync(join(webDir, '.htaccess'))) throw new Error('Falta .htaccess en la web');
zip('web', webDir);

// 4. Sitio de marca: se extrae en la carpeta raíz de ${SITE_URL}.
const siteDir = join(STAGE, 'sitio');
cpSync(join(ROOT, 'apps/site/dist'), siteDir, { recursive: true });
if (!existsSync(join(siteDir, '.htaccess'))) throw new Error('Falta .htaccess en el sitio');
zip('sitio', siteDir);

rmSync(STAGE, { recursive: true, force: true });
