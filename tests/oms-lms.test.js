import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OMS2006, OMS2007 } from '../js/oms-lms.js';

test('OMS2006 cubre los días 1090 a 1826 para ambos sexos', () => {
  assert.equal(OMS2006.desde, 1090);
  assert.equal(OMS2006.hasta, 1826);
  assert.equal(OMS2006.M.length, 737);
  assert.equal(OMS2006.F.length, 737);
});

test('OMS2007 cubre los meses 60 a 192 para ambos sexos', () => {
  assert.equal(OMS2007.desde, 60);
  assert.equal(OMS2007.hasta, 192);
  assert.equal(OMS2007.M.length, 133);
  assert.equal(OMS2007.F.length, 133);
});

test('valores de control de la tabla OMS 2006', () => {
  assert.deepEqual(OMS2006.M[1096 - 1090], [-0.31, 15.5986, 0.07931]);
  assert.deepEqual(OMS2006.F[1096 - 1090], [-0.5684, 15.3966, 0.08535]);
  assert.deepEqual(OMS2006.M[1826 - 1090], [-0.6889, 15.1917, 0.08699]);
  assert.deepEqual(OMS2006.F[1826 - 1090], [-0.5684, 15.2747, 0.09789]);
});

test('valores de control de la tabla OMS 2007', () => {
  assert.deepEqual(OMS2007.M[60 - 60], [-0.7151, 15.2679, 0.08366]);
  assert.deepEqual(OMS2007.M[61 - 60], [-0.7387, 15.2641, 0.0839]);
  assert.deepEqual(OMS2007.F[61 - 60], [-0.8886, 15.2441, 0.09692]);
  assert.deepEqual(OMS2007.M[191 - 60], [-1.3653, 20.4376, 0.12567]);
  assert.deepEqual(OMS2007.F[191 - 60], [-1.0447, 20.6663, 0.14057]);
});
