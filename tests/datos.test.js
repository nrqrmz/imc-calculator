import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  VERSION, crearDatosVacios, obtenerNino, buscarNinoPorClave, buscarNinosPorNombre,
  medicionesDe, buscarMedicion, agregarNino, actualizarNino, eliminarNino,
  guardarMedicion, actualizarMedicion, eliminarMedicion, detalleNino,
} from '../js/datos.js';

function ids() {
  let n = 0;
  return () => `id${++n}`;
}

function datosDePrueba() {
  const datos = crearDatosVacios();
  const gen = ids();
  const sofia = agregarNino(datos, { nombre: ' Sofía  López ', fechaNacimiento: '2019-05-12', sexo: 'F' }, gen);
  const diego = agregarNino(datos, { nombre: 'Diego Mora', fechaNacimiento: '2021-12-03', sexo: 'M' }, gen);
  guardarMedicion(datos, { ninoId: sofia.id, fecha: '2025-09-10', pesoKg: 22.9, alturaCm: 118, taller: 'T2', grado: 4 }, gen);
  guardarMedicion(datos, { ninoId: sofia.id, fecha: '2026-09-15', pesoKg: 29, alturaCm: 125, taller: 'T2', grado: 5 }, gen);
  return { datos, sofia, diego, gen };
}

test('crearDatosVacios', () => {
  assert.deepEqual(crearDatosVacios(), { version: VERSION, ninos: [], mediciones: [] });
});

test('agregarNino limpia el nombre y rechaza duplicados por nombre normalizado + fecha', () => {
  const { datos, sofia } = datosDePrueba();
  assert.equal(sofia.nombre, 'Sofía López');
  assert.throws(() => agregarNino(datos, { nombre: 'SOFIA LOPEZ', fechaNacimiento: '2019-05-12', sexo: 'F' }), /Ya existe/);
});

test('buscarNinoPorClave y obtenerNino', () => {
  const { datos, sofia } = datosDePrueba();
  assert.equal(buscarNinoPorClave(datos, 'sofia lopez', '2019-05-12'), sofia);
  assert.equal(buscarNinoPorClave(datos, 'sofia lopez', '2019-05-13'), null);
  assert.equal(obtenerNino(datos, sofia.id), sofia);
  assert.equal(obtenerNino(datos, 'nada'), null);
});

test('buscarNinosPorNombre hace coincidencia parcial sin acentos', () => {
  const { datos } = datosDePrueba();
  assert.deepEqual(buscarNinosPorNombre(datos, 'lo').map((n) => n.nombre), ['Sofía López']);
  assert.deepEqual(buscarNinosPorNombre(datos, 'o').map((n) => n.nombre), ['Diego Mora', 'Sofía López']);
  assert.deepEqual(buscarNinosPorNombre(datos, '  '), []);
});

test('medicionesDe ordena de la más reciente a la más antigua', () => {
  const { datos, sofia, diego } = datosDePrueba();
  assert.deepEqual(medicionesDe(datos, sofia.id).map((m) => m.fecha), ['2026-09-15', '2025-09-10']);
  assert.deepEqual(medicionesDe(datos, diego.id), []);
});

test('guardarMedicion reemplaza la de la misma fecha', () => {
  const { datos, sofia, gen } = datosDePrueba();
  const original = buscarMedicion(datos, sofia.id, '2026-09-15');
  const r = guardarMedicion(datos, { ninoId: sofia.id, fecha: '2026-09-15', pesoKg: 30, alturaCm: 126, taller: 'T2', grado: 5 }, gen);
  assert.equal(r.reemplazada, true);
  assert.equal(r.medicion.id, original.id);
  assert.equal(r.medicion.pesoKg, 30);
  assert.equal(medicionesDe(datos, sofia.id).length, 2);
});

test('actualizarNino valida duplicados y el rango de edad de sus mediciones', () => {
  const { datos, sofia, diego } = datosDePrueba();
  actualizarNino(datos, sofia.id, { nombre: 'Sofía López García' });
  assert.equal(obtenerNino(datos, sofia.id).nombre, 'Sofía López García');
  assert.throws(() => actualizarNino(datos, diego.id, { nombre: 'sofia lopez garcia', fechaNacimiento: '2019-05-12' }), /otro niño/);
  assert.throws(() => actualizarNino(datos, sofia.id, { fechaNacimiento: '2023-01-01' }), /fuera de 3 a 15/);
  assert.equal(obtenerNino(datos, sofia.id).fechaNacimiento, '2019-05-12');
});

test('eliminarNino borra también sus mediciones', () => {
  const { datos, sofia } = datosDePrueba();
  eliminarNino(datos, sofia.id);
  assert.equal(obtenerNino(datos, sofia.id), null);
  assert.equal(datos.mediciones.length, 0);
});

test('actualizarMedicion no permite dos mediciones en la misma fecha', () => {
  const { datos, sofia } = datosDePrueba();
  const [reciente, anterior] = medicionesDe(datos, sofia.id);
  assert.throws(() => actualizarMedicion(datos, anterior.id, { fecha: reciente.fecha }), /otra medición/);
  actualizarMedicion(datos, anterior.id, { pesoKg: 23.1, ninoId: 'otro' });
  assert.equal(anterior.pesoKg, 23.1);
  assert.equal(anterior.ninoId, sofia.id);
});

test('eliminarMedicion', () => {
  const { datos, sofia } = datosDePrueba();
  eliminarMedicion(datos, medicionesDe(datos, sofia.id)[0].id);
  assert.equal(medicionesDe(datos, sofia.id).length, 1);
});

test('guardarMedicion rechaza un niño que no existe', () => {
  const { datos } = datosDePrueba();
  assert.throws(
    () => guardarMedicion(datos, { ninoId: 'borrado', fecha: '2026-09-15', pesoKg: 29, alturaCm: 125, taller: 'T2', grado: 5 }),
    /El niño ya no existe/,
  );
  assert.equal(datos.mediciones.filter((m) => m.ninoId === 'borrado').length, 0);
});

test('detalleNino muestra nacimiento y el taller · grado de la última medición', () => {
  const { datos, sofia, diego } = datosDePrueba();
  assert.equal(detalleNino(datos, sofia), '12/05/2019 · T-II · 5°');
  assert.equal(detalleNino(datos, diego), '03/12/2021');
});
