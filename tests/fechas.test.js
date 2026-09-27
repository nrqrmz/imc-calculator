import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  esFechaValida, parsearFecha, formatearFecha, hoyISO, diasEntre,
  edadCalendario, formatearEdad, formatearEdadCorta,
} from '../js/fechas.js';
import { cicloEscolar } from '../js/ciclo.js';

test('parsearFecha acepta AAAA-MM-DD y DD/MM/AAAA', () => {
  assert.equal(parsearFecha('2019-05-12'), '2019-05-12');
  assert.equal(parsearFecha('12/05/2019'), '2019-05-12');
  assert.equal(parsearFecha(' 3/7/2020 '), '2020-07-03');
});

test('parsearFecha rechaza fechas inexistentes o mal formadas', () => {
  assert.equal(parsearFecha('31/02/2020'), null);
  assert.equal(parsearFecha('2019-13-01'), null);
  assert.equal(parsearFecha('12-05-2019'), null);
  assert.equal(parsearFecha(''), null);
  assert.equal(parsearFecha(undefined), null);
});

test('esFechaValida respeta años bisiestos', () => {
  assert.equal(esFechaValida('2020-02-29'), true);
  assert.equal(esFechaValida('2021-02-29'), false);
  assert.equal(esFechaValida(null), false);
});

test('formatearFecha usa DD/MM/AAAA', () => {
  assert.equal(formatearFecha('2026-09-05'), '05/09/2026');
});

test('hoyISO usa la fecha local', () => {
  assert.equal(hoyISO(new Date(2026, 8, 5, 23, 30)), '2026-09-05');
});

test('diasEntre cuenta días exactos sin depender de la zona horaria', () => {
  assert.equal(diasEntre('2023-09-27', '2026-09-27'), 1096);
  assert.equal(diasEntre('2026-03-01', '2026-03-31'), 30);
  assert.equal(diasEntre('2026-09-15', '2026-09-15'), 0);
});

test('edadCalendario cuenta años y meses cumplidos', () => {
  assert.deepEqual(edadCalendario('2019-05-12', '2026-09-15'), { anios: 7, meses: 4, totalMeses: 88 });
  assert.deepEqual(edadCalendario('2019-05-20', '2026-09-15'), { anios: 7, meses: 3, totalMeses: 87 });
});

test('edadCalendario con nacimiento en 29 de febrero', () => {
  assert.deepEqual(edadCalendario('2020-02-29', '2023-02-28'), { anios: 2, meses: 11, totalMeses: 35 });
  assert.deepEqual(edadCalendario('2020-02-29', '2023-03-01'), { anios: 3, meses: 0, totalMeses: 36 });
});

test('formatearEdad en singular y plural', () => {
  assert.equal(formatearEdad({ anios: 7, meses: 4 }), '7 años 4 meses');
  assert.equal(formatearEdad({ anios: 1, meses: 1 }), '1 año 1 mes');
  assert.equal(formatearEdad({ anios: 5, meses: 0 }), '5 años');
  assert.equal(formatearEdadCorta({ anios: 8, meses: 2 }), '8a\u00a02m');
});

test('cicloEscolar va de agosto a julio', () => {
  assert.equal(cicloEscolar('2026-09-15'), '2026–2027');
  assert.equal(cicloEscolar('2027-03-10'), '2026–2027');
  assert.equal(cicloEscolar('2027-01-01'), '2026–2027');
  assert.equal(cicloEscolar('2026-07-31'), '2025–2026');
  assert.equal(cicloEscolar('2026-08-01'), '2026–2027');
});
