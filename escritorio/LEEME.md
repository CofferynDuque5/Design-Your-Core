# Design Your Core para la computadora

Una ventana propia con el panel (https://designyourcorepanel.nvcorx.com), para Windows, Mac y Linux.
Los datos son los de tu cuenta, como en la web y el teléfono.

- Probar: `npm install` y `npm start` (con `DYC_APP_URL=http://localhost:5173` para usar la web local).
- Generar los instaladores: `npm run dist` (en `dist/`):
  - Windows: `DesignYourCore-<versión>-Windows.exe` (se abre sin instalar nada).
  - Mac: `DesignYourCore-<versión>-Mac-x64.zip` (Intel) y `-Mac-arm64.zip` (Apple M1 o más nuevo) (sin firmar: la primera vez, clic derecho > Abrir).
  - Linux: `DesignYourCore-<versión>-linux.AppImage`.

Sin firma digital, Windows muestra «Windows protegió tu PC»: «Más información» > «Ejecutar de todas formas».
Para quitar ese aviso hace falta un certificado de firma de código (de pago).

En Linux, generar el `.exe` necesita `wine` (64 bits). Los de Mac se generan sin firmar desde Linux.
