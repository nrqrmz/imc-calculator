import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarRegistro } from '../js/validacion.js';

const HOY = '2026-09-27';
const base = {
  nombre: 'Sofía López García',
  fechaNacimiento: '2019-05-12',
  sexo: 'F',
  fecha: '2026-09-15',
  taller: 'T2',
  grado: 5,
  alturaCm: 125,
  pesoKg: 29,
};

test('registro válido trae el resultado calculado', () => {
  const v = validarRegistro(base, HOY);
  assert.equal(v.valido, true);
  assert.deepEqual(v.errores, {});
  assert.equal(v.resultado.clasificacion, 'sobrepeso');
  assert.deepEqual(v.advertencias, []);
});

test('campos vacíos generan un error por campo', () => {
  const v = validarRegistro({}, HOY);
  assert.equal(v.valido, false);
  assert.deepEqual(Object.keys(v.errores).sort(),
    ['alturaCm', 'fecha', 'fechaNacimiento', 'nombre', 'pesoKg', 'sexo', 'taller']);
  assert.equal(v.resultado, null);
});

test('fecha de medición futura o anterior al nacimiento', () => {
  assert.match(validarRegistro({ ...base, fecha: '2026-09-28' }, HOY).errores.fecha, /futura/);
  assert.match(validarRegistro({ ...base, fecha: '2019-01-01' }, HOY).errores.fecha, /anterior/);
});

test('edad fuera de 3 a 15 años', () => {
  assert.match(validarRegistro({ ...base, fechaNacimiento: '2024-01-01' }, HOY).errores.fechaNacimiento, /2 años/);
  assert.match(validarRegistro({ ...base, fechaNacimiento: '2010-09-15' }, HOY).errores.fechaNacimiento, /16 años/);
});

test('bordes de edad: 3 años justos y 15 años 11 meses son válidos', () => {
  assert.equal(validarRegistro({ ...base, fechaNacimiento: '2023-09-15', taller: 'CN', grado: 1, alturaCm: 95, pesoKg: 14 }, HOY).valido, true);
  assert.equal(validarRegistro({ ...base, fechaNacimiento: '2010-09-16', taller: 'T3', grado: 3, alturaCm: 165, pesoKg: 55 }, HOY).valido, true);
});

test('3 años cumplidos sin 29 de febrero de por medio (1095 días) es válido', () => {
  const v = validarRegistro(
    { ...base, fechaNacimiento: '2024-03-01', fecha: '2027-03-01', taller: 'CN', grado: 1, alturaCm: 95, pesoKg: 14 },
    '2027-12-31',
  );
  assert.equal(v.valido, true);
  assert.equal(v.resultado.edadDias, 1095);
});

test('par taller/grado inválido o grado faltante', () => {
  assert.match(validarRegistro({ ...base, taller: 'T1', grado: 5 }, HOY).errores.grado, /no pertenece a Taller I/);
  assert.match(validarRegistro({ ...base, grado: null }, HOY).errores.grado, /Elige un grado/);
});

test('altura y peso fuera de rango', () => {
  assert.ok(validarRegistro({ ...base, alturaCm: 12.5 }, HOY).errores.alturaCm);
  assert.ok(validarRegistro({ ...base, pesoKg: 151 }, HOY).errores.pesoKg);
});

test('Z extremo es advertencia, no error', () => {
  const v = validarRegistro({ ...base, alturaCm: 100, pesoKg: 60 }, HOY);
  assert.equal(v.valido, true);
  assert.equal(v.advertencias.length, 1);
});
