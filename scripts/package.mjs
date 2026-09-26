// Genera los paquetes para subir a cPanel: release/design-your-core-{api,web,sitio}-<versión>.zip.
// Se usa «Extraer» del Administrador de archivos, sin mover nada después:
// - API: trae la carpeta core-api/ (DYC_API_FOLDER). Se extrae en la carpeta de
//   inicio y queda en el «Application root» de la app Node. Incluye LEEME.txt.
// - Web y sitio: los archivos van en la raíz del ZIP y se extraen en la carpeta del dominio.
//
//   pnpm package
//
// Los dominios se toman de estas variables (por defecto, los provisionales de
// docs/lanzamiento.md): DYC_API_URL, DYC_APP_URL, DYC_SITE_URL, DYC_CONTACT_EMAIL,
// DYC_LEGACY_APP_URL. DYC_API_FOLDER es el nombre de la carpeta de la API (core-api).
// DYC_SERVER_HOME, DYC_API_DOCROOT y DYC_NODE_MAJOR describen el servidor para el
// .htaccess que conecta el dominio de la API con la app Node (CloudLinux Passenger).
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
const API_FOLDER = process.env.DYC_API_FOLDER || 'core-api';
const SERVER_HOME = url(process.env.DYC_SERVER_HOME || '/home/nvcorxco');
const NODE_MAJOR = process.env.DYC_NODE_MAJOR || '20';
// Dominios de la app anterior: siguen en CORS para no cortarla, y la sección
// «Más» de la app nueva enlaza a DYC_LEGACY_APP_URL (hoy, designyourcorepanel).
const LEGACY_APP_URL = url(process.env.DYC_LEGACY_APP_URL || 'https://designyourcorepanel.nvcorx.com');
const LEGACY_ORIGINS = [...new Set([LEGACY_APP_URL, 'https://desingyourcore.nvcorx.com'])];

const host = (u) => new URL(u).host;
const API_DOCROOT = process.env.DYC_API_DOCROOT || `public_html/${host(API_URL)}`;
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
run('pnpm build', { VITE_API_URL: API_URL, VITE_LEGACY_APP_URL: LEGACY_APP_URL, SITE_URL, PUBLIC_APP_URL: APP_URL, PUBLIC_CONTACT_EMAIL: CONTACT });
run('pnpm --filter @dyc/api bundle');

// 2. API: el ZIP trae la carpeta ${API_FOLDER}/ y se extrae en la carpeta de inicio,
// igual que el ZIP original del backend. Trae también el .htaccess de la carpeta del
// dominio: sin él, LiteSpeed responde 404 en vez de pasar las visitas a la app Node.
const apiDir = join(STAGE, 'api', API_FOLDER);
const docroot = join(STAGE, 'api', API_DOCROOT);
mkdirSync(docroot, { recursive: true });
writeFileSync(
  join(docroot, '.htaccess'),
  `# DO NOT REMOVE. CLOUDLINUX PASSENGER CONFIGURATION BEGIN
PassengerAppRoot "${SERVER_HOME}/${API_FOLDER}"
PassengerBaseURI "/"
PassengerNodejs "${SERVER_HOME}/nodevenv/${API_FOLDER}/${NODE_MAJOR}/bin/node"
PassengerAppType node
PassengerStartupFile dist/index.js
# DO NOT REMOVE. CLOUDLINUX PASSENGER CONFIGURATION END
`,
);
cpSync(join(ROOT, 'apps/api/release'), apiDir, { recursive: true });
const config = readFileSync(join(apiDir, 'core-config.env.example'), 'utf8')
  .replace(/^CLIENT_ORIGIN=.*$/m, `CLIENT_ORIGIN=${[APP_URL, ...LEGACY_ORIGINS].join(',')}`)
  .replace(/^PUBLIC_URL=.*$/m, `PUBLIC_URL=${API_URL}`);
writeFileSync(join(apiDir, 'core-config.env.example'), config);
writeFileSync(
  join(apiDir, 'LEEME.txt'),
  `
Design Your Core · API ${version}
Dominio: ${API_URL}

1. En Neon crea una rama (Branch) de la base de datos: es tu copia de seguridad.
2. En cPanel, «Setup Node.js App»: comprueba que el «Application root» de ${host(API_URL)} sea ${API_FOLDER}
   y su versión de Node ${NODE_MAJOR}. Pulsa «Stop App».
3. Sube este ZIP a tu carpeta de inicio (${SERVER_HOME}, donde está public_html), selecciónalo
   y pulsa «Extraer». Acepta reemplazar los archivos. Deja:
   - la carpeta ${API_FOLDER} con la API;
   - ${API_DOCROOT}/.htaccess (archivo oculto), que conecta el dominio con la app Node.
   Tu core-config.env no se toca: este ZIP no trae uno.
4. La configuración va en las variables de la app en «Setup Node.js App», o en ${API_FOLDER}/core-config.env
   (guía: core-config.env.example):
   - DATABASE_URL: la misma de siempre.
   - JWT_SECRET: pon uno NUEVO (el anterior se considera expuesto). Todos tendrán que volver a entrar una vez.
   - CLIENT_ORIGIN y PUBLIC_URL: copia las líneas del ejemplo.
5. En «Setup Node.js App»: archivo de inicio dist/index.js. Pulsa «Run NPM Install» y después «Start App».
6. Abre ${API_URL}/api/health: debe decir {"ok":true,"service":"core-cloud"}.

Al arrancar, la API añade sus tablas nuevas a la base de datos sin tocar las cuentas ni los datos.
`.trimStart(),
);
zip('api', join(STAGE, 'api'));

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
