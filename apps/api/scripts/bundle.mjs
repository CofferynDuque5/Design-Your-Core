// Crea apps/api/release/: la API lista para subir a cPanel (o a cualquier
// servidor Node) sin el resto del monorepo. TODO va dentro del bundle (también
// las dependencias de npm, que son JavaScript puro): en el servidor no hace falta
// «Run NPM Install» ni generar nada.
import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
// Opcionales de `pg` que nunca se usan en Node.
const external = ['pg-native', 'pg-cloudflare', 'cloudflare:sockets'];

rmSync('release', { recursive: true, force: true });
mkdirSync('release', { recursive: true });

// Dos archivos. dist/server.mjs es la API (ESM). dist/index.js es CommonJS y solo usa lo
// que trae Node: el servidor de Node de cPanel (LiteSpeed/Passenger) carga el archivo de
// inicio con require(), que no acepta ESM con «await» de nivel superior. index.js carga
// server.mjs con import() y, si falla, responde con el motivo (lib/safeMode.ts).
const common = { bundle: true, platform: 'node', target: 'node18', sourcemap: true, logLevel: 'warning', legalComments: 'none' };
await build({
  ...common,
  entryPoints: ['src/server.ts'],
  outfile: 'release/dist/server.mjs',
  format: 'esm',
  external,
  // Las dependencias CommonJS (express, pg…) usan require() para los módulos de Node.
  banner: { js: "import { createRequire as __dycRequire } from 'node:module'; const require = __dycRequire(import.meta.url);" },
});
await build({ ...common, entryPoints: ['src/index.ts'], outfile: 'release/dist/index.js', format: 'cjs', external: ['./server.js'] });
const entry = readFileSync('release/dist/index.js', 'utf8');
if (!entry.includes('import("./server.js")')) throw new Error('index.js debe cargar server con import()');
writeFileSync('release/dist/index.js', entry.replace('import("./server.js")', 'import("./server.mjs")'));

cpSync('migrations', 'release/migrations', { recursive: true });
cpSync('core-config.env.example', 'release/core-config.env.example');

writeFileSync(
  'release/package.json',
  JSON.stringify(
    {
      name: 'design-your-core-api',
      private: true,
      version: pkg.version,
      description: 'Todo va dentro de dist/: no necesita instalar dependencias.',
      main: 'dist/index.js',
      engines: { node: '>=18' },
      scripts: { start: 'node dist/index.js' },
      dependencies: {},
    },
    null,
    2,
  ) + '\n',
);
console.log('release/ listo: sube su contenido a la carpeta de la app en el servidor.');
