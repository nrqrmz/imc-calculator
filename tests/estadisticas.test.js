import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluarTodo, ciclosDisponibles, primeraYUltima, contar, porcentajesGrafica,
  comparacionTalleres, evolucion,
} from '../js/estadisticas.js';

// Niñas de la misma edad: el peso decide la clasificación.
// A 125 cm y ~7 años: 22 kg → normal, 29 kg → sobrepeso, 35 kg → obesidad.
function datosDePrueba() {
  const ninos = [
    { id: 'a', nombre: 'Ana', fechaNacimiento: '2019-05-12', sexo: 'F' },
    { id: 'b', nombre: 'Bea', fechaNacimiento: '2019-05-12', sexo: 'F' },
    { id: 'c', nombre: 'Cris', fechaNacimiento: '2019-05-12', sexo: 'F' },
  ];
  const m = (id, ninoId, fecha, pesoKg, taller, grado) =>
    ({ id, ninoId, fecha, pesoKg, alturaCm: 125, taller, grado });
  const mediciones = [
    m('1', 'a', '2026-09-15', 29, 'T1', 2), // Ana: sobrepeso → normal, T1 2°
    m('2', 'a', '2027-03-10', 22, 'T1', 2),
    m('3', 'b', '2026-09-15', 35, 'T1', 3), // Bea: obesidad, una sola medición en el ciclo
    m('4', 'c', '2026-09-20', 22, 'T1', 3), // Cris: normal → sobrepeso, pasa a T2 4°
    m('5', 'c', '2027-06-01', 29, 'T2', 4),
    m('6', 'a', '2025-09-10', 22, 'T1', 1), // ciclo anterior
    { id: '7', ninoId: 'zzz', fecha: '2026-09-15', pesoKg: 20, alturaCm: 120, taller: 'T1', grado: 1 }, // sin niño
  ];
  return { version: 1, ninos, mediciones };
}

test('evaluarTodo ignora mediciones sin niño', () => {
  const items = evaluarTodo(datosDePrueba());
  assert.equal(items.length, 6);
  assert.ok(items.every((i) => i.resultado && i.nino));
});

test('ciclosDisponibles del más reciente al más antiguo', () => {
  assert.deepEqual(ciclosDisponibles(evaluarTodo(datosDePrueba())), ['2026–2027', '2025–2026']);
});

test('primeraYUltima por niño dentro del ciclo', () => {
  const grupos = primeraYUltima(evaluarTodo(datosDePrueba()), '2026–2027');
  const ana = grupos.find((g) => g.primera.nino.id === 'a');
  assert.equal(ana.total, 2);
  assert.equal(ana.primera.medicion.id, '1');
  assert.equal(ana.ultima.medicion.id, '2');
  assert.equal(grupos.length, 3);
});

test('contar y porcentajesGrafica juntan delgadez severa con delgadez', () => {
  const items = [
    { resultado: { clasificacion: 'delgadez-severa' } },
    { resultado: { clasificacion: 'delgadez' } },
    { resultado: { clasificacion: 'normal' } },
    { resultado: { clasificacion: 'normal' } },
  ];
  const conteo = contar(items);
  assert.deepEqual(conteo, { 'delgadez-severa': 1, delgadez: 1, normal: 2, sobrepeso: 0, obesidad: 0, total: 4 });
  assert.deepEqual(porcentajesGrafica(conteo), [
    { grupo: 'delgadez', n: 2, pct: 50 },
    { grupo: 'normal', n: 2, pct: 50 },
    { grupo: 'sobrepeso', n: 0, pct: 0 },
    { grupo: 'obesidad', n: 0, pct: 0 },
  ]);
  assert.equal(porcentajesGrafica(contar([]))[0].pct, 0);
});

test('comparacionTalleres con la última medición', () => {
  const r = comparacionTalleres(evaluarTodo(datosDePrueba()), { ciclo: '2026–2027', cual: 'ultima' });
  assert.deepEqual(r.map((t) => t.taller), ['CN', 'T1', 'T2', 'T3']);
  const t1 = r.find((t) => t.taller === 'T1').conteo;
  assert.equal(t1.total, 2); // Ana (normal) y Bea (obesidad)
  assert.equal(t1.normal, 1);
  assert.equal(t1.obesidad, 1);
  assert.equal(r.find((t) => t.taller === 'T2').conteo.sobrepeso, 1); // Cris
});

test('comparacionTalleres con la primera medición y filtro de taller y grado', () => {
  const items = evaluarTodo(datosDePrueba());
  const r = comparacionTalleres(items, { ciclo: '2026–2027', cual: 'primera', taller: 'T1', grado: 3 });
  assert.equal(r.length, 1);
  assert.equal(r[0].conteo.total, 2); // Bea y Cris estaban en 3° al inicio
  assert.equal(r[0].conteo.obesidad, 1);
  assert.equal(r[0].conteo.normal, 1);
});

test('evolucion solo cuenta niños con 2+ mediciones y los agrupa por su última medición', () => {
  const r = evolucion(evaluarTodo(datosDePrueba()), { ciclo: '2026–2027' });
  const t1 = r.find((t) => t.taller === 'T1');
  assert.equal(t1.ninos, 1); // solo Ana; Bea tiene una medición
  assert.equal(t1.primera.sobrepeso, 1);
  assert.equal(t1.ultima.normal, 1);
  const t2 = r.find((t) => t.taller === 'T2');
  assert.equal(t2.ninos, 1); // Cris, por su última medición
  assert.equal(t2.primera.normal, 1);
  assert.equal(t2.ultima.sobrepeso, 1);
  assert.equal(r.find((t) => t.taller === 'CN').ninos, 0);
});
