// Talleres Montessori de la escuela (uno de cada uno) y sus grados SEP.
import { normalizarTexto } from './normalizar.js';

export const TALLERES = [
  { clave: 'CN', nombre: 'Casa de Niños', corto: 'CN', nivel: 'preescolar', grados: [1, 2, 3] },
  { clave: 'T1', nombre: 'Taller I', corto: 'T-I', nivel: 'primaria', grados: [1, 2, 3] },
  { clave: 'T2', nombre: 'Taller II', corto: 'T-II', nivel: 'primaria', grados: [4, 5, 6] },
  { clave: 'T3', nombre: 'Taller III', corto: 'T-III', nivel: 'secundaria', grados: [1, 2, 3] },
];

export function obtenerTaller(clave) {
  return TALLERES.find((t) => t.clave === clave) ?? null;
}

export function esParValido(clave, grado) {
  const taller = obtenerTaller(clave);
  return Boolean(taller) && taller.grados.includes(grado);
}

// "T-II · 5°"
export function etiquetaTallerGrado(clave, grado) {
  return `${obtenerTaller(clave)?.corto ?? clave} · ${grado}°`;
}

const ALIAS = {
  cn: 'CN', casadeninos: 'CN',
  t1: 'T1', talleri: 'T1', taller1: 'T1',
  t2: 'T2', tallerii: 'T2', taller2: 'T2',
  t3: 'T3', talleriii: 'T3', taller3: 'T3',
};

// Acepta la clave (CN, T1…) o el nombre ("Taller II", "casa de niños"). Devuelve la clave o null.
export function parsearTaller(texto) {
  return ALIAS[normalizarTexto(texto).replace(/[\s-]/g, '')] ?? null;
}
