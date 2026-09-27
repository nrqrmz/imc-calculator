// Operaciones sobre el objeto de datos { version, ninos, mediciones }.
// Las funciones que modifican cambian el objeto recibido; store.js les pasa una copia.
import { claveNino, limpiarNombre, normalizarTexto } from './normalizar.js';
import { edadCalendario } from './fechas.js';
import { RANGOS } from './validacion.js';

export const VERSION = 1;
const nuevoId = () => crypto.randomUUID();

export function crearDatosVacios() {
  return { version: VERSION, ninos: [], mediciones: [] };
}

export function obtenerNino(datos, id) {
  return datos.ninos.find((n) => n.id === id) ?? null;
}

export function buscarNinoPorClave(datos, nombre, fechaNacimiento) {
  const clave = claveNino(nombre, fechaNacimiento);
  return datos.ninos.find((n) => claveNino(n.nombre, n.fechaNacimiento) === clave) ?? null;
}

// Coincidencia parcial por nombre, ordenada alfabéticamente.
export function buscarNinosPorNombre(datos, texto) {
  const q = normalizarTexto(texto);
  if (!q) return [];
  return datos.ninos
    .filter((n) => normalizarTexto(n.nombre).includes(q))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

// Mediciones de un niño, de la más reciente a la más antigua.
export function medicionesDe(datos, ninoId) {
  return datos.mediciones
    .filter((m) => m.ninoId === ninoId)
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}

export function buscarMedicion(datos, ninoId, fecha) {
  return datos.mediciones.find((m) => m.ninoId === ninoId && m.fecha === fecha) ?? null;
}

export function agregarNino(datos, { nombre, fechaNacimiento, sexo }, generarId = nuevoId) {
  if (buscarNinoPorClave(datos, nombre, fechaNacimiento)) {
    throw new Error('Ya existe un niño con ese nombre y fecha de nacimiento');
  }
  const nino = { id: generarId(), nombre: limpiarNombre(nombre), fechaNacimiento, sexo };
  datos.ninos.push(nino);
  return nino;
}

export function actualizarNino(datos, id, cambios) {
  const nino = obtenerNino(datos, id);
  if (!nino) throw new Error('El niño no existe');
  const nuevo = { ...nino, ...cambios, id, nombre: limpiarNombre(cambios.nombre ?? nino.nombre) };
  const otro = buscarNinoPorClave(datos, nuevo.nombre, nuevo.fechaNacimiento);
  if (otro && otro.id !== id) throw new Error('Ya existe otro niño con ese nombre y fecha de nacimiento');
  for (const m of medicionesDe(datos, id)) {
    const { anios } = edadCalendario(nuevo.fechaNacimiento, m.fecha);
    if (m.fecha < nuevo.fechaNacimiento || anios < RANGOS.anios[0] || anios > RANGOS.anios[1]) {
      throw new Error('Con esa fecha de nacimiento alguna medición queda fuera de 3 a 15 años');
    }
  }
  Object.assign(nino, nuevo);
  return nino;
}

export function eliminarNino(datos, id) {
  datos.ninos = datos.ninos.filter((n) => n.id !== id);
  datos.mediciones = datos.mediciones.filter((m) => m.ninoId !== id);
}

// medicion: { ninoId, fecha, pesoKg, alturaCm, taller, grado }.
// Si el niño ya tiene una medición en esa fecha, la reemplaza.
export function guardarMedicion(datos, medicion, generarId = nuevoId) {
  const existente = buscarMedicion(datos, medicion.ninoId, medicion.fecha);
  if (existente) {
    Object.assign(existente, medicion, { id: existente.id });
    return { medicion: existente, reemplazada: true };
  }
  const nueva = { id: generarId(), ...medicion };
  datos.mediciones.push(nueva);
  return { medicion: nueva, reemplazada: false };
}

export function actualizarMedicion(datos, id, cambios) {
  const medicion = datos.mediciones.find((m) => m.id === id);
  if (!medicion) throw new Error('La medición no existe');
  const choque = buscarMedicion(datos, medicion.ninoId, cambios.fecha ?? medicion.fecha);
  if (choque && choque.id !== id) throw new Error('Este niño ya tiene otra medición en esa fecha');
  Object.assign(medicion, cambios, { id, ninoId: medicion.ninoId });
  return medicion;
}

export function eliminarMedicion(datos, id) {
  datos.mediciones = datos.mediciones.filter((m) => m.id !== id);
}
