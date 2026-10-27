// Reglas que se muestran mientras se escribe una contraseña nueva (registro y cambio).
// La API solo exige 8 caracteres para no romper la app anterior; la web pide además
// mayúscula, minúscula y número, y el símbolo queda como recomendación.

export interface PasswordRule {
  id: 'length' | 'upper' | 'lower' | 'number' | 'symbol';
  label: string;
  required: boolean;
  test: (password: string) => boolean;
}

export const PASSWORD_MIN = 8;

export const PASSWORD_RULES: readonly PasswordRule[] = [
  { id: 'length', label: `Mínimo ${PASSWORD_MIN} caracteres`, required: true, test: (p) => [...p].length >= PASSWORD_MIN },
  { id: 'upper', label: 'Una letra mayúscula (A-Z)', required: true, test: (p) => /\p{Lu}/u.test(p) },
  { id: 'lower', label: 'Una letra minúscula (a-z)', required: true, test: (p) => /\p{Ll}/u.test(p) },
  { id: 'number', label: 'Un número (0-9)', required: true, test: (p) => /\p{Nd}/u.test(p) },
  { id: 'symbol', label: 'Un símbolo, opcional (ej. ! @ # $ %)', required: false, test: (p) => /[^\p{L}\p{N}\s]/u.test(p) },
];

export interface PasswordCheck {
  id: PasswordRule['id'];
  label: string;
  required: boolean;
  ok: boolean;
}

export function passwordChecks(password: string): PasswordCheck[] {
  return PASSWORD_RULES.map(({ id, label, required, test }) => ({ id, label, required, ok: test(password) }));
}

/** true si cumple todas las reglas obligatorias. */
export function isStrongPassword(password: string): boolean {
  return PASSWORD_RULES.every((r) => !r.required || r.test(password));
}

/** Formato de correo razonable: algo@dominio.tld, sin espacios. */
export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[^\s@.]{2,}$/.test(value.trim());
}
