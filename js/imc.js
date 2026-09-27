// IMC para la edad según la OMS: puntaje Z (método LMS), percentil y clasificación.
import { OMS2006, OMS2007 } from './oms-lms.js';
import { diasEntre, edadCalendario } from './fechas.js';
import { cicloEscolar } from './ciclo.js';

export const DIAS_POR_MES = 30.4375;
// Hasta este día de edad (60 meses) se usan los Patrones OMS 2006 y sus cortes.
export const LIMITE_DIAS_2006 = 1826;

export const CLASIFICACIONES = ['delgadez-severa', 'delgadez', 'normal', 'sobrepeso', 'obesidad'];
export const ETIQUETAS = {
  'delgadez-severa': 'Delgadez severa',
  delgadez: 'Delgadez',
  normal: 'Normal',
  sobrepeso: 'Sobrepeso',
  obesidad: 'Obesidad',
};

export function calcularIMC(pesoKg, alturaCm) {
  const metros = alturaCm / 100;
  return pesoKg / (metros * metros);
}

// Patrones OMS 2006: una fila por día de edad.
export function lmsPorDias(sexo, edadDias) {
  const fila = OMS2006[sexo]?.[edadDias - OMS2006.desde];
  if (!fila) throw new RangeError(`Edad fuera de la tabla OMS 2006: ${edadDias} días`);
  return fila;
}

// Referencia OMS 2007: una fila por mes, con interpolación lineal entre meses.
export function lmsPorMeses(sexo, edadMeses) {
  const bajo = Math.trunc(edadMeses);
  const fraccion = edadMeses - bajo;
  const a = OMS2007[sexo]?.[bajo - OMS2007.desde];
  const b = OMS2007[sexo]?.[bajo + 1 - OMS2007.desde];
  if (!a || !b) throw new RangeError(`Edad fuera de la tabla OMS 2007: ${edadMeses} meses`);
  return a.map((valor, i) => valor + (b[i] - valor) * fraccion);
}

export function obtenerLMS(sexo, edadDias) {
  return edadDias <= LIMITE_DIAS_2006
    ? lmsPorDias(sexo, edadDias)
    : lmsPorMeses(sexo, edadDias / DIAS_POR_MES);
}

// Valor de IMC que corresponde a k desviaciones estándar.
export function valorDE([L, M, S], k) {
  return M * Math.pow(1 + L * S * k, 1 / L);
}

// Puntaje Z con el ajuste de la OMS para |Z| > 3.
export function puntajeZ(imc, lms) {
  const [L, M, S] = lms;
  const z = (Math.pow(imc / M, L) - 1) / (L * S);
  if (z > 3) {
    const de3 = valorDE(lms, 3);
    return 3 + (imc - de3) / (de3 - valorDE(lms, 2));
  }
  if (z < -3) {
    const de3 = valorDE(lms, -3);
    return -3 + (imc - de3) / (valorDE(lms, -2) - de3);
  }
  return z;
}

// Distribución normal estándar (Abramowitz y Stegun 7.1.26, error < 1.5e-7).
function normalAcumulada(z) {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const polinomio = ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
  const erf = 1 - polinomio * Math.exp(-x * x);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

export function percentil(z) {
  return 100 * normalAcumulada(z);
}

// Cortes de la OMS. Para ≤ 60 meses "riesgo de sobrepeso" se etiqueta como sobrepeso
// y la obesidad empieza en +3; después de 60 meses empieza en +2.
export function clasificar(z, edadDias) {
  if (z < -3) return 'delgadez-severa';
  if (z < -2) return 'delgadez';
  if (z <= 1) return 'normal';
  const corteObesidad = edadDias <= LIMITE_DIAS_2006 ? 3 : 2;
  return z > corteObesidad ? 'obesidad' : 'sobrepeso';
}

// Tramos de la escala para dibujar la barra de −4 a +4.
export function tramosEscala(edadDias) {
  const corteObesidad = edadDias <= LIMITE_DIAS_2006 ? 3 : 2;
  return [
    { clasificacion: 'delgadez-severa', desde: -4, hasta: -3 },
    { clasificacion: 'delgadez', desde: -3, hasta: -2 },
    { clasificacion: 'normal', desde: -2, hasta: 1 },
    { clasificacion: 'sobrepeso', desde: 1, hasta: corteObesidad },
    { clasificacion: 'obesidad', desde: corteObesidad, hasta: 4 },
  ];
}

const redondear = (valor, decimales) => Math.round(valor * 10 ** decimales) / 10 ** decimales;

// nino: { fechaNacimiento, sexo }; medicion: { fecha, pesoKg, alturaCm }.
export function evaluar(nino, medicion) {
  const edadDias = diasEntre(nino.fechaNacimiento, medicion.fecha);
  const imc = calcularIMC(medicion.pesoKg, medicion.alturaCm);
  const z = redondear(puntajeZ(imc, obtenerLMS(nino.sexo, edadDias)), 2);
  return {
    edadDias,
    edad: edadCalendario(nino.fechaNacimiento, medicion.fecha),
    imc: redondear(imc, 1),
    z,
    percentil: redondear(percentil(z), 1),
    clasificacion: clasificar(z, edadDias),
    ciclo: cicloEscolar(medicion.fecha),
  };
}

// Igual que evaluar, pero devuelve null si la edad queda fuera de las tablas.
export function evaluarSeguro(nino, medicion) {
  try {
    return evaluar(nino, medicion);
  } catch {
    return null;
  }
}
