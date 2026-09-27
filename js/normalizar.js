// Normalización de textos capturados a mano o que vienen de un CSV.

// Sin acentos, en minúsculas y sin espacios de más: "  María  José " → "maria jose".
export function normalizarTexto(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

// Nombre para guardar: conserva acentos y mayúsculas, quita espacios de más.
export function limpiarNombre(nombre) {
  return String(nombre ?? '').trim().replace(/\s+/g, ' ');
}

// Clave de identidad de un niño: nombre normalizado + fecha de nacimiento.
export function claveNino(nombre, fechaNacimiento) {
  return `${normalizarTexto(nombre)}|${fechaNacimiento}`;
}

const SEXOS = { f: 'F', nina: 'F', mujer: 'F', m: 'M', nino: 'M', hombre: 'M' };

export function parsearSexo(texto) {
  return SEXOS[normalizarTexto(texto)] ?? null;
}

// Número positivo con punto o coma decimal: "29.5", "29,5", "125". Devuelve null si no es válido.
export function parsearDecimal(texto) {
  const t = String(texto ?? '').trim().replace(',', '.');
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : null;
}
