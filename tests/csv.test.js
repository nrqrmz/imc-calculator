import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COLUMNAS, PLANTILLA_CSV, parsearCSV, analizarImportacion, aplicarImportacion, generarCSVExportacion, decodificarCSV,
} from '../js/csv.js';
import { crearDatosVacios, agregarNino, guardarMedicion, medicionesDe } from '../js/datos.js';

const HOY = '2026-09-27';
const ENCABEZADO = COLUMNAS.join(',');

test('parsearCSV con comillas, comas y comillas escapadas', () => {
  assert.deepEqual(parsearCSV('a,b\n"x, y","di ""hola"""\n'), [['a', 'b'], ['x, y', 'di "hola"']]);
});

test('parsearCSV con BOM, CRLF, punto y coma y sin salto final', () => {
  assert.deepEqual(parsearCSV('﻿a;b\r\n1;2\r\n3;4'), [['a', 'b'], ['1', '2'], ['3', '4']]);
});

test('parsearCSV con salto de línea dentro de comillas', () => {
  assert.deepEqual(parsearCSV('a,b\n"uno\ndos",3\n'), [['a', 'b'], ['uno\ndos', '3']]);
});

test('analizarImportacion: archivo vacío o sin columnas', () => {
  assert.match(analizarImportacion('', crearDatosVacios(), HOY).error, /vacío/);
  assert.match(analizarImportacion('nombre,sexo\nAna,F', crearDatosVacios(), HOY).error, /Faltan columnas: fecha_nacimiento/);
});

test('analizarImportacion acepta formatos variados y columnas en otro orden', () => {
  const csv = [
    'Peso_KG;Altura_cm;Grado;Taller;Fecha_Medicion;Sexo;Fecha_Nacimiento;Nombre;Notas',
    '29,0;125;5°;Taller II;15/09/2026;Niña;12/05/2019;  Sofía  López ;algo',
    '17.2;104.5;2;cn;2026-09-15;m;2021-12-03;Diego Mora;',
    '',
  ].join('\r\n');
  const r = analizarImportacion(csv, crearDatosVacios(), HOY);
  assert.deepEqual(r.errores, []);
  assert.deepEqual(r.resumen, { validas: 2, ninosNuevos: 2, medicionesNuevas: 2, reemplazos: 0 });
  assert.deepEqual(r.validas[0].nino, { nombre: 'Sofía López', fechaNacimiento: '2019-05-12', sexo: 'F' });
  assert.deepEqual(r.validas[0].medicion, { fecha: '2026-09-15', pesoKg: 29, alturaCm: 125, taller: 'T2', grado: 5 });
});

test('analizarImportacion reporta errores por fila con su número', () => {
  const csv = [
    ENCABEZADO,
    'Ana Ruiz,01/02/2018,F,15/09/2026,T1,5,120,22',
    ',01/02/2018,F,15/09/2026,T1,2,120,22',
    'Luis Vega,01/02/2018,X,15/09/2026,T1,2,12.5,22',
  ].join('\n');
  const r = analizarImportacion(csv, crearDatosVacios(), HOY);
  assert.equal(r.validas.length, 0);
  assert.deepEqual(r.errores.map((e) => e.fila), [2, 3, 4]);
  assert.match(r.errores[0].mensaje, /no pertenece a Taller I/);
  assert.match(r.errores[1].mensaje, /nombre/);
  assert.match(r.errores[2].mensaje, /niña o niño/);
  assert.match(r.errores[2].mensaje, /Altura/);
});

test('un niño nuevo con varias filas cuenta una sola vez', () => {
  const csv = [
    ENCABEZADO,
    'Ana Ruiz,01/02/2018,F,15/09/2025,T1,2,118,21',
    'ANA RUIZ,01/02/2018,F,15/03/2026,T1,2,121,22',
  ].join('\n');
  const datos = crearDatosVacios();
  const r = analizarImportacion(csv, datos, HOY);
  assert.deepEqual(r.resumen, { validas: 2, ninosNuevos: 1, medicionesNuevas: 2, reemplazos: 0 });
  aplicarImportacion(datos, r.validas);
  assert.equal(datos.ninos.length, 1);
  assert.equal(datos.mediciones.length, 2);
});

test('sexo contradictorio: contra un niño existente y dentro del mismo archivo', () => {
  const datos = crearDatosVacios();
  agregarNino(datos, { nombre: 'Ana Ruiz', fechaNacimiento: '2018-02-01', sexo: 'F' });
  const csv = [
    ENCABEZADO,
    'Ana Ruiz,01/02/2018,M,15/09/2026,T1,2,120,22',
    'Beto Paz,01/02/2018,M,15/09/2025,T1,2,120,22',
    'Beto Paz,01/02/2018,F,15/03/2026,T1,2,121,22',
  ].join('\n');
  const r = analizarImportacion(csv, datos, HOY);
  assert.deepEqual(r.errores.map((e) => e.fila), [2, 4]);
  assert.match(r.errores[0].mensaje, /registrado como niña/);
  assert.match(r.errores[1].mensaje, /registrado como niño/);
});

test('medición duplicada dentro del archivo y reemplazo de una existente', () => {
  const datos = crearDatosVacios();
  const ana = agregarNino(datos, { nombre: 'Ana Ruiz', fechaNacimiento: '2018-02-01', sexo: 'F' });
  guardarMedicion(datos, { ninoId: ana.id, fecha: '2026-09-15', pesoKg: 21, alturaCm: 119, taller: 'T1', grado: 2 });
  const csv = [
    ENCABEZADO,
    'Ana Ruiz,01/02/2018,F,15/09/2026,T1,2,120,22',
    'Ana Ruiz,01/02/2018,F,2026-09-15,T1,2,120,22',
  ].join('\n');
  const r = analizarImportacion(csv, datos, HOY);
  assert.deepEqual(r.resumen, { validas: 1, ninosNuevos: 0, medicionesNuevas: 0, reemplazos: 1 });
  assert.match(r.errores[0].mensaje, /Duplica la medición de la fila 2/);
  aplicarImportacion(datos, r.validas);
  assert.equal(medicionesDe(datos, ana.id).length, 1);
  assert.equal(medicionesDe(datos, ana.id)[0].pesoKg, 22);
});

test('la plantilla se importa sin errores', () => {
  const r = analizarImportacion(PLANTILLA_CSV, crearDatosVacios(), HOY);
  assert.deepEqual(r.errores, []);
  assert.equal(r.validas.length, 1);
});

test('exportar incluye calculados, escapa comas y se puede reimportar', () => {
  const datos = crearDatosVacios();
  const nino = agregarNino(datos, { nombre: 'López, Sofía', fechaNacimiento: '2019-05-12', sexo: 'F' });
  guardarMedicion(datos, { ninoId: nino.id, fecha: '2026-09-15', pesoKg: 29, alturaCm: 125, taller: 'T2', grado: 5 });
  const csv = generarCSVExportacion(datos);
  assert.ok(csv.startsWith('﻿'));
  const [encabezado, fila] = parsearCSV(csv);
  assert.deepEqual(encabezado.slice(-6), ['edad_meses', 'ciclo', 'imc', 'z', 'percentil', 'clasificacion']);
  assert.equal(fila[0], 'López, Sofía');
  assert.equal(fila[1], '12/05/2019');
  assert.equal(fila[8], '88');
  assert.equal(fila[9], '2026–2027');
  assert.equal(fila[10], '18.6');
  assert.equal(fila[13], 'Sobrepeso');

  const r = analizarImportacion(csv, crearDatosVacios(), HOY);
  assert.deepEqual(r.errores, []);
  assert.deepEqual(r.validas[0].medicion, { fecha: '2026-09-15', pesoKg: 29, alturaCm: 125, taller: 'T2', grado: 5 });
});

test('el grado acepta 5°, 5º y 5o; un grado ilegible da un mensaje claro', () => {
  const csv = [
    ENCABEZADO,
    'Ana Ruiz,01/02/2018,F,15/09/2026,T2,5º,120,22',
    'Beto Paz,01/02/2018,M,15/09/2026,T2,5o,120,22',
    'Caro Luz,01/02/2018,F,15/09/2026,T2,quinto,120,22',
  ].join('\n');
  const r = analizarImportacion(csv, crearDatosVacios(), HOY);
  assert.equal(r.validas.length, 2);
  assert.deepEqual(r.validas.map((v) => v.medicion.grado), [5, 5]);
  assert.equal(r.errores[0].fila, 4);
  assert.match(r.errores[0].mensaje, /Grado no reconocido: "quinto"/);
});

test('decodificarCSV lee UTF-8 y también ANSI (Windows-1252) de Excel', () => {
  const utf8 = new TextEncoder().encode('﻿nombre\nMaría Peña\n');
  assert.equal(decodificarCSV(utf8.buffer), 'nombre\nMaría Peña\n');
  const ansi = Uint8Array.from([0x4d, 0x61, 0x72, 0xed, 0x61, 0x20, 0x50, 0x65, 0xf1, 0x61]); // "María Peña" en Windows-1252
  assert.equal(decodificarCSV(ansi.buffer), 'María Peña');
});
