// Respaldo completo en JSON: generar, leer y validar.
import { esFechaValida } from './fechas.js';
import { esParValido } from './talleres.js';
import { VERSION } from './datos.js';

const esTexto = (v) => typeof v === 'string' && v.trim() !== '';
const esNumero = (v) => typeof v === 'number' && Number.isFinite(v);

export function validarRespaldo(obj) {
  const falla = (error) => ({ valido: false, error });
  if (!obj || typeof obj !== 'object') return falla('El archivo no contiene un respaldo');
  if (obj.version !== VERSION) return falla(`Versión de respaldo no soportada: ${obj.version}`);
  if (!Array.isArray(obj.ninos) || !Array.isArray(obj.mediciones)) return falla('Faltan las listas de niños o mediciones');

  const idsNinos = new Set();
  for (const [i, n] of obj.ninos.entries()) {
    if (!esTexto(n?.id) || !esTexto(n.nombre) || !esFechaValida(n.fechaNacimiento) || !['F', 'M'].includes(n.sexo)) {
      return falla(`Niño ${i + 1} con datos inválidos`);
    }
    if (idsNinos.has(n.id)) return falla(`Id de niño repetido: ${n.id}`);
    idsNinos.add(n.id);
  }

  const idsMediciones = new Set();
  for (const [i, m] of obj.mediciones.entries()) {
    const ok = esTexto(m?.id) && idsNinos.has(m.ninoId) && esFechaValida(m.fecha)
      && esNumero(m.pesoKg) && esNumero(m.alturaCm) && esParValido(m.taller, m.grado);
    if (!ok) return falla(`Medición ${i + 1} con datos inválidos`);
    if (idsMediciones.has(m.id)) return falla(`Id de medición repetido: ${m.id}`);
    idsMediciones.add(m.id);
  }
  return { valido: true };
}

export function generarRespaldo(datos) {
  return JSON.stringify(datos, null, 2);
}

// Devuelve { valido: true, datos } o { valido: false, error }.
export function leerRespaldo(texto) {
  let obj;
  try {
    obj = JSON.parse(texto);
  } catch {
    return { valido: false, error: 'El archivo no es un JSON válido' };
  }
  const v = validarRespaldo(obj);
  return v.valido ? { valido: true, datos: obj } : v;
}
