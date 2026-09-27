import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calcularIMC, lmsPorDias, lmsPorMeses, obtenerLMS, valorDE, puntajeZ,
  percentil, clasificar, tramosEscala, evaluar, evaluarSeguro, pesoNormal,
} from '../js/imc.js';

const cerca = (real, esperado, tolerancia = 1e-6) =>
  assert.ok(Math.abs(real - esperado) <= tolerancia, `${real} no está cerca de ${esperado}`);

test('calcularIMC', () => {
  cerca(calcularIMC(29, 125), 18.56);
});

test('obtenerLMS usa la tabla 2006 por día hasta 1826 días', () => {
  assert.deepEqual(obtenerLMS('M', 1096), [-0.31, 15.5986, 0.07931]);
  assert.deepEqual(obtenerLMS('F', 1826), [-0.5684, 15.2747, 0.09789]);
});

test('obtenerLMS usa la tabla 2007 interpolada después de 1826 días', () => {
  const lms = obtenerLMS('M', 1857); // 61.01 meses
  assert.deepEqual(lms, lmsPorMeses('M', 1857 / 30.4375));
  cerca(lmsPorMeses('M', 61)[1], 15.2641);
  cerca(lmsPorMeses('M', 60.5)[1], (15.2679 + 15.2641) / 2);
});

test('lmsPorDias y lmsPorMeses fallan fuera de las tablas', () => {
  assert.throws(() => lmsPorDias('M', 500), RangeError);
  assert.throws(() => lmsPorMeses('F', 200), RangeError);
});

test('Z = 0 en la mediana y Z = k en cada desviación estándar (ambas tablas, ambos sexos)', () => {
  const casos = [['M', 1200], ['F', 1500], ['M', 1826], ['F', 2500], ['M', 4000], ['F', 5800]];
  for (const [sexo, dias] of casos) {
    const lms = obtenerLMS(sexo, dias);
    cerca(puntajeZ(lms[1], lms), 0);
    for (const k of [-2, 1, 2]) cerca(puntajeZ(valorDE(lms, k), lms), k);
  }
});

test('ajuste OMS en las colas (|Z| > 3)', () => {
  const lms = obtenerLMS('F', 3000);
  const de2 = valorDE(lms, 2);
  const de3 = valorDE(lms, 3);
  cerca(puntajeZ(de3 + (de3 - de2) * 0.5, lms), 3.5);
  const neg2 = valorDE(lms, -2);
  const neg3 = valorDE(lms, -3);
  cerca(puntajeZ(neg3 - (neg2 - neg3) * 0.5, lms), -3.5);
});

test('coincide con los resultados publicados por la OMS (AnthroPlus)', () => {
  // [sexo, edad en meses, peso kg, altura cm, zbfa esperado] de survey_who2007_z.csv
  const casos = [
    ['M', 188.57, 126.4, 171.4, 4.21],
    ['F', 141.04, 98.8, 163.3, 3.81],
    ['M', 144.13, 27.7, 145.2, -3.24],
    ['M', 184.09, 84.6, 181.7, 1.66],
    ['F', 133.88, 46.5, 144.3, 1.65],
    ['M', 150.95, 39.4, 162.9, -1.9],
    ['F', 157.41, 35.6, 148.8, -1.33],
    ['M', 172.42, 76.7, 166.6, 2.23],
    ['F', 155.6, 74.4, 164.6, 2.22],
    ['M', 89.78, 25.3, 129.2, -0.32],
    ['F', 176.4, 56, 162.5, 0.4],
  ];
  for (const [sexo, meses, peso, altura, esperado] of casos) {
    const z = puntajeZ(calcularIMC(peso, altura), lmsPorMeses(sexo, meses));
    assert.equal(Math.round(z * 100) / 100, esperado, `${sexo} ${meses} meses`);
  }
});

test('percentil a partir de Z', () => {
  cerca(percentil(0), 50, 1e-5);
  cerca(percentil(1), 84.134, 0.001);
  cerca(percentil(-2), 2.275, 0.001);
});

test('clasificar con cortes de 5 años en adelante', () => {
  const dias = 3000;
  assert.equal(clasificar(-3.01, dias), 'delgadez-severa');
  assert.equal(clasificar(-3, dias), 'delgadez');
  assert.equal(clasificar(-2.01, dias), 'delgadez');
  assert.equal(clasificar(-2, dias), 'normal');
  assert.equal(clasificar(1, dias), 'normal');
  assert.equal(clasificar(1.01, dias), 'sobrepeso');
  assert.equal(clasificar(2, dias), 'sobrepeso');
  assert.equal(clasificar(2.01, dias), 'obesidad');
});

test('clasificar con cortes de 60 meses o menos', () => {
  const dias = 1826;
  assert.equal(clasificar(1.01, dias), 'sobrepeso');
  assert.equal(clasificar(2.5, dias), 'sobrepeso');
  assert.equal(clasificar(3, dias), 'sobrepeso');
  assert.equal(clasificar(3.01, dias), 'obesidad');
});

test('tramosEscala mueve el corte de obesidad según la edad', () => {
  assert.equal(tramosEscala(1500).at(-1).desde, 3);
  assert.equal(tramosEscala(3000).at(-1).desde, 2);
});

test('evaluar arma el resultado completo', () => {
  const r = evaluar(
    { fechaNacimiento: '2019-05-12', sexo: 'F' },
    { fecha: '2026-09-15', pesoKg: 29, alturaCm: 125 },
  );
  assert.equal(r.edadDias, 2683);
  assert.deepEqual(r.edad, { anios: 7, meses: 4, totalMeses: 88 });
  assert.equal(r.imc, 18.6);
  assert.equal(r.ciclo, '2026–2027');
  assert.equal(r.clasificacion, 'sobrepeso');
  assert.ok(r.z > 1 && r.z <= 2);
  assert.equal(r.z, Math.round(r.z * 100) / 100);
});

test('evaluarSeguro devuelve null fuera de las tablas', () => {
  assert.equal(evaluarSeguro({ fechaNacimiento: '2025-01-01', sexo: 'M' }, { fecha: '2026-01-01', pesoKg: 10, alturaCm: 75 }), null);
});

test('pesoNormal convierte los cortes Z −2 y +1 a kilos con la altura de la medición', () => {
  const nino = { fechaNacimiento: '2016-12-11', sexo: 'M' };
  const medicion = { fecha: '2026-09-27', pesoKg: 60, alturaCm: 135 };
  const lms = obtenerLMS('M', 3577);
  const { minKg, maxKg } = pesoNormal(nino, medicion);
  assert.equal(minKg, Math.round(valorDE(lms, -2) * 1.35 ** 2 * 10) / 10);
  assert.equal(maxKg, Math.round(valorDE(lms, 1) * 1.35 ** 2 * 10) / 10);
  assert.ok(minKg > 24 && minKg < 26, `minKg = ${minKg}`);
  assert.ok(maxKg > 33 && maxKg < 34, `maxKg = ${maxKg}`); // OMS: IMC 18.3 en +1 DE a los 9a 9m
});

test('un peso dentro del rango de pesoNormal se clasifica normal y uno fuera no', () => {
  const nino = { fechaNacimiento: '2019-05-12', sexo: 'F' };
  const medicion = { fecha: '2026-09-15', alturaCm: 125 };
  const { minKg, maxKg } = pesoNormal(nino, medicion);
  assert.equal(evaluar(nino, { ...medicion, pesoKg: minKg + 0.1 }).clasificacion, 'normal');
  assert.equal(evaluar(nino, { ...medicion, pesoKg: maxKg - 0.1 }).clasificacion, 'normal');
  assert.equal(evaluar(nino, { ...medicion, pesoKg: minKg - 0.2 }).clasificacion, 'delgadez');
  assert.equal(evaluar(nino, { ...medicion, pesoKg: maxKg + 0.2 }).clasificacion, 'sobrepeso');
});

test('evaluar incluye el peso normal', () => {
  const nino = { fechaNacimiento: '2019-05-12', sexo: 'F' };
  const medicion = { fecha: '2026-09-15', pesoKg: 29, alturaCm: 125 };
  assert.deepEqual(evaluar(nino, medicion).pesoNormal, pesoNormal(nino, medicion));
});
