// localStorage puede fallar (modo privado, cookies bloqueadas): nunca rompe la app.

export function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Sin almacenamiento: la sesión dura lo que dure la pestaña.
  }
}
