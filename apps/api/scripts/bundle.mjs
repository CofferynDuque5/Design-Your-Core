// Crea apps/api/release/: la API lista para subir a cPanel (o a cualquier
// servidor Node) sin el resto del monorepo. Los paquetes internos (@dyc/*) se
// incluyen dentro del bundle; las dependencias de npm se instalan en el servidor.
import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const external = Object.keys(pkg.dependencies).filter((d) => !d.startsWith('@dyc/'));

rmSync('release', { recursive: true, force: true });
mkdirSync('release', { recursive: true });

// Dos archivos: index.js solo usa lo que trae Node y carga server.js; así, si faltan
// dependencias o configuración, index.js puede responder con el motivo (lib/safeMode.ts).
const common = { bundle: true, platform: 'node', format: 'esm', target: 'node20', sourcemap: true, logLevel: 'warning' };
await build({ ...common, entryPoints: ['src/server.ts'], outfile: 'release/dist/server.js', external });
await build({ ...common, entryPoints: ['src/index.ts'], outfile: 'release/dist/index.js', external: ['./server.js'] });

cpSync('prisma', 'release/prisma', { recursive: true });
cpSync('migrations', 'release/migrations', { recursive: true });
cpSync('core-config.env.example', 'release/core-config.env.example');

// En cPanel (CloudLinux) «Run NPM Install» no corre en la carpeta de la app sino en
// ~/nodevenv/<app>/<versión>/lib, con package.json enlazado. Ahí no está prisma/, así
// que se busca el esquema junto al package.json real o en la carpeta de la app.
const generate = [
  "const f=require('fs'),p=require('path'),{execSync:x}=require('child_process');",
  "const c=[p.dirname(f.realpathSync('package.json')),process.cwd()];",
  "const m=process.cwd().match(/^(.*)[\\/]nodevenv[\\/](.+)[\\/][^\\/]+[\\/]lib$/);",
  'if(m)c.push(p.join(m[1],m[2]));',
  "const s=c.map(d=>p.join(d,'prisma','schema.prisma')).find(f.existsSync);",
  "if(!s)throw new Error('No encuentro prisma/schema.prisma en: '+c.join(', '));",
  "x('prisma generate --schema '+JSON.stringify(s),{stdio:'inherit'});",
].join('');

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
      scripts: { start: 'node dist/index.js', postinstall: `node -e "${generate}"` },
      dependencies: Object.fromEntries(external.map((d) => [d, pkg.dependencies[d]])),
    },
    null,
    2,
  ) + '\n',
);
console.log('release/ listo: sube su contenido a la carpeta de la app en el servidor.');
