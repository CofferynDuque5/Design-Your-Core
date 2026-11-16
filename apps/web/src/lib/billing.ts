/** «9 de noviembre de 2027». */
export function formatLongDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' });
}
