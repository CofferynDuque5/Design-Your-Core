// Crea apps/api/release/: la API lista para subir a cPanel (o a cualquier
// servidor Node) sin el resto del monorepo. Los paquetes internos (@dyc/*) se
// incluyen dentro del bundle; las dependencias de npm se instalan en el servidor.
import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const external = Object.keys(pkg.dependencies).filter((d) => !d.startsWith('@dyc/'));

rmSync('release', { recursive: true, force: true });
mkdirSync('release', { recursive: true });

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'release/dist/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  external,
  sourcemap: true,
  logLevel: 'warning',
});

cpSync('prisma', 'release/prisma', { recursive: true });
cpSync('migrations', 'release/migrations', { recursive: true });
cpSync('core-config.env.example', 'release/core-config.env.example');

writeFileSync(
  'release/package.json',
  JSON.stringify(
    {
      name: 'design-your-core-api',
      private: true,
      version: pkg.version,
      type: 'module',
      main: 'dist/index.js',
      engines: { node: '>=20' },
      scripts: { start: 'node dist/index.js', postinstall: 'prisma generate' },
      dependencies: Object.fromEntries(external.map((d) => [d, pkg.dependencies[d]])),
    },
    null,
    2,
  ) + '\n',
);
console.log('release/ listo: sube su contenido a la carpeta de la app en el servidor.');
