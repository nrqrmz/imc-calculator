// Ciclo escolar SEP: de agosto a julio.
export function cicloEscolar(fecha) {
  const [anio, mes] = fecha.split('-').map(Number);
  return mes >= 8 ? `${anio}–${anio + 1}` : `${anio - 1}–${anio}`;
}
