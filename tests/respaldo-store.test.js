import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { validarRespaldo, generarRespaldo, leerRespaldo } from '../js/respaldo.js';
import { CLAVE, cargar, obtenerDatos, modificar, reemplazarTodo, estaBloqueado } from '../js/store.js';
import { crearDatosVacios, agregarNino } from '../js/datos.js';

const valido = () => ({
  version: 1,
  ninos: [{ id: 'n1', nombre: 'Sofía López', fechaNacimiento: '2019-05-12', sexo: 'F' }],
  mediciones: [{ id: 'm1', ninoId: 'n1', fecha: '2026-09-15', pesoKg: 29, alturaCm: 125, taller: 'T2', grado: 5 }],
});

test('validarRespaldo acepta un respaldo correcto', () => {
  assert.deepEqual(validarRespaldo(valido()), { valido: true });
  assert.deepEqual(validarRespaldo(crearDatosVacios()), { valido: true });
});

test('validarRespaldo rechaza estructuras incorrectas', () => {
  assert.equal(validarRespaldo(null).valido, false);
  assert.match(validarRespaldo({ ...valido(), version: 2 }).error, /Versión/);
  assert.match(validarRespaldo({ version: 1, ninos: [] }).error, /Faltan/);
  const r1 = valido(); r1.ninos[0].sexo = 'X';
  assert.match(validarRespaldo(r1).error, /Niño 1/);
  const r2 = valido(); r2.mediciones[0].ninoId = 'nadie';
  assert.match(validarRespaldo(r2).error, /Medición 1/);
  const r3 = valido(); r3.mediciones[0].grado = 2;
  assert.match(validarRespaldo(r3).error, /Medición 1/);
  const r4 = valido(); r4.ninos.push({ ...r4.ninos[0] });
  assert.match(validarRespaldo(r4).error, /repetido/);
});

test('generarRespaldo y leerRespaldo van y vuelven', () => {
  const r = leerRespaldo(generarRespaldo(valido()));
  assert.equal(r.valido, true);
  assert.deepEqual(r.datos, valido());
  assert.match(leerRespaldo('{no es json').error, /JSON/);
  assert.equal(leerRespaldo('{"version":1}').valido, false);
});

// localStorage simulado para Node.
function simularLocalStorage({ fallarAlGuardar = false } = {}) {
  const mapa = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mapa.has(k) ? mapa.get(k) : null),
    setItem: (k, v) => {
      if (fallarAlGuardar) throw new Error('QuotaExceededError');
      mapa.set(k, String(v));
    },
  };
  return mapa;
}

beforeEach(() => simularLocalStorage());

test('cargar sin datos previos empieza vacío', () => {
  assert.deepEqual(cargar(), { ok: true });
  assert.deepEqual(obtenerDatos(), crearDatosVacios());
});

test('modificar guarda en localStorage y actualiza el estado', () => {
  const mapa = simularLocalStorage();
  cargar();
  const nino = modificar((d) => agregarNino(d, { nombre: 'Ana', fechaNacimiento: '2018-01-01', sexo: 'F' }));
  assert.equal(obtenerDatos().ninos[0].id, nino.id);
  assert.equal(JSON.parse(mapa.get(CLAVE)).ninos.length, 1);
  cargar();
  assert.equal(obtenerDatos().ninos.length, 1);
});

test('si la operación falla, el estado no cambia', () => {
  cargar();
  assert.throws(() => modificar((d) => { d.ninos.push({ id: 'x' }); throw new Error('falla'); }), /falla/);
  assert.equal(obtenerDatos().ninos.length, 0);
});

test('si localStorage no puede guardar, el estado no cambia y hay un mensaje claro', () => {
  simularLocalStorage({ fallarAlGuardar: true });
  cargar();
  assert.throws(() => modificar((d) => agregarNino(d, { nombre: 'Ana', fechaNacimiento: '2018-01-01', sexo: 'F' })), /No se pudo guardar/);
  assert.equal(obtenerDatos().ninos.length, 0);
});

test('datos dañados bloquean la escritura hasta restaurar', () => {
  const mapa = simularLocalStorage();
  mapa.set(CLAVE, '{dañado');
  const r = cargar();
  assert.equal(r.ok, false);
  assert.match(r.error, /dañados/);
  assert.throws(() => modificar(() => {}), /Restaura un respaldo/);
  assert.equal(mapa.get(CLAVE), '{dañado');
  reemplazarTodo(valido());
  assert.equal(obtenerDatos().ninos.length, 1);
  modificar((d) => agregarNino(d, { nombre: 'Ana', fechaNacimiento: '2018-01-01', sexo: 'F' }));
  assert.equal(JSON.parse(mapa.get(CLAVE)).ninos.length, 2);
});

test('estaBloqueado indica datos dañados hasta restaurar', () => {
  const mapa = simularLocalStorage();
  mapa.set(CLAVE, '{dañado');
  cargar();
  assert.equal(estaBloqueado(), true);
  reemplazarTodo(valido());
  assert.equal(estaBloqueado(), false);
});
