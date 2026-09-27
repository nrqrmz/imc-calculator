// Validación de un registro (niño + medición). La usan la captura manual y la importación CSV.
import { esFechaValida, edadCalendario } from './fechas.js';
import { obtenerTaller, esParValido } from './talleres.js';
import { limpiarNombre } from './normalizar.js';
import { evaluar } from './imc.js';

export const RANGOS = { anios: [3, 15], alturaCm: [70, 200], pesoKg: [8, 150] };
export const Z_EXTREMO = 5;

const enRango = (valor, [min, max]) => typeof valor === 'number' && valor >= min && valor <= max;

// registro: { nombre, fechaNacimiento, sexo, fecha, taller, grado, alturaCm, pesoKg }
// hoy: 'AAAA-MM-DD'
// Devuelve { valido, errores: { campo: mensaje }, advertencias: [mensaje], resultado }.
export function validarRegistro(registro, hoy) {
  const { nombre, fechaNacimiento, sexo, fecha, taller, grado, alturaCm, pesoKg } = registro;
  const errores = {};

  if (!limpiarNombre(nombre)) errores.nombre = 'Escribe el nombre completo';
  if (!esFechaValida(fechaNacimiento)) errores.fechaNacimiento = 'Fecha de nacimiento inválida';
  if (sexo !== 'F' && sexo !== 'M') errores.sexo = 'Elige niña o niño';

  if (!esFechaValida(fecha)) errores.fecha = 'Fecha de medición inválida';
  else if (fecha > hoy) errores.fecha = 'La fecha de medición no puede ser futura';

  if (!errores.fechaNacimiento && !errores.fecha) {
    if (fecha < fechaNacimiento) {
      errores.fecha = 'La fecha de medición es anterior al nacimiento';
    } else {
      const { anios } = edadCalendario(fechaNacimiento, fecha);
      if (!enRango(anios, RANGOS.anios)) {
        errores.fechaNacimiento = `En la fecha de medición tiene ${anios} años; debe tener de 3 a 15`;
      }
    }
  }

  const infoTaller = obtenerTaller(taller);
  if (!infoTaller) errores.taller = 'Elige un taller';
  else if (grado == null) errores.grado = 'Elige un grado';
  else if (!esParValido(taller, grado)) errores.grado = `El grado ${grado}° no pertenece a ${infoTaller.nombre}`;

  if (!enRango(alturaCm, RANGOS.alturaCm)) errores.alturaCm = 'Altura fuera de rango (70–200 cm)';
  if (!enRango(pesoKg, RANGOS.pesoKg)) errores.pesoKg = 'Peso fuera de rango (8–150 kg)';

  const valido = Object.keys(errores).length === 0;
  const advertencias = [];
  let resultado = null;
  if (valido) {
    resultado = evaluar({ fechaNacimiento, sexo }, { fecha, pesoKg, alturaCm });
    if (Math.abs(resultado.z) > Z_EXTREMO) {
      advertencias.push(`Puntaje Z extremo (${resultado.z}): revisa la altura y el peso`);
    }
  }
  return { valido, errores, advertencias, resultado };
}
