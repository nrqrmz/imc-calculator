import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarTexto, limpiarNombre, claveNino, parsearSexo, parsearDecimal } from '../js/normalizar.js';
import { TALLERES, obtenerTaller, esParValido, etiquetaTallerGrado, parsearTaller } from '../js/talleres.js';

test('normalizarTexto quita acentos, mayúsculas y espacios de más', () => {
  assert.equal(normalizarTexto('  María   José PEÑA '), 'maria jose pena');
  assert.equal(normalizarTexto(undefined), '');
});

test('limpiarNombre conserva acentos y quita espacios de más', () => {
  assert.equal(limpiarNombre('  María   José Peña '), 'María José Peña');
});

test('claveNino identifica al mismo niño aunque cambie la escritura', () => {
  assert.equal(claveNino('Maria Jose', '2019-05-12'), claveNino(' MARÍA  JOSÉ ', '2019-05-12'));
  assert.notEqual(claveNino('Maria Jose', '2019-05-12'), claveNino('Maria Jose', '2019-05-13'));
});

test('parsearSexo acepta varias formas', () => {
  for (const t of ['F', 'f', 'Niña', 'nina', 'MUJER']) assert.equal(parsearSexo(t), 'F');
  for (const t of ['M', 'Niño', 'nino', 'Hombre']) assert.equal(parsearSexo(t), 'M');
  assert.equal(parsearSexo('x'), null);
  assert.equal(parsearSexo(''), null);
});

test('parsearDecimal acepta punto o coma', () => {
  assert.equal(parsearDecimal('29.5'), 29.5);
  assert.equal(parsearDecimal('29,5'), 29.5);
  assert.equal(parsearDecimal(' 125 '), 125);
  assert.equal(parsearDecimal('12.5.3'), null);
  assert.equal(parsearDecimal('-3'), null);
  assert.equal(parsearDecimal('abc'), null);
  assert.equal(parsearDecimal(''), null);
});

test('TALLERES tiene los cuatro talleres con sus grados', () => {
  assert.deepEqual(TALLERES.map((t) => t.clave), ['CN', 'T1', 'T2', 'T3']);
  assert.deepEqual(obtenerTaller('T2').grados, [4, 5, 6]);
  assert.equal(obtenerTaller('X'), null);
});

test('esParValido', () => {
  assert.equal(esParValido('T2', 5), true);
  assert.equal(esParValido('T1', 5), false);
  assert.equal(esParValido('CN', 3), true);
  assert.equal(esParValido('T3', 4), false);
  assert.equal(esParValido('X', 1), false);
});

test('etiquetaTallerGrado', () => {
  assert.equal(etiquetaTallerGrado('T2', 5), 'T-II · 5°');
});

test('parsearTaller acepta clave o nombre', () => {
  assert.equal(parsearTaller('CN'), 'CN');
  assert.equal(parsearTaller('Casa de Niños'), 'CN');
  assert.equal(parsearTaller('taller ii'), 'T2');
  assert.equal(parsearTaller('Taller III'), 'T3');
  assert.equal(parsearTaller('T-1'), 'T1');
  assert.equal(parsearTaller('Taller IV'), null);
});
