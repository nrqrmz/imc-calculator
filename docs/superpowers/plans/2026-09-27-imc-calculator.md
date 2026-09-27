# Calculadora de IMC escolar — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App web estática (GitHub Pages) para que una escuela Montessori registre peso y altura de alumnos de 3 a 15 años, clasifique su IMC para la edad con las tablas OMS y vea estadísticas por taller, grado y ciclo escolar.

**Architecture:** Una sola página (`index.html`) con cuatro vistas por pestañas (hash `#captura`, `#ninos`, `#estadisticas`, `#datos`). La lógica vive en módulos ES puros y sin DOM (`js/*.js`), probados con `node --test`; las vistas (`js/views/*.js`) solo leen y escriben a través de `js/store.js`, que guarda un único objeto JSON en `localStorage`. Los coeficientes OMS se generan una vez desde los archivos oficiales versionados en `data-oms/`.

**Tech Stack:** HTML + CSS + JavaScript vanilla (módulos ES nativos), Chart.js 4.5.1 por CDN, `node:test` (Node ≥ 20) sin dependencias npm.

**Spec:** `docs/superpowers/specs/2026-09-27-imc-calculator-design.md`

## Global Constraints

- Sin frameworks, sin paso de build, sin dependencias npm. Única dependencia de runtime: `https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js` (cargado con `defer` antes de `js/app.js`; se usa como `window.Chart`).
- Interfaz e identificadores en español.
- Datos en `localStorage`, clave `imc-calculator`, objeto `{ version: 1, ninos: [], mediciones: [] }`. No se guarda nada calculado.
- Fechas internas `AAAA-MM-DD` (cadenas, aritmética en UTC); en pantalla y CSV exportado `DD/MM/AAAA`.
- OMS: hasta 1826 días de edad → Patrones 2006 por día; después → Referencia 2007 por mes con interpolación lineal (meses = días / 30.4375). Z con ajuste OMS para |Z| > 3, redondeado a 2 decimales antes de clasificar.
- Cortes: Z < −3 delgadez severa; < −2 delgadez; ≤ +1 normal; obesidad si Z > +3 (≤ 1826 días) o Z > +2 (después); en medio, sobrepeso.
- Validación: nombre no vacío; 3 a 15 años cumplidos en la fecha de medición; medición no futura ni anterior al nacimiento; altura 70–200 cm; peso 8–150 kg; par taller/grado válido; |Z| > 5 es advertencia, no error.
- Talleres: CN (1°–3° preescolar), T1 (1°–3° primaria), T2 (4°–6° primaria), T3 (1°–3° secundaria).
- Ciclo escolar agosto–julio, escrito con guion largo U+2013: `2026–2027`.
- Identidad del niño: nombre normalizado (sin acentos, minúsculas, espacios colapsados) + fecha de nacimiento.
- Despliegue: GitHub Pages desde la rama `master`, carpeta raíz.
- Cada commit termina con la línea `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Zona horaria:** en México (UTC−6), `new Date('2026-09-15')` cae el día 14 en hora local; edad, ciclo y "hoy" deben salir del día correcto. → Task 1 (`diasEntre`, `hoyISO`).
2. **CSV guardado desde Excel:** BOM, fin de línea `\r\n`, separador `;`, coma decimal (`29,5`), `5°` en el grado, filas vacías al final y columnas en otro orden deben importarse sin error. → Task 9.
3. **El mismo niño escrito distinto o repetido en el CSV** ("María José" / "MARIA JOSE", varias filas de un niño nuevo) debe quedar como un solo niño; sexo contradictorio o misma fecha duplicada, como error de fila. → Task 6 y Task 9.
4. **Cumpleaños límite:** nacidos el 29 de febrero y niños que cumplen 3 años en un tramo sin 29 de febrero (1095 días) deben ser válidos y calcularse. → Task 1 y Task 5.
5. **`localStorage` lleno o dañado:** un error al guardar no debe cambiar el estado en memoria, y datos dañados no se sobrescriben hasta restaurar un respaldo. → Task 7.

---

### Task 1: Base del proyecto, fechas y ciclo escolar

**Files:**
- Create: `package.json`
- Create: `js/fechas.js`
- Create: `js/ciclo.js`
- Test: `tests/fechas.test.js`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `fechas.js`: `esFechaValida(iso): boolean`, `parsearFecha(texto): string|null` (acepta `AAAA-MM-DD` y `DD/MM/AAAA`), `formatearFecha(iso): 'DD/MM/AAAA'`, `hoyISO(ahora?: Date): string`, `diasEntre(desde, hasta): number`, `edadCalendario(nacimiento, fecha): { anios, meses, totalMeses }`, `formatearEdad({anios, meses}): string`, `formatearEdadCorta({anios, meses}): string` (`'8a 2m'` con espacio no separable).
  - `ciclo.js`: `cicloEscolar(iso): string` (`'2026–2027'`).

- [ ] **Step 1: Crear `package.json`**

```json
{
  "name": "imc-calculator",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test"
  }
}
```

- [ ] **Step 2: Escribir las pruebas que fallan**

`tests/fechas.test.js`:

```js
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
```

- [ ] **Step 3: Correr las pruebas y verificar que fallan**

Run: `npm test`
Expected: FAIL con `Cannot find module '.../js/fechas.js'`.

- [ ] **Step 4: Implementar `js/fechas.js`**

```js
// Fechas como cadenas 'AAAA-MM-DD'. Toda la aritmética se hace en UTC
// para que la zona horaria del navegador no mueva los días.

const RE_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const RE_MX = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const MS_POR_DIA = 86_400_000;

function partes(iso) {
  const m = RE_ISO.exec(iso);
  return m ? { a: Number(m[1]), m: Number(m[2]), d: Number(m[3]) } : null;
}

function aUTC(iso) {
  const p = partes(iso);
  return Date.UTC(p.a, p.m - 1, p.d);
}

export function esFechaValida(iso) {
  const p = partes(String(iso ?? ''));
  if (!p) return false;
  const f = new Date(Date.UTC(p.a, p.m - 1, p.d));
  return f.getUTCFullYear() === p.a && f.getUTCMonth() === p.m - 1 && f.getUTCDate() === p.d;
}

// Acepta 'AAAA-MM-DD' o 'DD/MM/AAAA'. Devuelve 'AAAA-MM-DD' o null.
export function parsearFecha(texto) {
  const t = String(texto ?? '').trim();
  let iso = null;
  if (RE_ISO.test(t)) {
    iso = t;
  } else {
    const m = RE_MX.exec(t);
    if (m) iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return iso && esFechaValida(iso) ? iso : null;
}

export function formatearFecha(iso) {
  const p = partes(iso);
  return `${String(p.d).padStart(2, '0')}/${String(p.m).padStart(2, '0')}/${p.a}`;
}

// Fecha local de hoy (la de la computadora de la escuela).
export function hoyISO(ahora = new Date()) {
  const mm = String(ahora.getMonth() + 1).padStart(2, '0');
  const dd = String(ahora.getDate()).padStart(2, '0');
  return `${ahora.getFullYear()}-${mm}-${dd}`;
}

export function diasEntre(desde, hasta) {
  return Math.round((aUTC(hasta) - aUTC(desde)) / MS_POR_DIA);
}

// Edad en años y meses cumplidos. Quien nace el 29/02 cumple meses el día 1 siguiente.
export function edadCalendario(nacimiento, fecha) {
  const a = partes(nacimiento);
  const b = partes(fecha);
  let totalMeses = (b.a - a.a) * 12 + (b.m - a.m);
  if (b.d < a.d) totalMeses -= 1;
  return { anios: Math.floor(totalMeses / 12), meses: totalMeses % 12, totalMeses };
}

export function formatearEdad({ anios, meses }) {
  const textoAnios = `${anios} ${anios === 1 ? 'año' : 'años'}`;
  return meses === 0 ? textoAnios : `${textoAnios} ${meses} ${meses === 1 ? 'mes' : 'meses'}`;
}

// Con espacio no separable para que no se parta en la tabla.
export function formatearEdadCorta({ anios, meses }) {
  return `${anios}a\u00a0${meses}m`;
}
```

- [ ] **Step 5: Implementar `js/ciclo.js`**

```js
// Ciclo escolar SEP: de agosto a julio.
export function cicloEscolar(fecha) {
  const [anio, mes] = fecha.split('-').map(Number);
  return mes >= 8 ? `${anio}–${anio + 1}` : `${anio - 1}–${anio}`;
}
```

- [ ] **Step 6: Correr las pruebas y verificar que pasan**

Run: `npm test`
Expected: PASS, 10 pruebas, 0 fallas.

- [ ] **Step 7: Commit**

```bash
git add package.json js/fechas.js js/ciclo.js tests/fechas.test.js
git commit -m "Agregar utilidades de fechas y ciclo escolar"
```

---

### Task 2: Tablas OMS (coeficientes LMS)

**Files:**
- Create: `data-oms/bmianthro.txt`, `data-oms/bfawho2007.txt` (descargados, oficiales)
- Create: `scripts/generar-oms-lms.mjs`
- Create: `js/oms-lms.js` (generado por el script, se versiona)
- Test: `tests/oms-lms.test.js`

**Interfaces:**
- Consumes: nada.
- Produces: `oms-lms.js` exporta `OMS2006 = { desde: 1090, hasta: 1826, M: [[L,M,S], …], F: [...] }` (índice = días de edad − 1090) y `OMS2007 = { desde: 60, hasta: 192, M: [...], F: [...] }` (índice = meses − 60). `M` = niño, `F` = niña.

- [ ] **Step 1: Descargar los archivos oficiales de la OMS**

Son los archivos que usan los paquetes oficiales de la OMS: WHO Anthro (0–5 años) y WHO AnthroPlus (5–19 años).

```bash
mkdir -p data-oms
curl -sL -o data-oms/bmianthro.txt https://raw.githubusercontent.com/WorldHealthOrganization/anthro/master/data-raw/growthstandards/bmianthro.txt
curl -sL -o data-oms/bfawho2007.txt https://raw.githubusercontent.com/WorldHealthOrganization/anthroplus/master/data-raw/growthstandards/bfawho2007.txt
head -2 data-oms/bmianthro.txt data-oms/bfawho2007.txt
```

Expected: encabezados `sex	age	l	m	s	loh` y `sex	age	l	m	s`. Las columnas van separadas por tabulador y las líneas terminan en CRLF. `bmianthro.txt` va de 0 a 1826 días y `bfawho2007.txt` de 60 a 228 meses; en ambos, `sex` 1 = niño y 2 = niña.

- [ ] **Step 2: Escribir las pruebas que fallan**

`tests/oms-lms.test.js` (los valores de control están copiados de los archivos oficiales):

```js
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
```

- [ ] **Step 3: Correr las pruebas y verificar que fallan**

Run: `npm test`
Expected: FAIL en `tests/oms-lms.test.js` con `Cannot find module '.../js/oms-lms.js'`.

- [ ] **Step 4: Escribir el generador `scripts/generar-oms-lms.mjs`**

```js
// Genera js/oms-lms.js a partir de los archivos oficiales de la OMS en data-oms/.
// Uso (desde la raíz del repo): node scripts/generar-oms-lms.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const SEXO = { 1: 'M', 2: 'F' };

function leer(ruta) {
  return readFileSync(ruta, 'utf8').trim().split(/\r?\n/).slice(1).map((linea) => {
    const [sexo, edad, l, m, s] = linea.trim().split('\t');
    return { sexo: SEXO[sexo], edad: Number(edad), lms: [Number(l), Number(m), Number(s)] };
  });
}

function tabla(filas, desde, hasta) {
  const t = { desde, hasta, M: [], F: [] };
  for (const f of filas) {
    if (f.edad >= desde && f.edad <= hasta) t[f.sexo][f.edad - desde] = f.lms;
  }
  for (const sexo of ['M', 'F']) {
    const esperadas = hasta - desde + 1;
    const presentes = t[sexo].filter(Boolean).length;
    if (presentes !== esperadas) {
      throw new Error(`Tabla incompleta (${sexo}): ${presentes} de ${esperadas} filas`);
    }
  }
  return t;
}

// 2006: por día de edad, desde poco antes de los 3 años hasta 1826 días (60 meses).
const oms2006 = tabla(leer('data-oms/bmianthro.txt'), 1090, 1826);
// 2007: por mes de edad, de 60 a 192 (se interpola entre meses; 192 cubre 15 años 11 meses).
const oms2007 = tabla(leer('data-oms/bfawho2007.txt'), 60, 192);

writeFileSync('js/oms-lms.js', `// Generado por scripts/generar-oms-lms.mjs a partir de data-oms/. No editar a mano.
// Cada fila es [L, M, S].
// OMS2006 (Patrones de Crecimiento Infantil): índice = días de edad − desde.
// OMS2007 (Referencia de Crecimiento 5–19 años): índice = meses de edad − desde.
export const OMS2006 = ${JSON.stringify(oms2006)};
export const OMS2007 = ${JSON.stringify(oms2007)};
`);
console.log('js/oms-lms.js generado');
```

- [ ] **Step 5: Generar `js/oms-lms.js`**

Run: `node scripts/generar-oms-lms.mjs`
Expected: imprime `js/oms-lms.js generado` y el archivo pesa unos 45 KB.

- [ ] **Step 6: Correr las pruebas y verificar que pasan**

Run: `npm test`
Expected: PASS, todas las pruebas.

- [ ] **Step 7: Commit**

```bash
git add data-oms scripts/generar-oms-lms.mjs js/oms-lms.js tests/oms-lms.test.js
git commit -m "Agregar tablas OMS de IMC para la edad y su generador"
```

---

### Task 3: Cálculo de IMC, puntaje Z, percentil y clasificación

**Files:**
- Create: `js/imc.js`
- Test: `tests/imc.test.js`

**Interfaces:**
- Consumes: `OMS2006`, `OMS2007` (Task 2); `diasEntre`, `edadCalendario` (Task 1); `cicloEscolar` (Task 1).
- Produces:
  - Constantes: `DIAS_POR_MES = 30.4375`, `LIMITE_DIAS_2006 = 1826`, `CLASIFICACIONES = ['delgadez-severa','delgadez','normal','sobrepeso','obesidad']`, `ETIQUETAS: { [clasificacion]: 'Texto' }`.
  - `calcularIMC(pesoKg, alturaCm): number`
  - `lmsPorDias(sexo, dias)`, `lmsPorMeses(sexo, meses)`, `obtenerLMS(sexo, dias): [L,M,S]` (lanza `RangeError` fuera de tablas)
  - `valorDE([L,M,S], k): number`, `puntajeZ(imc, [L,M,S]): number`, `percentil(z): number` (0–100)
  - `clasificar(z, edadDias): clasificacion`
  - `tramosEscala(edadDias): [{ clasificacion, desde, hasta }]` (de −4 a +4, para la barra)
  - `evaluar(nino: {fechaNacimiento, sexo}, medicion: {fecha, pesoKg, alturaCm}): { edadDias, edad: {anios, meses, totalMeses}, imc (1 dec), z (2 dec), percentil (1 dec), clasificacion, ciclo }`
  - `evaluarSeguro(nino, medicion): resultado | null`

- [ ] **Step 1: Escribir las pruebas que fallan**

`tests/imc.test.js`. El caso "coincide con los resultados publicados por la OMS" toma 11 filas reales del archivo de validación de WHO AnthroPlus (`data-raw/survey_who2007_z.csv`): edad en meses, peso, altura y el `zbfa` que calcula el software oficial.

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calcularIMC, lmsPorDias, lmsPorMeses, obtenerLMS, valorDE, puntajeZ,
  percentil, clasificar, tramosEscala, evaluar, evaluarSeguro,
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
```

- [ ] **Step 2: Correr las pruebas y verificar que fallan**

Run: `npm test`
Expected: FAIL en `tests/imc.test.js` con `Cannot find module '.../js/imc.js'`.

- [ ] **Step 3: Implementar `js/imc.js`**

```js
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
```

- [ ] **Step 4: Correr las pruebas y verificar que pasan**

Run: `npm test`
Expected: PASS. En particular, "coincide con los resultados publicados por la OMS" pasa con los 11 casos.

- [ ] **Step 5: Commit**

```bash
git add js/imc.js tests/imc.test.js
git commit -m "Agregar cálculo de IMC, puntaje Z OMS, percentil y clasificación"
```

---

### Task 4: Normalización de textos y talleres

**Files:**
- Create: `js/normalizar.js`
- Create: `js/talleres.js`
- Test: `tests/normalizar-talleres.test.js`

**Interfaces:**
- Consumes: nada de tareas anteriores.
- Produces:
  - `normalizar.js`: `normalizarTexto(t): string`, `limpiarNombre(t): string`, `claveNino(nombre, fechaNacimiento): string`, `parsearSexo(t): 'F'|'M'|null`, `parsearDecimal(t): number|null` (acepta coma decimal).
  - `talleres.js`: `TALLERES: [{ clave, nombre, corto, nivel, grados }]`, `obtenerTaller(clave)`, `esParValido(clave, grado): boolean`, `etiquetaTallerGrado(clave, grado): 'T-II · 5°'`, `parsearTaller(t): clave|null`.

- [ ] **Step 1: Escribir las pruebas que fallan**

`tests/normalizar-talleres.test.js`:

```js
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
```

- [ ] **Step 2: Correr las pruebas y verificar que fallan**

Run: `npm test`
Expected: FAIL con `Cannot find module '.../js/normalizar.js'`.

- [ ] **Step 3: Implementar `js/normalizar.js`**

```js
// Normalización de textos capturados a mano o que vienen de un CSV.

// Sin acentos, en minúsculas y sin espacios de más: "  María  José " → "maria jose".
export function normalizarTexto(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

// Nombre para guardar: conserva acentos y mayúsculas, quita espacios de más.
export function limpiarNombre(nombre) {
  return String(nombre ?? '').trim().replace(/\s+/g, ' ');
}

// Clave de identidad de un niño: nombre normalizado + fecha de nacimiento.
export function claveNino(nombre, fechaNacimiento) {
  return `${normalizarTexto(nombre)}|${fechaNacimiento}`;
}

const SEXOS = { f: 'F', nina: 'F', mujer: 'F', m: 'M', nino: 'M', hombre: 'M' };

export function parsearSexo(texto) {
  return SEXOS[normalizarTexto(texto)] ?? null;
}

// Número positivo con punto o coma decimal: "29.5", "29,5", "125". Devuelve null si no es válido.
export function parsearDecimal(texto) {
  const t = String(texto ?? '').trim().replace(',', '.');
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : null;
}
```

- [ ] **Step 4: Implementar `js/talleres.js`**

```js
// Talleres Montessori de la escuela (uno de cada uno) y sus grados SEP.
import { normalizarTexto } from './normalizar.js';

export const TALLERES = [
  { clave: 'CN', nombre: 'Casa de Niños', corto: 'CN', nivel: 'preescolar', grados: [1, 2, 3] },
  { clave: 'T1', nombre: 'Taller I', corto: 'T-I', nivel: 'primaria', grados: [1, 2, 3] },
  { clave: 'T2', nombre: 'Taller II', corto: 'T-II', nivel: 'primaria', grados: [4, 5, 6] },
  { clave: 'T3', nombre: 'Taller III', corto: 'T-III', nivel: 'secundaria', grados: [1, 2, 3] },
];

export function obtenerTaller(clave) {
  return TALLERES.find((t) => t.clave === clave) ?? null;
}

export function esParValido(clave, grado) {
  const taller = obtenerTaller(clave);
  return Boolean(taller) && taller.grados.includes(grado);
}

// "T-II · 5°"
export function etiquetaTallerGrado(clave, grado) {
  return `${obtenerTaller(clave)?.corto ?? clave} · ${grado}°`;
}

const ALIAS = {
  cn: 'CN', casadeninos: 'CN',
  t1: 'T1', talleri: 'T1', taller1: 'T1',
  t2: 'T2', tallerii: 'T2', taller2: 'T2',
  t3: 'T3', talleriii: 'T3', taller3: 'T3',
};

// Acepta la clave (CN, T1…) o el nombre ("Taller II", "casa de niños"). Devuelve la clave o null.
export function parsearTaller(texto) {
  return ALIAS[normalizarTexto(texto).replace(/[\s-]/g, '')] ?? null;
}
```

- [ ] **Step 5: Correr las pruebas y verificar que pasan**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add js/normalizar.js js/talleres.js tests/normalizar-talleres.test.js
git commit -m "Agregar normalización de textos y catálogo de talleres"
```

---

### Task 5: Validación de registros

**Files:**
- Create: `js/validacion.js`
- Test: `tests/validacion.test.js`

**Interfaces:**
- Consumes: `esFechaValida`, `edadCalendario` (Task 1); `evaluar` (Task 3); `limpiarNombre` (Task 4); `obtenerTaller`, `esParValido` (Task 4).
- Produces: `RANGOS = { anios: [3, 15], alturaCm: [70, 200], pesoKg: [8, 150] }`, `Z_EXTREMO = 5`, `validarRegistro(registro, hoy): { valido, errores: { [campo]: mensaje }, advertencias: string[], resultado: evaluar(...)|null }`. Recibe `registro = { nombre, fechaNacimiento, sexo, fecha, taller, grado, alturaCm, pesoKg }`; las claves de `errores` son esos mismos nombres de campo.

- [ ] **Step 1: Escribir las pruebas que fallan**

`tests/validacion.test.js`:

```js
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
```

- [ ] **Step 2: Correr las pruebas y verificar que fallan**

Run: `npm test`
Expected: FAIL con `Cannot find module '.../js/validacion.js'`.

- [ ] **Step 3: Implementar `js/validacion.js`**

```js
// Validación de un registro (niño + medición). La usan la captura manual y la importación CSV.
import { esFechaValida, edadCalendario } from './fechas.js';
import { obtenerTaller, esParValido } from './talleres.js';
import { limpiarNombre } from './normalizar.js';
import { evaluar } from './imc.js';

export const RANGOS = { anios: [3, 15], alturaCm: [70, 200], pesoKg: [8, 150] };
export const Z_EXTREMO = 5;

const enRango = (valor, [min, max]) => typeof valor === 'number' && valor >= min && valor <= max;

// registro: { nombre, fechaNacimiento, sexo, fecha, taller, grado, alturaCm, pesoKg }
// hoy: 'AAAA-MM-DD'
// Devuelve { valido, errores: { campo: mensaje }, advertencias: [mensaje], resultado }.
export function validarRegistro(registro, hoy) {
  const { nombre, fechaNacimiento, sexo, fecha, taller, grado, alturaCm, pesoKg } = registro;
  const errores = {};

  if (!limpiarNombre(nombre)) errores.nombre = 'Escribe el nombre completo';
  if (!esFechaValida(fechaNacimiento)) errores.fechaNacimiento = 'Fecha de nacimiento inválida';
  if (sexo !== 'F' && sexo !== 'M') errores.sexo = 'Elige niña o niño';

  if (!esFechaValida(fecha)) errores.fecha = 'Fecha de medición inválida';
  else if (fecha > hoy) errores.fecha = 'La fecha de medición no puede ser futura';

  if (!errores.fechaNacimiento && !errores.fecha) {
    if (fecha < fechaNacimiento) {
      errores.fecha = 'La fecha de medición es anterior al nacimiento';
    } else {
      const { anios } = edadCalendario(fechaNacimiento, fecha);
      if (!enRango(anios, RANGOS.anios)) {
        errores.fechaNacimiento = `En la fecha de medición tiene ${anios} años; debe tener de 3 a 15`;
      }
    }
  }

  const infoTaller = obtenerTaller(taller);
  if (!infoTaller) errores.taller = 'Elige un taller';
  else if (grado == null) errores.grado = 'Elige un grado';
  else if (!esParValido(taller, grado)) errores.grado = `El grado ${grado}° no pertenece a ${infoTaller.nombre}`;

  if (!enRango(alturaCm, RANGOS.alturaCm)) errores.alturaCm = 'Altura fuera de rango (70–200 cm)';
  if (!enRango(pesoKg, RANGOS.pesoKg)) errores.pesoKg = 'Peso fuera de rango (8–150 kg)';

  const valido = Object.keys(errores).length === 0;
  const advertencias = [];
  let resultado = null;
  if (valido) {
    resultado = evaluar({ fechaNacimiento, sexo }, { fecha, pesoKg, alturaCm });
    if (Math.abs(resultado.z) > Z_EXTREMO) {
      advertencias.push(`Puntaje Z extremo (${resultado.z}): revisa la altura y el peso`);
    }
  }
  return { valido, errores, advertencias, resultado };
}
```

- [ ] **Step 4: Correr las pruebas y verificar que pasan**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/validacion.js tests/validacion.test.js
git commit -m "Agregar validación de registros de niño y medición"
```

---

### Task 6: Operaciones sobre los datos

**Files:**
- Create: `js/datos.js`
- Test: `tests/datos.test.js`

**Interfaces:**
- Consumes: `claveNino`, `limpiarNombre`, `normalizarTexto` (Task 4); `edadCalendario` (Task 1); `RANGOS` (Task 5).
- Produces (las funciones que modifican cambian el objeto `datos` recibido; `generarId` es opcional y por defecto usa `crypto.randomUUID()`):
  - `VERSION = 1`, `crearDatosVacios()`
  - `obtenerNino(datos, id)`, `buscarNinoPorClave(datos, nombre, fechaNacimiento)`, `buscarNinosPorNombre(datos, texto)` (ordenados), `medicionesDe(datos, ninoId)` (más reciente primero), `buscarMedicion(datos, ninoId, fecha)`
  - `agregarNino(datos, {nombre, fechaNacimiento, sexo}, generarId?) → nino` (lanza si hay duplicado)
  - `actualizarNino(datos, id, cambios) → nino` (lanza si hay duplicado o si alguna medición queda fuera de 3–15 años)
  - `eliminarNino(datos, id)` (también borra sus mediciones)
  - `guardarMedicion(datos, {ninoId, fecha, pesoKg, alturaCm, taller, grado}, generarId?) → { medicion, reemplazada }` (reemplaza la de la misma fecha)
  - `actualizarMedicion(datos, id, cambios) → medicion` (lanza si choca con otra fecha del mismo niño; no cambia `id` ni `ninoId`)
  - `eliminarMedicion(datos, id)`

- [ ] **Step 1: Escribir las pruebas que fallan**

`tests/datos.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  VERSION, crearDatosVacios, obtenerNino, buscarNinoPorClave, buscarNinosPorNombre,
  medicionesDe, buscarMedicion, agregarNino, actualizarNino, eliminarNino,
  guardarMedicion, actualizarMedicion, eliminarMedicion,
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
```

- [ ] **Step 2: Correr las pruebas y verificar que fallan**

Run: `npm test`
Expected: FAIL con `Cannot find module '.../js/datos.js'`.

- [ ] **Step 3: Implementar `js/datos.js`**

```js
// Operaciones sobre el objeto de datos { version, ninos, mediciones }.
// Las funciones que modifican cambian el objeto recibido; store.js les pasa una copia.
import { claveNino, limpiarNombre, normalizarTexto } from './normalizar.js';
import { edadCalendario } from './fechas.js';
import { RANGOS } from './validacion.js';

export const VERSION = 1;
const nuevoId = () => crypto.randomUUID();

export function crearDatosVacios() {
  return { version: VERSION, ninos: [], mediciones: [] };
}

export function obtenerNino(datos, id) {
  return datos.ninos.find((n) => n.id === id) ?? null;
}

export function buscarNinoPorClave(datos, nombre, fechaNacimiento) {
  const clave = claveNino(nombre, fechaNacimiento);
  return datos.ninos.find((n) => claveNino(n.nombre, n.fechaNacimiento) === clave) ?? null;
}

// Coincidencia parcial por nombre, ordenada alfabéticamente.
export function buscarNinosPorNombre(datos, texto) {
  const q = normalizarTexto(texto);
  if (!q) return [];
  return datos.ninos
    .filter((n) => normalizarTexto(n.nombre).includes(q))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

// Mediciones de un niño, de la más reciente a la más antigua.
export function medicionesDe(datos, ninoId) {
  return datos.mediciones
    .filter((m) => m.ninoId === ninoId)
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}

export function buscarMedicion(datos, ninoId, fecha) {
  return datos.mediciones.find((m) => m.ninoId === ninoId && m.fecha === fecha) ?? null;
}

export function agregarNino(datos, { nombre, fechaNacimiento, sexo }, generarId = nuevoId) {
  if (buscarNinoPorClave(datos, nombre, fechaNacimiento)) {
    throw new Error('Ya existe un niño con ese nombre y fecha de nacimiento');
  }
  const nino = { id: generarId(), nombre: limpiarNombre(nombre), fechaNacimiento, sexo };
  datos.ninos.push(nino);
  return nino;
}

export function actualizarNino(datos, id, cambios) {
  const nino = obtenerNino(datos, id);
  if (!nino) throw new Error('El niño no existe');
  const nuevo = { ...nino, ...cambios, id, nombre: limpiarNombre(cambios.nombre ?? nino.nombre) };
  const otro = buscarNinoPorClave(datos, nuevo.nombre, nuevo.fechaNacimiento);
  if (otro && otro.id !== id) throw new Error('Ya existe otro niño con ese nombre y fecha de nacimiento');
  for (const m of medicionesDe(datos, id)) {
    const { anios } = edadCalendario(nuevo.fechaNacimiento, m.fecha);
    if (m.fecha < nuevo.fechaNacimiento || anios < RANGOS.anios[0] || anios > RANGOS.anios[1]) {
      throw new Error('Con esa fecha de nacimiento alguna medición queda fuera de 3 a 15 años');
    }
  }
  Object.assign(nino, nuevo);
  return nino;
}

export function eliminarNino(datos, id) {
  datos.ninos = datos.ninos.filter((n) => n.id !== id);
  datos.mediciones = datos.mediciones.filter((m) => m.ninoId !== id);
}

// medicion: { ninoId, fecha, pesoKg, alturaCm, taller, grado }.
// Si el niño ya tiene una medición en esa fecha, la reemplaza.
export function guardarMedicion(datos, medicion, generarId = nuevoId) {
  const existente = buscarMedicion(datos, medicion.ninoId, medicion.fecha);
  if (existente) {
    Object.assign(existente, medicion, { id: existente.id });
    return { medicion: existente, reemplazada: true };
  }
  const nueva = { id: generarId(), ...medicion };
  datos.mediciones.push(nueva);
  return { medicion: nueva, reemplazada: false };
}

export function actualizarMedicion(datos, id, cambios) {
  const medicion = datos.mediciones.find((m) => m.id === id);
  if (!medicion) throw new Error('La medición no existe');
  const choque = buscarMedicion(datos, medicion.ninoId, cambios.fecha ?? medicion.fecha);
  if (choque && choque.id !== id) throw new Error('Este niño ya tiene otra medición en esa fecha');
  Object.assign(medicion, cambios, { id, ninoId: medicion.ninoId });
  return medicion;
}

export function eliminarMedicion(datos, id) {
  datos.mediciones = datos.mediciones.filter((m) => m.id !== id);
}
```

- [ ] **Step 4: Correr las pruebas y verificar que pasan**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/datos.js tests/datos.test.js
git commit -m "Agregar operaciones de altas, cambios y bajas de niños y mediciones"
```

---

### Task 7: Respaldo JSON y almacenamiento en localStorage

**Files:**
- Create: `js/respaldo.js`
- Create: `js/store.js`
- Test: `tests/respaldo-store.test.js`

**Interfaces:**
- Consumes: `esFechaValida` (Task 1); `esParValido` (Task 4); `VERSION`, `crearDatosVacios` (Task 6).
- Produces:
  - `respaldo.js`: `validarRespaldo(obj): { valido, error? }`, `generarRespaldo(datos): string`, `leerRespaldo(texto): { valido: true, datos } | { valido: false, error }`.
  - `store.js`: `CLAVE = 'imc-calculator'`, `cargar(): { ok } | { ok: false, error }`, `obtenerDatos()`, `modificar(operacion: (copia) => resultado): resultado` (lanza con mensaje en español si no puede guardar o si los datos están bloqueados), `reemplazarTodo(nuevos)`.

- [ ] **Step 1: Escribir las pruebas que fallan**

`tests/respaldo-store.test.js`. Usa un `localStorage` simulado en `globalThis`:

```js
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { validarRespaldo, generarRespaldo, leerRespaldo } from '../js/respaldo.js';
import { CLAVE, cargar, obtenerDatos, modificar, reemplazarTodo } from '../js/store.js';
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
```

- [ ] **Step 2: Correr las pruebas y verificar que fallan**

Run: `npm test`
Expected: FAIL con `Cannot find module '.../js/respaldo.js'`.

- [ ] **Step 3: Implementar `js/respaldo.js`**

```js
// Respaldo completo en JSON: generar, leer y validar.
import { esFechaValida } from './fechas.js';
import { esParValido } from './talleres.js';
import { VERSION } from './datos.js';

const esTexto = (v) => typeof v === 'string' && v.trim() !== '';
const esNumero = (v) => typeof v === 'number' && Number.isFinite(v);

export function validarRespaldo(obj) {
  const falla = (error) => ({ valido: false, error });
  if (!obj || typeof obj !== 'object') return falla('El archivo no contiene un respaldo');
  if (obj.version !== VERSION) return falla(`Versión de respaldo no soportada: ${obj.version}`);
  if (!Array.isArray(obj.ninos) || !Array.isArray(obj.mediciones)) return falla('Faltan las listas de niños o mediciones');

  const idsNinos = new Set();
  for (const [i, n] of obj.ninos.entries()) {
    if (!esTexto(n?.id) || !esTexto(n.nombre) || !esFechaValida(n.fechaNacimiento) || !['F', 'M'].includes(n.sexo)) {
      return falla(`Niño ${i + 1} con datos inválidos`);
    }
    if (idsNinos.has(n.id)) return falla(`Id de niño repetido: ${n.id}`);
    idsNinos.add(n.id);
  }

  const idsMediciones = new Set();
  for (const [i, m] of obj.mediciones.entries()) {
    const ok = esTexto(m?.id) && idsNinos.has(m.ninoId) && esFechaValida(m.fecha)
      && esNumero(m.pesoKg) && esNumero(m.alturaCm) && esParValido(m.taller, m.grado);
    if (!ok) return falla(`Medición ${i + 1} con datos inválidos`);
    if (idsMediciones.has(m.id)) return falla(`Id de medición repetido: ${m.id}`);
    idsMediciones.add(m.id);
  }
  return { valido: true };
}

export function generarRespaldo(datos) {
  return JSON.stringify(datos, null, 2);
}

// Devuelve { valido: true, datos } o { valido: false, error }.
export function leerRespaldo(texto) {
  let obj;
  try {
    obj = JSON.parse(texto);
  } catch {
    return { valido: false, error: 'El archivo no es un JSON válido' };
  }
  const v = validarRespaldo(obj);
  return v.valido ? { valido: true, datos: obj } : v;
}
```

- [ ] **Step 4: Implementar `js/store.js`**

```js
// Estado de la app guardado en localStorage. Todas las escrituras pasan por aquí.
import { crearDatosVacios } from './datos.js';
import { validarRespaldo } from './respaldo.js';

export const CLAVE = 'imc-calculator';

let datos = crearDatosVacios();
// Si lo guardado está dañado, no se permite escribir encima hasta restaurar un respaldo.
let bloqueado = false;

// Devuelve { ok: true } o { ok: false, error }.
export function cargar() {
  bloqueado = false;
  datos = crearDatosVacios();
  let texto;
  try {
    texto = localStorage.getItem(CLAVE);
  } catch {
    bloqueado = true;
    return { ok: false, error: 'No se pudo leer el almacenamiento del navegador.' };
  }
  if (texto === null) return { ok: true };
  try {
    const obj = JSON.parse(texto);
    if (!validarRespaldo(obj).valido) throw new Error('inválido');
    datos = obj;
    return { ok: true };
  } catch {
    bloqueado = true;
    return { ok: false, error: 'Los datos guardados están dañados. Restaura un respaldo desde la pestaña Datos.' };
  }
}

export function obtenerDatos() {
  return datos;
}

function escribir(nuevos) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(nuevos));
  } catch {
    throw new Error('No se pudo guardar: el almacenamiento del navegador está lleno o no disponible.');
  }
  datos = nuevos;
}

// Aplica una operación sobre una copia; solo si se guarda bien, la copia pasa a ser el estado.
export function modificar(operacion) {
  if (bloqueado) throw new Error('Los datos guardados están dañados. Restaura un respaldo antes de capturar.');
  const copia = structuredClone(datos);
  const resultado = operacion(copia);
  escribir(copia);
  return resultado;
}

export function reemplazarTodo(nuevos) {
  escribir(structuredClone(nuevos));
  bloqueado = false;
}
```

- [ ] **Step 5: Correr las pruebas y verificar que pasan**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add js/respaldo.js js/store.js tests/respaldo-store.test.js
git commit -m "Agregar respaldo JSON y almacenamiento en localStorage"
```

---

### Task 8: Agregaciones para estadísticas

**Files:**
- Create: `js/estadisticas.js`
- Test: `tests/estadisticas.test.js`

**Interfaces:**
- Consumes: `evaluarSeguro`, `CLASIFICACIONES` (Task 3); `TALLERES` (Task 4).
- Produces:
  - `GRUPOS_GRAFICA = ['delgadez','normal','sobrepeso','obesidad']`
  - `evaluarTodo(datos): [{ nino, medicion, resultado }]`
  - `ciclosDisponibles(items): string[]` (más reciente primero)
  - `primeraYUltima(items, ciclo): [{ primera, ultima, total }]`
  - `contar(items): { 'delgadez-severa', delgadez, normal, sobrepeso, obesidad, total }`
  - `porcentajesGrafica(conteo): [{ grupo, n, pct }]` (delgadez severa sumada a delgadez)
  - `comparacionTalleres(items, { ciclo, cual: 'primera'|'ultima', taller?, grado? }): [{ taller, nombre, conteo }]`
  - `evolucion(items, { ciclo, taller?, grado? }): [{ taller, nombre, ninos, primera: conteo, ultima: conteo }]`

- [ ] **Step 1: Escribir las pruebas que fallan**

`tests/estadisticas.test.js`:

```js
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
```

- [ ] **Step 2: Correr las pruebas y verificar que fallan**

Run: `npm test`
Expected: FAIL con `Cannot find module '.../js/estadisticas.js'`.

- [ ] **Step 3: Implementar `js/estadisticas.js`**

```js
// Agregaciones para la vista de Estadísticas.
import { evaluarSeguro, CLASIFICACIONES } from './imc.js';
import { TALLERES } from './talleres.js';

// En las gráficas, "delgadez severa" se suma a "delgadez".
export const GRUPOS_GRAFICA = ['delgadez', 'normal', 'sobrepeso', 'obesidad'];

// Todas las mediciones que se pueden evaluar: [{ nino, medicion, resultado }].
export function evaluarTodo(datos) {
  const ninos = new Map(datos.ninos.map((n) => [n.id, n]));
  const items = [];
  for (const medicion of datos.mediciones) {
    const nino = ninos.get(medicion.ninoId);
    const resultado = nino ? evaluarSeguro(nino, medicion) : null;
    if (resultado) items.push({ nino, medicion, resultado });
  }
  return items;
}

// Ciclos con datos, del más reciente al más antiguo.
export function ciclosDisponibles(items) {
  return [...new Set(items.map((i) => i.resultado.ciclo))].sort().reverse();
}

// Por niño dentro de un ciclo: [{ primera, ultima, total }].
export function primeraYUltima(items, ciclo) {
  const porNino = new Map();
  for (const item of items) {
    if (item.resultado.ciclo !== ciclo) continue;
    const grupo = porNino.get(item.nino.id);
    if (!grupo) {
      porNino.set(item.nino.id, { primera: item, ultima: item, total: 1 });
      continue;
    }
    grupo.total += 1;
    if (item.medicion.fecha < grupo.primera.medicion.fecha) grupo.primera = item;
    if (item.medicion.fecha > grupo.ultima.medicion.fecha) grupo.ultima = item;
  }
  return [...porNino.values()];
}

// { 'delgadez-severa': n, delgadez: n, normal: n, sobrepeso: n, obesidad: n, total: n }
export function contar(items) {
  const conteo = Object.fromEntries(CLASIFICACIONES.map((c) => [c, 0]));
  for (const item of items) conteo[item.resultado.clasificacion] += 1;
  conteo.total = items.length;
  return conteo;
}

// [{ grupo, n, pct }] en el orden de GRUPOS_GRAFICA.
export function porcentajesGrafica(conteo) {
  return GRUPOS_GRAFICA.map((grupo) => {
    const n = grupo === 'delgadez' ? conteo.delgadez + conteo['delgadez-severa'] : conteo[grupo];
    return { grupo, n, pct: conteo.total ? (n * 100) / conteo.total : 0 };
  });
}

const coincide = (item, taller, grado) =>
  item.medicion.taller === taller && (grado == null || item.medicion.grado === grado);

const talleresFiltrados = (taller) => (taller ? TALLERES.filter((t) => t.clave === taller) : TALLERES);

// Distribución por taller usando la primera o la última medición de cada niño en el ciclo.
// filtros: { ciclo, cual: 'primera' | 'ultima', taller: clave | null, grado: número | null }
export function comparacionTalleres(items, { ciclo, cual, taller = null, grado = null }) {
  const elegidas = primeraYUltima(items, ciclo).map((g) => g[cual]);
  return talleresFiltrados(taller).map((t) => ({
    taller: t.clave,
    nombre: t.nombre,
    conteo: contar(elegidas.filter((i) => coincide(i, t.clave, grado))),
  }));
}

// Primera contra última medición del ciclo. Solo cuenta niños con 2 o más mediciones;
// el taller y grado del niño son los de su última medición.
export function evolucion(items, { ciclo, taller = null, grado = null }) {
  const grupos = primeraYUltima(items, ciclo).filter((g) => g.total >= 2);
  return talleresFiltrados(taller).map((t) => {
    const delTaller = grupos.filter((g) => coincide(g.ultima, t.clave, grado));
    return {
      taller: t.clave,
      nombre: t.nombre,
      ninos: delTaller.length,
      primera: contar(delTaller.map((g) => g.primera)),
      ultima: contar(delTaller.map((g) => g.ultima)),
    };
  });
}
```

- [ ] **Step 4: Correr las pruebas y verificar que pasan**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/estadisticas.js tests/estadisticas.test.js
git commit -m "Agregar agregaciones por taller, grado y ciclo"
```

---

### Task 9: Importación y exportación CSV

**Files:**
- Create: `js/csv.js`
- Test: `tests/csv.test.js`

**Interfaces:**
- Consumes: `parsearFecha`, `formatearFecha` (Task 1); `claveNino`, `normalizarTexto`, `parsearSexo`, `parsearDecimal`, `limpiarNombre` (Task 4); `parsearTaller` (Task 4); `validarRegistro` (Task 5); `buscarNinoPorClave`, `buscarMedicion`, `agregarNino`, `guardarMedicion` (Task 6); `evaluarSeguro`, `ETIQUETAS` (Task 3).
- Produces:
  - `COLUMNAS` (las 8 columnas de importación), `PLANTILLA_CSV` (texto con BOM)
  - `parsearCSV(texto): string[][]`
  - `analizarImportacion(texto, datos, hoy): { error } | { validas: [{ fila, nino, medicion, reemplaza, ninoNuevo, clave }], errores: [{ fila, mensaje }], resumen: { validas, ninosNuevos, medicionesNuevas, reemplazos } }` (no modifica `datos`)
  - `aplicarImportacion(datos, validas): number` (modifica `datos`)
  - `generarCSVExportacion(datos): string` (BOM, `\r\n`, 8 columnas + `edad_meses, ciclo, imc, z, percentil, clasificacion`)

- [ ] **Step 1: Escribir las pruebas que fallan**

`tests/csv.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COLUMNAS, PLANTILLA_CSV, parsearCSV, analizarImportacion, aplicarImportacion, generarCSVExportacion,
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
```

- [ ] **Step 2: Correr las pruebas y verificar que fallan**

Run: `npm test`
Expected: FAIL con `Cannot find module '.../js/csv.js'`.

- [ ] **Step 3: Implementar `js/csv.js`**

```js
// Importación y exportación CSV.
import { parsearFecha, formatearFecha } from './fechas.js';
import { claveNino, normalizarTexto, parsearSexo, parsearDecimal, limpiarNombre } from './normalizar.js';
import { parsearTaller } from './talleres.js';
import { validarRegistro } from './validacion.js';
import { buscarNinoPorClave, buscarMedicion, agregarNino, guardarMedicion } from './datos.js';
import { evaluarSeguro, ETIQUETAS } from './imc.js';

export const COLUMNAS = [
  'nombre', 'fecha_nacimiento', 'sexo', 'fecha_medicion', 'taller', 'grado', 'altura_cm', 'peso_kg',
];
const COLUMNAS_CALCULADAS = ['edad_meses', 'ciclo', 'imc', 'z', 'percentil', 'clasificacion'];
const BOM = '﻿';

export const PLANTILLA_CSV = `${BOM}${COLUMNAS.join(',')}\r\nSofía López García,12/05/2019,F,15/09/2026,T2,5,125,29.0\r\n`;

// Separador: el que más aparece en la primera línea (coma o punto y coma).
function detectarSeparador(primeraLinea) {
  const cuenta = (c) => primeraLinea.split(c).length - 1;
  return cuenta(';') > cuenta(',') ? ';' : ',';
}

// CSV con comillas dobles (RFC 4180), saltos \n o \r\n y BOM opcional.
// Devuelve un arreglo de registros; cada registro es un arreglo de celdas.
export function parsearCSV(texto) {
  const t = texto.startsWith(BOM) ? texto.slice(1) : texto;
  const sep = detectarSeparador(t.split(/\r?\n/, 1)[0]);
  const registros = [];
  let registro = [];
  let celda = '';
  let enComillas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (enComillas) {
      if (c === '"' && t[i + 1] === '"') { celda += '"'; i++; }
      else if (c === '"') enComillas = false;
      else celda += c;
    } else if (c === '"') {
      enComillas = true;
    } else if (c === sep) {
      registro.push(celda); celda = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      registro.push(celda); registros.push(registro);
      registro = []; celda = '';
    } else {
      celda += c;
    }
  }
  if (celda !== '' || registro.length > 0) { registro.push(celda); registros.push(registro); }
  return registros;
}

const filaVacia = (registro) => registro.every((c) => c.trim() === '');

// Analiza el CSV contra los datos actuales sin modificarlos.
// Devuelve { error } si el archivo no sirve, o
// { validas: [{ fila, nino, medicion }], errores: [{ fila, mensaje }], resumen }.
export function analizarImportacion(texto, datos, hoy) {
  const registros = parsearCSV(texto);
  if (registros.length === 0 || filaVacia(registros[0])) return { error: 'El archivo está vacío' };

  const encabezados = registros[0].map((h) => normalizarTexto(h).replace(/\s+/g, '_'));
  const faltan = COLUMNAS.filter((c) => !encabezados.includes(c));
  if (faltan.length) return { error: `Faltan columnas: ${faltan.join(', ')}` };
  const indice = Object.fromEntries(COLUMNAS.map((c) => [c, encabezados.indexOf(c)]));

  const validas = [];
  const errores = [];
  const sexoDeNuevos = new Map(); // clave → sexo, para niños que aún no existen
  const vistas = new Map(); // clave|fecha → número de fila

  registros.slice(1).forEach((registro, i) => {
    const fila = i + 2;
    if (filaVacia(registro)) return;
    const celda = (col) => (registro[indice[col]] ?? '').trim();

    const textoGrado = celda('grado').replace('°', '');
    const registroCaptura = {
      nombre: limpiarNombre(celda('nombre')),
      fechaNacimiento: parsearFecha(celda('fecha_nacimiento')),
      sexo: parsearSexo(celda('sexo')),
      fecha: parsearFecha(celda('fecha_medicion')),
      taller: parsearTaller(celda('taller')),
      grado: /^\d+$/.test(textoGrado) ? Number(textoGrado) : null,
      alturaCm: parsearDecimal(celda('altura_cm')),
      pesoKg: parsearDecimal(celda('peso_kg')),
    };
    const v = validarRegistro(registroCaptura, hoy);
    if (!v.valido) {
      errores.push({ fila, mensaje: Object.values(v.errores).join('; ') });
      return;
    }

    const { nombre, fechaNacimiento, sexo, fecha, taller, grado, alturaCm, pesoKg } = registroCaptura;
    const clave = claveNino(nombre, fechaNacimiento);
    const existente = buscarNinoPorClave(datos, nombre, fechaNacimiento);
    const sexoConocido = existente?.sexo ?? sexoDeNuevos.get(clave);
    if (sexoConocido && sexoConocido !== sexo) {
      const como = sexoConocido === 'F' ? 'niña' : 'niño';
      errores.push({ fila, mensaje: `"${nombre}" ya está registrado como ${como} y aquí viene como ${sexo}` });
      return;
    }
    const claveMedicion = `${clave}|${fecha}`;
    if (vistas.has(claveMedicion)) {
      errores.push({ fila, mensaje: `Duplica la medición de la fila ${vistas.get(claveMedicion)} (mismo niño y fecha)` });
      return;
    }
    vistas.set(claveMedicion, fila);
    if (!existente) sexoDeNuevos.set(clave, sexo);

    validas.push({
      fila,
      nino: { nombre, fechaNacimiento, sexo },
      medicion: { fecha, pesoKg, alturaCm, taller, grado },
      reemplaza: Boolean(existente && buscarMedicion(datos, existente.id, fecha)),
      ninoNuevo: !existente,
      clave,
    });
  });

  const reemplazos = validas.filter((v) => v.reemplaza).length;
  const resumen = {
    validas: validas.length,
    ninosNuevos: new Set(validas.filter((v) => v.ninoNuevo).map((v) => v.clave)).size,
    medicionesNuevas: validas.length - reemplazos,
    reemplazos,
  };
  return { validas, errores, resumen };
}

// Aplica las filas válidas de analizarImportacion sobre datos (lo modifica).
export function aplicarImportacion(datos, validas) {
  for (const { nino, medicion } of validas) {
    const existente = buscarNinoPorClave(datos, nino.nombre, nino.fechaNacimiento) ?? agregarNino(datos, nino);
    guardarMedicion(datos, { ninoId: existente.id, ...medicion });
  }
  return validas.length;
}

function escaparCelda(valor) {
  const t = String(valor ?? '');
  return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

// Todas las mediciones con sus valores calculados. UTF-8 con BOM para Excel.
export function generarCSVExportacion(datos) {
  const ninos = new Map(datos.ninos.map((n) => [n.id, n]));
  const filas = datos.mediciones
    .filter((m) => ninos.has(m.ninoId))
    .map((m) => ({ m, n: ninos.get(m.ninoId) }))
    .sort((a, b) => a.n.nombre.localeCompare(b.n.nombre, 'es') || a.m.fecha.localeCompare(b.m.fecha))
    .map(({ m, n }) => {
      const r = evaluarSeguro(n, m);
      return [
        n.nombre, formatearFecha(n.fechaNacimiento), n.sexo, formatearFecha(m.fecha),
        m.taller, m.grado, m.alturaCm, m.pesoKg,
        r ? r.edad.totalMeses : '', r ? r.ciclo : '', r ? r.imc.toFixed(1) : '',
        r ? r.z.toFixed(2) : '', r ? r.percentil.toFixed(1) : '', r ? ETIQUETAS[r.clasificacion] : '',
      ].map(escaparCelda).join(',');
    });
  return `${BOM}${[...COLUMNAS, ...COLUMNAS_CALCULADAS].join(',')}\r\n${filas.map((f) => `${f}\r\n`).join('')}`;
}
```

- [ ] **Step 4: Correr las pruebas y verificar que pasan**

Run: `npm test`
Expected: PASS, 81 pruebas en total, 0 fallas.

- [ ] **Step 5: Commit**

```bash
git add js/csv.js tests/csv.test.js
git commit -m "Agregar importación CSV con vista previa y exportación CSV"
```

---

### Task 10: Estructura de la página y vista Captura

**Files:**
- Modify: `index.html` (existe vacío; se reemplaza completo)
- Create: `css/styles.css`
- Create: `js/views/dom.js`
- Create: `js/views/graficas.js`
- Create: `js/views/captura.js`
- Create: `js/app.js`

**Interfaces:**
- Consumes: `store` (Task 7); `datos.js` (Task 6); `validarRegistro` (Task 5); `TALLERES`, `obtenerTaller` (Task 4); `fechas.js` (Task 1); `ETIQUETAS`, `tramosEscala` (Task 3); `parsearDecimal`, `limpiarNombre` (Task 4); `GRUPOS_GRAFICA`, `porcentajesGrafica` (Task 8).
- Produces:
  - Contrato de vista: `crearVistaX(contenedor) → { mostrar(params) }`. `app.js` crea cada vista la primera vez que se abre y llama `mostrar(params)` en cada cambio de hash. `params` sale de la consulta del hash, por ejemplo `#captura?nino=<id>` → `{ nino: '<id>' }`.
  - `views/dom.js`: `escaparHTML(t)`, `descargar(nombreArchivo, contenido, tipo)`.
  - `views/graficas.js`: `COLORES`, `AVISO_SIN_GRAFICAS`, `chartDisponible()`, `barrasApiladas(canvas, [{ etiqueta, conteo }])`, `lineaZ(canvas, [{ etiqueta, z, clasificacion }], tramos)`.
  - `views/captura.js`: `crearVistaCaptura(contenedor)`. `mostrar({ nino })` preselecciona a un niño; `mostrar({ medicion })` edita una medición y al guardar navega a `#ninos?nino=<id>`.

- [ ] **Step 1: Escribir `index.html`**

```html
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>IMC Escolar</title>
  <link rel="stylesheet" href="css/styles.css">
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js" defer></script>
  <script type="module" src="js/app.js"></script>
</head>
<body>
  <header class="encabezado">
    <h1>IMC Escolar</h1>
    <nav class="pestanas">
      <a href="#captura" data-vista="captura">Captura</a>
      <a href="#ninos" data-vista="ninos">Niños</a>
      <a href="#estadisticas" data-vista="estadisticas">Estadísticas</a>
      <a href="#datos" data-vista="datos">Datos</a>
    </nav>
  </header>
  <div id="aviso-global" class="aviso" role="alert" hidden></div>
  <main>
    <section id="vista-captura" hidden></section>
    <section id="vista-ninos" hidden></section>
    <section id="vista-estadisticas" hidden></section>
    <section id="vista-datos" hidden></section>
  </main>
</body>
</html>
```

- [ ] **Step 2: Escribir `css/styles.css`**

```css
:root {
  --fondo: #f6f5f1;
  --tarjeta: #ffffff;
  --texto: #1f2933;
  --suave: #6b7280;
  --borde: #e3e1da;
  --acento: #4f46e5;
  --acento-suave: #eef2ff;
  --error: #b91c1c;
  --ok: #15803d;
  --radio: 10px;
  color-scheme: light;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}

* { box-sizing: border-box; }
body { margin: 0; background: var(--fondo); color: var(--texto); font-size: 15px; line-height: 1.45; }
[hidden] { display: none !important; }

/* Encabezado y pestañas */
.encabezado {
  display: flex; align-items: center; gap: 24px; flex-wrap: wrap;
  padding: 12px 24px; background: var(--tarjeta); border-bottom: 1px solid var(--borde);
}
.encabezado h1 { font-size: 1.15rem; margin: 0; }
.pestanas { display: flex; gap: 4px; flex-wrap: wrap; }
.pestanas a { padding: 8px 14px; border-radius: 8px; color: var(--suave); text-decoration: none; font-weight: 500; }
.pestanas a:hover { background: var(--fondo); color: var(--texto); }
.pestanas a.activa { background: var(--acento); color: #fff; }

main { max-width: 1200px; margin: 0 auto; padding: 20px 16px 48px; }
.aviso { background: #fef3c7; border: 1px solid #f59e0b; border-radius: var(--radio); padding: 10px 14px; margin: 12px auto; max-width: 1168px; }

/* Bloques comunes */
.tarjeta { background: var(--tarjeta); border: 1px solid var(--borde); border-radius: var(--radio); padding: 18px 20px; }
h2 { font-size: 1.05rem; margin: 0 0 12px; }
h3 { font-size: 0.95rem; margin: 16px 0 8px; }
.nota { color: var(--suave); font-size: 0.9rem; margin: 4px 0 10px; }
.fila { display: flex; gap: 16px; flex-wrap: wrap; }
.fila > * { flex: 1 1 220px; }
.campo { margin: 0 0 12px; border: 0; padding: 0; min-width: 0; }
.campo > label, .campo > legend { display: block; font-weight: 500; font-size: 0.9rem; margin-bottom: 4px; padding: 0; }

input:not([type="radio"]):not([type="checkbox"]), select {
  width: 100%; padding: 8px 10px; border: 1px solid var(--borde); border-radius: 8px; font: inherit; background: #fff;
}
input:focus, select:focus, button:focus-visible, .boton:focus-within { outline: 2px solid var(--acento); outline-offset: 1px; }
input[readonly] { background: var(--fondo); color: var(--suave); }

.opciones { display: flex; flex-wrap: wrap; gap: 6px; }
.opciones label {
  display: inline-flex; align-items: center; gap: 6px; margin: 0;
  padding: 6px 12px; border: 1px solid var(--borde); border-radius: 999px; cursor: pointer;
}
.opciones label:has(input:checked) { border-color: var(--acento); background: var(--acento-suave); }
.opciones label:has(input:disabled) { cursor: default; opacity: 0.8; }
.opciones input { margin: 0; }

.error { display: block; color: var(--error); font-size: 0.85rem; }
.error-general { color: var(--error); margin: 8px 0; }
.error-general:empty, .error:empty { display: none; }
.confirmacion { color: var(--ok); font-weight: 500; }

button, .boton {
  display: inline-flex; align-items: center; gap: 6px;
  font: inherit; padding: 8px 14px; border-radius: 8px; border: 1px solid var(--borde); background: #fff; color: var(--texto); cursor: pointer;
}
button:hover, .boton:hover { background: var(--fondo); }
button.primario { background: var(--acento); color: #fff; border-color: var(--acento); }
button.primario:hover { background: var(--acento); filter: brightness(1.1); }
button.peligro { color: var(--error); border-color: #fecaca; }
button:disabled { opacity: 0.5; cursor: not-allowed; }
.acciones { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin: 8px 0; }

/* Captura */
.captura { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: 20px; align-items: start; }
.campo-nombre { position: relative; }
.sugerencias {
  position: absolute; z-index: 10; left: 0; right: 0; top: 100%;
  margin: 2px 0 0; padding: 4px; list-style: none;
  background: #fff; border: 1px solid var(--borde); border-radius: 8px; box-shadow: 0 6px 20px rgba(0, 0, 0, 0.08);
}
.sugerencias button { width: 100%; justify-content: space-between; border: 0; }
.sugerencias small { color: var(--suave); }
.nino-registrado { font-size: 0.85rem; color: var(--suave); margin: -6px 0 10px; }
.resultado { position: sticky; top: 16px; }
.resultado .edad { color: var(--suave); margin: 0 0 12px; }
.metricas { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.metricas div { background: var(--fondo); border-radius: 8px; padding: 10px; text-align: center; }
.metricas span { display: block; font-size: 0.8rem; color: var(--suave); }
.metricas strong { font-size: 1.4rem; }
.clasificacion {
  margin: 16px 0 12px; padding: 10px 14px; border-radius: 8px; font-weight: 600; font-size: 1.15rem;
  border-left: 6px solid var(--color); background: color-mix(in srgb, var(--color) 14%, white);
}
.escala { position: relative; display: flex; height: 14px; }
.escala span:first-child { border-radius: 7px 0 0 7px; }
.escala span:last-of-type { border-radius: 0 7px 7px 0; }
.marcador { position: absolute; top: -5px; width: 4px; height: 24px; margin-left: -2px; background: var(--texto); border-radius: 2px; }
.escala-numeros { display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--suave); margin-top: 4px; }
.advertencia { background: #fef3c7; padding: 8px 10px; border-radius: 8px; font-size: 0.9rem; }

/* Tablas */
.tabla { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
.tabla th { text-align: left; font-weight: 600; color: var(--suave); font-size: 0.8rem; border-bottom: 1px solid var(--borde); padding: 6px 8px; }
.tabla td { border-bottom: 1px solid var(--borde); padding: 6px 8px; }
.tabla-scroll { overflow-x: auto; }
.tabla td:has(.punto) { white-space: nowrap; }
.punto { display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: var(--color); margin-right: 6px; }
.acciones-fila { white-space: nowrap; }
.acciones-fila button { padding: 4px 8px; }

/* Niños */
.ninos { display: grid; grid-template-columns: minmax(0, 4fr) minmax(0, 7fr); gap: 20px; align-items: start; }
.filtros { display: flex; gap: 12px; flex-wrap: wrap; align-items: end; margin: 10px 0; }
.filtros label { font-size: 0.85rem; font-weight: 500; }
.filtros select { width: auto; min-width: 140px; display: block; }
.lista tbody tr { cursor: pointer; }
.lista tbody tr:hover { background: var(--fondo); }
.lista tbody tr.seleccionada { background: var(--acento-suave); }
.ficha-encabezado { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.ficha-encabezado h2 { margin: 0; }
.ficha-encabezado p { margin: 2px 0 0; color: var(--suave); }
.editar-nino label { display: block; margin-bottom: 8px; font-weight: 500; font-size: 0.9rem; }
.editar-nino fieldset { border: 0; padding: 0; margin: 0 0 8px; }
.ficha .tabla td, .ficha .tabla th { white-space: nowrap; padding: 6px; }
.grafica { position: relative; height: 220px; margin-bottom: 12px; }

/* Estadísticas */
.estadisticas, .contenido, .datos { display: grid; gap: 20px; }
.estadisticas .filtros { margin: 0; }
.estadisticas fieldset { border: 0; padding: 0; margin: 0; }
.estadisticas legend { font-size: 0.85rem; font-weight: 500; padding: 0; margin-bottom: 4px; }
.evolucion + .evolucion { border-top: 1px solid var(--borde); margin-top: 12px; }
.evolucion-cuerpo { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: 16px; align-items: center; }

/* Datos */
.caja { padding: 10px 14px; border-radius: 8px; margin: 8px 0; }
.caja.ok { background: #dcfce7; }
.caja.error { background: #fee2e2; }
.caja ul { margin: 6px 0 0; padding-left: 20px; }

@media (max-width: 800px) {
  .captura, .ninos, .evolucion-cuerpo { grid-template-columns: 1fr; }
  .resultado { position: static; }
}
```

- [ ] **Step 3: Escribir `js/views/dom.js`**

```js
// Utilidades de DOM compartidas por las vistas.

const ENTIDADES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escaparHTML(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ENTIDADES[c]);
}

export function descargar(nombreArchivo, contenido, tipo) {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
```

- [ ] **Step 4: Escribir `js/views/graficas.js`**

```js
// Colores de clasificación y ayudantes de Chart.js (cargado desde el CDN como window.Chart).
import { ETIQUETAS } from '../imc.js';
import { GRUPOS_GRAFICA, porcentajesGrafica } from '../estadisticas.js';

export const COLORES = {
  'delgadez-severa': '#9a3412',
  delgadez: '#d97706',
  normal: '#16a34a',
  sobrepeso: '#eab308',
  obesidad: '#dc2626',
};

export const AVISO_SIN_GRAFICAS =
  '<p class="caja error">No se pudo cargar la librería de gráficas (¿sin internet?). Recarga la página cuando haya conexión.</p>';

export function chartDisponible() {
  return typeof window.Chart === 'function';
}

// Barras horizontales apiladas al 100%. filas: [{ etiqueta, conteo }] (conteo de estadisticas.contar).
export function barrasApiladas(canvas, filas) {
  const porFila = filas.map((f) => porcentajesGrafica(f.conteo));
  return new window.Chart(canvas, {
    type: 'bar',
    data: {
      labels: filas.map((f) => f.etiqueta),
      datasets: GRUPOS_GRAFICA.map((grupo, i) => ({
        label: ETIQUETAS[grupo],
        backgroundColor: COLORES[grupo],
        data: porFila.map((p) => p[i].pct),
        cantidades: porFila.map((p) => p[i].n),
      })),
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { stacked: true, min: 0, max: 100, ticks: { callback: (v) => `${v}%` } },
        y: { stacked: true },
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.x.toFixed(0)}% (${ctx.dataset.cantidades[ctx.dataIndex]})`,
          },
        },
      },
    },
  });
}

// Línea del puntaje Z en el tiempo con franjas de color por clasificación.
// puntos: [{ etiqueta, z, clasificacion }] en orden cronológico; tramos: imc.tramosEscala(...).
export function lineaZ(canvas, puntos, tramos) {
  const zs = puntos.map((p) => p.z);
  const franjas = {
    id: 'franjas',
    beforeDatasetsDraw(chart) {
      const { ctx, chartArea, scales: { y } } = chart;
      ctx.save();
      tramos.forEach((t, i) => {
        const desde = i === 0 ? y.min : Math.max(t.desde, y.min);
        const hasta = i === tramos.length - 1 ? y.max : Math.min(t.hasta, y.max);
        if (hasta <= desde) return;
        const arriba = y.getPixelForValue(hasta);
        ctx.fillStyle = `${COLORES[t.clasificacion]}26`;
        ctx.fillRect(chartArea.left, arriba, chartArea.right - chartArea.left, y.getPixelForValue(desde) - arriba);
      });
      ctx.restore();
    },
  };
  return new window.Chart(canvas, {
    type: 'line',
    data: {
      labels: puntos.map((p) => p.etiqueta),
      datasets: [{
        label: 'Puntaje Z',
        data: zs,
        borderColor: '#4f46e5',
        pointBackgroundColor: puntos.map((p) => COLORES[p.clasificacion]),
        pointRadius: 5,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          min: Math.min(-4, Math.floor(Math.min(...zs))),
          max: Math.max(4, Math.ceil(Math.max(...zs))),
          ticks: { stepSize: 1 },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: (ctx) => `Z ${ctx.parsed.y} · ${ETIQUETAS[puntos[ctx.dataIndex].clasificacion]}` },
        },
      },
    },
    plugins: [franjas],
  });
}
```

- [ ] **Step 5: Escribir `js/views/captura.js`**

```js
// Vista Captura: formulario de niño + medición con resultado en vivo.
import * as store from '../store.js';
import {
  buscarNinosPorNombre, buscarNinoPorClave, obtenerNino, agregarNino,
  guardarMedicion, buscarMedicion, actualizarMedicion,
} from '../datos.js';
import { validarRegistro } from '../validacion.js';
import { TALLERES, obtenerTaller } from '../talleres.js';
import { hoyISO, formatearFecha, formatearEdad } from '../fechas.js';
import { ETIQUETAS, tramosEscala } from '../imc.js';
import { parsearDecimal, limpiarNombre } from '../normalizar.js';
import { escaparHTML } from './dom.js';
import { COLORES } from './graficas.js';

const HTML = `
<div class="captura">
  <form class="tarjeta" novalidate>
    <h2>Niño</h2>
    <div class="campo campo-nombre">
      <label for="cap-nombre">Nombre completo</label>
      <input id="cap-nombre" name="nombre" autocomplete="off">
      <ul class="sugerencias" hidden></ul>
      <small class="error" data-error="nombre"></small>
    </div>
    <p class="nino-registrado" hidden>Niño registrado: sus datos se editan en la pestaña Niños.</p>
    <div class="fila">
      <div class="campo">
        <label for="cap-nacimiento">Fecha de nacimiento</label>
        <input id="cap-nacimiento" name="fechaNacimiento" type="date">
        <small class="error" data-error="fechaNacimiento"></small>
      </div>
      <fieldset class="campo">
        <legend>Sexo</legend>
        <div class="opciones">
          <label><input type="radio" name="sexo" value="F"> Niña</label>
          <label><input type="radio" name="sexo" value="M"> Niño</label>
        </div>
        <small class="error" data-error="sexo"></small>
      </fieldset>
    </div>

    <h2>Medición</h2>
    <div class="campo">
      <label for="cap-fecha">Fecha de medición</label>
      <input id="cap-fecha" name="fecha" type="date">
      <small class="error" data-error="fecha"></small>
    </div>
    <fieldset class="campo">
      <legend>Taller</legend>
      <div class="opciones">
        ${TALLERES.map((t) => `<label><input type="radio" name="taller" value="${t.clave}"> ${t.nombre}</label>`).join('')}
      </div>
      <small class="error" data-error="taller"></small>
    </fieldset>
    <fieldset class="campo">
      <legend>Grado</legend>
      <div class="opciones grados"></div>
      <small class="error" data-error="grado"></small>
    </fieldset>
    <div class="fila">
      <div class="campo">
        <label for="cap-altura">Altura (cm)</label>
        <input id="cap-altura" name="alturaCm" inputmode="decimal" placeholder="125.0">
        <small class="error" data-error="alturaCm"></small>
      </div>
      <div class="campo">
        <label for="cap-peso">Peso (kg)</label>
        <input id="cap-peso" name="pesoKg" inputmode="decimal" placeholder="29.0">
        <small class="error" data-error="pesoKg"></small>
      </div>
    </div>

    <p class="error-general" role="alert"></p>
    <div class="acciones">
      <button type="submit" class="primario">Guardar medición</button>
      <button type="button" class="cancelar-edicion" hidden>Cancelar edición</button>
    </div>
    <p class="confirmacion" role="status"></p>
  </form>
  <section class="tarjeta resultado" aria-live="polite"></section>
</div>`;

export function crearVistaCaptura(contenedor) {
  contenedor.innerHTML = HTML;
  const $ = (selector) => contenedor.querySelector(selector);
  const form = $('form');
  const campos = form.elements;
  const sugerencias = $('.sugerencias');
  const resultado = $('.resultado');
  let ninoSeleccionado = null; // niño existente elegido de las sugerencias
  let medicionEditada = null; // id de la medición que se está editando

  const marcado = (nombre) => form.querySelector(`[name="${nombre}"]:checked`)?.value ?? null;

  function renderGrados(gradoElegido = null) {
    const taller = obtenerTaller(marcado('taller'));
    $('.grados').innerHTML = taller
      ? taller.grados.map((g) => `<label><input type="radio" name="grado" value="${g}"${g === gradoElegido ? ' checked' : ''}> ${g}°</label>`).join('')
      : '<span class="nota">Elige primero el taller</span>';
  }

  function leerRegistro() {
    const grado = marcado('grado');
    return {
      nombre: campos.nombre.value,
      fechaNacimiento: campos.fechaNacimiento.value,
      sexo: marcado('sexo'),
      fecha: campos.fecha.value,
      taller: marcado('taller'),
      grado: grado ? Number(grado) : null,
      alturaCm: parsearDecimal(campos.alturaCm.value),
      pesoKg: parsearDecimal(campos.pesoKg.value),
    };
  }

  function mostrarErrores(errores) {
    form.querySelectorAll('[data-error]').forEach((el) => {
      el.textContent = errores[el.dataset.error] ?? '';
    });
  }

  function renderResultado() {
    const v = validarRegistro(leerRegistro(), hoyISO());
    if (!v.valido) {
      resultado.innerHTML = '<p class="nota">Completa los datos para ver el resultado.</p>';
      return;
    }
    const r = v.resultado;
    const posicion = ((Math.max(-4, Math.min(4, r.z)) + 4) / 8) * 100;
    resultado.innerHTML = `
      <p class="edad">${formatearEdad(r.edad)}</p>
      <div class="metricas">
        <div><span>IMC</span><strong>${r.imc.toFixed(1)}</strong></div>
        <div><span>Puntaje Z</span><strong>${r.z > 0 ? '+' : ''}${r.z.toFixed(2)}</strong></div>
        <div><span>Percentil</span><strong>${r.percentil.toFixed(1)}</strong></div>
      </div>
      <p class="clasificacion" style="--color:${COLORES[r.clasificacion]}">${ETIQUETAS[r.clasificacion]}</p>
      <div class="escala">
        ${tramosEscala(r.edadDias).map((t) => `<span style="flex:${t.hasta - t.desde};background:${COLORES[t.clasificacion]}" title="${ETIQUETAS[t.clasificacion]}"></span>`).join('')}
        <i class="marcador" style="left:${posicion}%"></i>
      </div>
      <div class="escala-numeros">${[-4, -3, -2, -1, 0, 1, 2, 3, 4].map((n) => `<span>${n > 0 ? '+' : ''}${n}</span>`).join('')}</div>
      ${v.advertencias.map((a) => `<p class="advertencia">⚠ ${escaparHTML(a)}</p>`).join('')}`;
  }

  function renderSugerencias() {
    const lista = ninoSeleccionado ? [] : buscarNinosPorNombre(store.obtenerDatos(), campos.nombre.value).slice(0, 8);
    sugerencias.innerHTML = lista
      .map((n) => `<li><button type="button" data-id="${n.id}">${escaparHTML(n.nombre)} <small>${formatearFecha(n.fechaNacimiento)}</small></button></li>`)
      .join('');
    sugerencias.hidden = lista.length === 0;
  }

  function seleccionarNino(nino) {
    ninoSeleccionado = nino;
    campos.nombre.value = nino.nombre;
    campos.fechaNacimiento.value = nino.fechaNacimiento;
    campos.fechaNacimiento.readOnly = true;
    form.querySelectorAll('[name="sexo"]').forEach((r) => {
      r.checked = r.value === nino.sexo;
      r.disabled = true;
    });
    $('.nino-registrado').hidden = false;
    sugerencias.hidden = true;
  }

  function soltarNino() {
    ninoSeleccionado = null;
    campos.fechaNacimiento.readOnly = false;
    form.querySelectorAll('[name="sexo"]').forEach((r) => { r.disabled = false; });
    $('.nino-registrado').hidden = true;
  }

  // Deja listo el formulario para el siguiente niño: conserva fecha, taller y grado.
  function limpiarParaSiguiente() {
    soltarNino();
    for (const nombre of ['nombre', 'fechaNacimiento', 'alturaCm', 'pesoKg']) campos[nombre].value = '';
    form.querySelectorAll('[name="sexo"]').forEach((r) => { r.checked = false; });
    mostrarErrores({});
    $('.error-general').textContent = '';
    sugerencias.hidden = true;
    renderResultado();
  }

  function salirDeEdicion() {
    medicionEditada = null;
    form.querySelector('[type="submit"]').textContent = 'Guardar medición';
    $('.cancelar-edicion').hidden = true;
    limpiarParaSiguiente();
  }

  function guardar() {
    $('.confirmacion').textContent = '';
    $('.error-general').textContent = '';
    const registro = leerRegistro();
    const v = validarRegistro(registro, hoyISO());
    mostrarErrores(v.errores);
    if (!v.valido) return;

    const datos = store.obtenerDatos();
    const nino = ninoSeleccionado ?? buscarNinoPorClave(datos, registro.nombre, registro.fechaNacimiento);
    if (nino && nino.sexo !== registro.sexo) {
      mostrarErrores({ sexo: `${nino.nombre} ya está registrado como ${nino.sexo === 'F' ? 'niña' : 'niño'}` });
      return;
    }
    const { fecha, pesoKg, alturaCm, taller, grado } = registro;
    const medicion = { fecha, pesoKg, alturaCm, taller, grado };

    try {
      if (medicionEditada) {
        store.modificar((d) => actualizarMedicion(d, medicionEditada, medicion));
        salirDeEdicion();
        location.hash = `#ninos?nino=${nino.id}`;
        return;
      }
      if (nino && buscarMedicion(datos, nino.id, fecha)
        && !confirm(`${nino.nombre} ya tiene una medición el ${formatearFecha(fecha)}. ¿Reemplazarla?`)) {
        return;
      }
      store.modificar((d) => {
        const ninoId = nino?.id
          ?? agregarNino(d, { nombre: registro.nombre, fechaNacimiento: registro.fechaNacimiento, sexo: registro.sexo }).id;
        guardarMedicion(d, { ninoId, ...medicion });
      });
    } catch (error) {
      $('.error-general').textContent = error.message;
      return;
    }
    const r = v.resultado;
    $('.confirmacion').textContent =
      `Guardado: ${limpiarNombre(registro.nombre)} — ${ETIQUETAS[r.clasificacion]} (IMC ${r.imc.toFixed(1)}).`;
    limpiarParaSiguiente();
    campos.nombre.focus();
  }

  campos.nombre.addEventListener('input', () => {
    if (ninoSeleccionado) {
      soltarNino();
      campos.fechaNacimiento.value = '';
      form.querySelectorAll('[name="sexo"]').forEach((r) => { r.checked = false; });
    }
    renderSugerencias();
  });
  sugerencias.addEventListener('click', (ev) => {
    const boton = ev.target.closest('button[data-id]');
    if (!boton) return;
    seleccionarNino(obtenerNino(store.obtenerDatos(), boton.dataset.id));
    renderResultado();
    campos.alturaCm.focus();
  });
  document.addEventListener('click', (ev) => {
    if (!ev.target.closest('.campo-nombre')) sugerencias.hidden = true;
  });
  form.addEventListener('change', (ev) => {
    if (ev.target.name === 'taller') renderGrados();
    renderResultado();
  });
  form.addEventListener('input', renderResultado);
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    guardar();
  });
  $('.cancelar-edicion').addEventListener('click', () => {
    const id = ninoSeleccionado?.id;
    salirDeEdicion();
    location.hash = id ? `#ninos?nino=${id}` : '#ninos';
  });

  campos.fecha.value = hoyISO();
  renderGrados();
  renderResultado();

  return {
    // params: { nino?: id } para capturar a un niño, { medicion?: id } para editar una medición.
    mostrar({ nino: ninoId, medicion: medicionId } = {}) {
      const datos = store.obtenerDatos();
      const medicion = medicionId && datos.mediciones.find((m) => m.id === medicionId);
      const ninoDeMedicion = medicion && obtenerNino(datos, medicion.ninoId);
      if (medicion && ninoDeMedicion) {
        limpiarParaSiguiente();
        medicionEditada = medicion.id;
        seleccionarNino(ninoDeMedicion);
        campos.fecha.value = medicion.fecha;
        campos.alturaCm.value = medicion.alturaCm;
        campos.pesoKg.value = medicion.pesoKg;
        form.querySelectorAll('[name="taller"]').forEach((r) => { r.checked = r.value === medicion.taller; });
        renderGrados(medicion.grado);
        form.querySelector('[type="submit"]').textContent = 'Guardar cambios';
        $('.cancelar-edicion').hidden = false;
        renderResultado();
        return;
      }
      if (medicionEditada) salirDeEdicion();
      const nino = ninoId && obtenerNino(datos, ninoId);
      if (nino) {
        soltarNino();
        seleccionarNino(nino);
        renderResultado();
        campos.alturaCm.focus();
      }
    },
  };
}
```

- [ ] **Step 6: Escribir `js/app.js` (por ahora solo con Captura)**

```js
// Arranque de la app y navegación por pestañas con el hash de la URL (#vista?param=valor).
import { cargar } from './store.js';
import { crearVistaCaptura } from './views/captura.js';

const CREADORES = {
  captura: crearVistaCaptura,
};
const vistas = {};

function leerHash() {
  const [nombre, consulta = ''] = location.hash.slice(1).split('?');
  return {
    nombre: CREADORES[nombre] ? nombre : 'captura',
    params: Object.fromEntries(new URLSearchParams(consulta)),
  };
}

function mostrarVista() {
  const { nombre, params } = leerHash();
  for (const clave of Object.keys(CREADORES)) {
    document.getElementById(`vista-${clave}`).hidden = clave !== nombre;
    document.querySelector(`[data-vista="${clave}"]`).classList.toggle('activa', clave === nombre);
  }
  vistas[nombre] ??= CREADORES[nombre](document.getElementById(`vista-${nombre}`));
  vistas[nombre].mostrar(params);
}

const estado = cargar();
if (!estado.ok) {
  const aviso = document.getElementById('aviso-global');
  aviso.textContent = estado.error;
  aviso.hidden = false;
}
window.addEventListener('hashchange', mostrarVista);
mostrarVista();
```

- [ ] **Step 7: Revisar la sintaxis y que la lógica siga en verde**

Run: `for f in js/*.js js/views/*.js; do node --check "$f" || echo "FALLA $f"; done && npm test`
Expected: ninguna línea `FALLA` y las 81 pruebas en PASS.

- [ ] **Step 8: Verificar en el navegador**

Run: `python3 -m http.server 8000` y abrir `http://localhost:8000/#captura`. Los módulos ES no funcionan con `file://`.

Comprobar:
1. La consola no muestra errores y la pestaña "Captura" aparece activa.
2. Captura de un niño nuevo: nombre "Sofía López García", nacimiento 12/05/2019, Niña, medición 15/09/2026, Taller II. Aparecen solo los grados 4°, 5° y 6°; elegir 5°, altura 125 y peso 29. El panel derecho muestra "7 años 4 meses", IMC 18.6, Z +1.48, percentil ≈ 93.1, "Sobrepeso" y el marcador entre +1 y +2.
3. "Guardar medición" muestra "Guardado: Sofía López García — Sobrepeso (IMC 18.6)". Se limpian nombre, nacimiento, sexo, altura y peso; se conservan fecha, taller y grado.
4. Escribir "sofia" muestra la sugerencia "Sofía López García 12/05/2019". Al elegirla, el nacimiento y el sexo quedan bloqueados.
5. Guardar otra vez con la misma fecha pide confirmación para reemplazar.
6. Guardar vacío muestra un error debajo de cada campo. Una altura de 12.5 muestra "Altura fuera de rango (70–200 cm)".
7. En DevTools → Application → Local Storage, la clave `imc-calculator` contiene el JSON con 1 niño y 1 medición.

- [ ] **Step 9: Commit**

```bash
git add index.html css/styles.css js/app.js js/views/dom.js js/views/graficas.js js/views/captura.js
git commit -m "Agregar estructura de la página y vista de Captura"
```

---

### Task 11: Vista Niños (lista, ficha e historial)

**Files:**
- Create: `js/views/ninos.js`
- Modify: `js/app.js` (registrar la vista)

**Interfaces:**
- Consumes: `store` (Task 7); `medicionesDe`, `obtenerNino`, `actualizarNino`, `eliminarNino`, `eliminarMedicion` (Task 6); `evaluarSeguro`, `ETIQUETAS`, `tramosEscala` (Task 3); `TALLERES`, `obtenerTaller`, `etiquetaTallerGrado` (Task 4); `hoyISO`, `formatearFecha`, `formatearEdadCorta`, `edadCalendario`, `esFechaValida` (Task 1); `normalizarTexto`, `limpiarNombre` (Task 4); `escaparHTML` (Task 10); `COLORES`, `AVISO_SIN_GRAFICAS`, `chartDisponible`, `lineaZ` (Task 10).
- Produces: `crearVistaNinos(contenedor)`. `mostrar({ nino })` abre la ficha de ese niño. Navega a `#captura?nino=<id>` (nueva medición) y a `#captura?medicion=<id>` (editar medición).

- [ ] **Step 1: Escribir `js/views/ninos.js`**

```js
// Vista Niños: lista con búsqueda y filtros + ficha con historial.
import * as store from '../store.js';
import { medicionesDe, obtenerNino, actualizarNino, eliminarNino, eliminarMedicion } from '../datos.js';
import { evaluarSeguro, ETIQUETAS, tramosEscala } from '../imc.js';
import { TALLERES, obtenerTaller, etiquetaTallerGrado } from '../talleres.js';
import { hoyISO, formatearFecha, formatearEdadCorta, edadCalendario, esFechaValida } from '../fechas.js';
import { normalizarTexto, limpiarNombre } from '../normalizar.js';
import { escaparHTML } from './dom.js';
import { COLORES, AVISO_SIN_GRAFICAS, chartDisponible, lineaZ } from './graficas.js';

const HTML = `
<div class="ninos">
  <section class="tarjeta lista">
    <input type="search" name="q" placeholder="Buscar por nombre" aria-label="Buscar por nombre">
    <div class="filtros">
      <label>Taller
        <select name="taller">
          <option value="">Todos</option>
          ${TALLERES.map((t) => `<option value="${t.clave}">${t.nombre}</option>`).join('')}
        </select>
      </label>
      <label>Grado <select name="grado" disabled><option value="">Todos</option></select></label>
    </div>
    <div class="tabla-scroll">
      <table class="tabla">
        <thead><tr><th>Nombre</th><th>Edad</th><th>Taller · grado</th><th>Última clasificación</th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
    <p class="nota vacio" hidden>No hay niños que coincidan.</p>
  </section>
  <section class="tarjeta ficha"></section>
</div>`;

const clasificacionHTML = (r) =>
  (r ? `<span class="punto" style="--color:${COLORES[r.clasificacion]}"></span>${ETIQUETAS[r.clasificacion]}` : '—');

const encabezadoHTML = (n) => `
  <div class="ficha-encabezado">
    <div>
      <h2>${escaparHTML(n.nombre)}</h2>
      <p>${n.sexo === 'F' ? 'Niña' : 'Niño'} · Nac. ${formatearFecha(n.fechaNacimiento)}</p>
    </div>
    <div class="acciones">
      <button type="button" data-editar-nino>Editar datos</button>
      <button type="button" class="peligro" data-eliminar-nino>Eliminar niño</button>
    </div>
  </div>`;

const edicionHTML = (n) => `
  <form class="editar-nino">
    <label>Nombre completo <input name="nombre" value="${escaparHTML(n.nombre)}"></label>
    <label>Fecha de nacimiento <input name="fechaNacimiento" type="date" value="${n.fechaNacimiento}"></label>
    <fieldset>
      <legend>Sexo</legend>
      <div class="opciones">
        <label><input type="radio" name="sexo" value="F"${n.sexo === 'F' ? ' checked' : ''}> Niña</label>
        <label><input type="radio" name="sexo" value="M"${n.sexo === 'M' ? ' checked' : ''}> Niño</label>
      </div>
    </fieldset>
    <div class="acciones">
      <button type="submit" class="primario">Guardar</button>
      <button type="button" data-cancelar-edicion>Cancelar</button>
    </div>
  </form>`;

export function crearVistaNinos(contenedor) {
  contenedor.innerHTML = HTML;
  const $ = (selector) => contenedor.querySelector(selector);
  const ficha = $('.ficha');
  let seleccionado = null;
  let editando = false;
  let grafica = null;

  function renderGradosFiltro() {
    const taller = obtenerTaller($('[name="taller"]').value);
    const select = $('[name="grado"]');
    select.disabled = !taller;
    select.innerHTML = '<option value="">Todos</option>'
      + (taller ? taller.grados.map((g) => `<option value="${g}">${g}°</option>`).join('') : '');
  }

  function renderLista() {
    const datos = store.obtenerDatos();
    const q = normalizarTexto($('[name="q"]').value);
    const taller = $('[name="taller"]').value;
    const grado = $('[name="grado"]').value ? Number($('[name="grado"]').value) : null;
    const hoy = hoyISO();
    const filas = datos.ninos
      .map((n) => {
        const ultima = medicionesDe(datos, n.id)[0] ?? null;
        return { n, ultima, r: ultima ? evaluarSeguro(n, ultima) : null };
      })
      .filter(({ n, ultima }) => (!q || normalizarTexto(n.nombre).includes(q))
        && (!taller || (ultima?.taller === taller && (grado == null || ultima.grado === grado))))
      .sort((a, b) => a.n.nombre.localeCompare(b.n.nombre, 'es'));
    $('tbody').innerHTML = filas.map(({ n, ultima, r }) => `
      <tr data-id="${n.id}" tabindex="0"${n.id === seleccionado ? ' class="seleccionada"' : ''}>
        <td>${escaparHTML(n.nombre)}</td>
        <td>${n.fechaNacimiento <= hoy ? formatearEdadCorta(edadCalendario(n.fechaNacimiento, hoy)) : '—'}</td>
        <td>${ultima ? etiquetaTallerGrado(ultima.taller, ultima.grado) : '—'}</td>
        <td>${clasificacionHTML(r)}</td>
      </tr>`).join('');
    $('.vacio').hidden = filas.length > 0;
  }

  function renderFicha() {
    grafica?.destroy();
    grafica = null;
    const datos = store.obtenerDatos();
    const nino = seleccionado ? obtenerNino(datos, seleccionado) : null;
    if (!nino) {
      seleccionado = null;
      ficha.innerHTML = '<p class="nota">Elige un niño de la lista para ver su historial.</p>';
      return;
    }
    const filas = medicionesDe(datos, nino.id).map((m) => ({ m, r: evaluarSeguro(nino, m) }));
    const conResultado = filas.filter((f) => f.r).reverse(); // orden cronológico para la gráfica
    ficha.innerHTML = `
      ${editando ? edicionHTML(nino) : encabezadoHTML(nino)}
      <p class="error-general" role="alert"></p>
      <h3>Puntaje Z en el tiempo</h3>
      <div class="grafica">${conResultado.length ? '<canvas></canvas>' : '<p class="nota">Sin mediciones todavía.</p>'}</div>
      <div class="tabla-scroll">
        <table class="tabla">
          <thead><tr><th>Fecha</th><th>Ciclo</th><th>Taller · grado</th><th>Altura</th><th>Peso</th><th>IMC</th><th>Z</th><th>Clasificación</th><th></th></tr></thead>
          <tbody>${filas.map(({ m, r }) => `
            <tr>
              <td>${formatearFecha(m.fecha)}</td>
              <td>${r?.ciclo ?? '—'}</td>
              <td>${etiquetaTallerGrado(m.taller, m.grado)}</td>
              <td>${m.alturaCm}</td>
              <td>${m.pesoKg}</td>
              <td>${r ? r.imc.toFixed(1) : '—'}</td>
              <td>${r ? r.z.toFixed(2) : '—'}</td>
              <td>${clasificacionHTML(r)}</td>
              <td class="acciones-fila">
                <button type="button" data-editar-medicion="${m.id}" title="Editar medición" aria-label="Editar medición">✎</button>
                <button type="button" data-borrar-medicion="${m.id}" class="peligro" title="Borrar medición" aria-label="Borrar medición">✕</button>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div class="acciones"><button type="button" class="primario" data-nueva-medicion>+ Nueva medición</button></div>`;
    if (!conResultado.length) return;
    if (!chartDisponible()) {
      ficha.querySelector('.grafica').innerHTML = AVISO_SIN_GRAFICAS;
      return;
    }
    grafica = lineaZ(
      ficha.querySelector('canvas'),
      conResultado.map(({ m, r }) => ({ etiqueta: formatearFecha(m.fecha), z: r.z, clasificacion: r.clasificacion })),
      tramosEscala(conResultado.at(-1).r.edadDias),
    );
  }

  function seleccionar(id) {
    seleccionado = id;
    editando = false;
    renderLista();
    renderFicha();
  }

  // Ejecuta un cambio en los datos; si falla, muestra el error en la ficha.
  function ejecutar(accion, despues = () => {}) {
    try {
      accion();
    } catch (error) {
      ficha.querySelector('.error-general').textContent = error.message;
      return;
    }
    despues();
    renderLista();
    renderFicha();
  }

  $('.lista').addEventListener('input', (ev) => {
    if (ev.target.name === 'taller') renderGradosFiltro();
    renderLista();
  });
  $('tbody').addEventListener('click', (ev) => {
    const fila = ev.target.closest('tr[data-id]');
    if (fila) seleccionar(fila.dataset.id);
  });
  $('tbody').addEventListener('keydown', (ev) => {
    const fila = ev.target.closest('tr[data-id]');
    if (fila && ev.key === 'Enter') seleccionar(fila.dataset.id);
  });

  ficha.addEventListener('click', (ev) => {
    const boton = ev.target.closest('button');
    if (!boton) return;
    const datos = store.obtenerDatos();
    const nino = obtenerNino(datos, seleccionado);
    if (boton.hasAttribute('data-editar-nino')) {
      editando = true;
      renderFicha();
    } else if (boton.hasAttribute('data-cancelar-edicion')) {
      editando = false;
      renderFicha();
    } else if (boton.hasAttribute('data-eliminar-nino')) {
      const total = medicionesDe(datos, nino.id).length;
      if (!confirm(`¿Eliminar a ${nino.nombre} y sus ${total} mediciones? No se puede deshacer.`)) return;
      ejecutar(() => store.modificar((d) => eliminarNino(d, nino.id)), () => { seleccionado = null; });
    } else if (boton.dataset.borrarMedicion) {
      if (!confirm('¿Borrar esta medición? No se puede deshacer.')) return;
      ejecutar(() => store.modificar((d) => eliminarMedicion(d, boton.dataset.borrarMedicion)));
    } else if (boton.dataset.editarMedicion) {
      location.hash = `#captura?medicion=${boton.dataset.editarMedicion}`;
    } else if (boton.hasAttribute('data-nueva-medicion')) {
      location.hash = `#captura?nino=${nino.id}`;
    }
  });

  ficha.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const f = ev.target;
    const nombre = limpiarNombre(f.elements.nombre.value);
    const fechaNacimiento = f.elements.fechaNacimiento.value;
    const sexo = f.querySelector('[name="sexo"]:checked')?.value;
    if (!nombre || !esFechaValida(fechaNacimiento) || !sexo) {
      ficha.querySelector('.error-general').textContent = 'Completa nombre, fecha de nacimiento y sexo.';
      return;
    }
    ejecutar(
      () => store.modificar((d) => actualizarNino(d, seleccionado, { nombre, fechaNacimiento, sexo })),
      () => { editando = false; },
    );
  });

  return {
    // params: { nino?: id } abre la ficha de ese niño.
    mostrar({ nino } = {}) {
      if (nino) {
        seleccionado = nino;
        editando = false;
      }
      renderLista();
      renderFicha();
    },
  };
}
```

- [ ] **Step 2: Registrar la vista en `js/app.js`**

Agregar el import debajo del de Captura:

```js
import { crearVistaNinos } from './views/ninos.js';
```

y la entrada en `CREADORES`:

```js
const CREADORES = {
  captura: crearVistaCaptura,
  ninos: crearVistaNinos,
};
```

- [ ] **Step 3: Revisar la sintaxis**

Run: `node --check js/views/ninos.js && node --check js/app.js && npm test`
Expected: sin errores y las pruebas en PASS.

- [ ] **Step 4: Verificar en el navegador**

Con `python3 -m http.server 8000` y los datos de la Task 10, capturar antes una segunda medición de Sofía: 12/03/2026, Taller II 4°, 121 cm, 25.1 kg. Luego abrir `http://localhost:8000/#ninos` y comprobar:
1. La lista muestra a Sofía con la edad en formato "7a 4m" sin partirse, "T-II · 5°" y el punto amarillo "Sobrepeso".
2. Los filtros funcionan: con Taller "Taller I" la lista queda vacía ("No hay niños que coincidan."); con Taller II, el grado se habilita con 4°, 5° y 6°.
3. Al hacer clic en Sofía se ve la gráfica de Z con franjas de color, dos puntos y la tabla con ciclo, taller·grado, IMC, Z y clasificación.
4. "✎" abre Captura en modo "Guardar cambios". Al cambiar el peso y guardar, regresa a la ficha con el valor nuevo.
5. "✕" pide confirmación y borra la medición. "+ Nueva medición" abre Captura con Sofía preseleccionada.
6. "Editar datos": cambiar el nacimiento a 01/01/2024 muestra "Con esa fecha de nacimiento alguna medición queda fuera de 3 a 15 años"; "Cancelar" regresa.
7. "Eliminar niño" pide confirmación con el número de mediciones y lo quita de la lista.

- [ ] **Step 5: Commit**

```bash
git add js/views/ninos.js js/app.js
git commit -m "Agregar vista de Niños con ficha e historial"
```

---

### Task 12: Vista Estadísticas

**Files:**
- Create: `js/views/estadisticas.js`
- Modify: `js/app.js` (registrar la vista)

**Interfaces:**
- Consumes: `store` (Task 7); `evaluarTodo`, `ciclosDisponibles`, `comparacionTalleres`, `evolucion` (Task 8); `CLASIFICACIONES`, `ETIQUETAS` (Task 3); `TALLERES`, `obtenerTaller` (Task 4); `COLORES`, `AVISO_SIN_GRAFICAS`, `chartDisponible`, `barrasApiladas` (Task 10).
- Produces: `crearVistaEstadisticas(contenedor)`. `mostrar()` recalcula todo con los datos actuales.

- [ ] **Step 1: Escribir `js/views/estadisticas.js`**

```js
// Vista Estadísticas: comparación entre talleres y evolución dentro del ciclo.
import * as store from '../store.js';
import { evaluarTodo, ciclosDisponibles, comparacionTalleres, evolucion } from '../estadisticas.js';
import { CLASIFICACIONES, ETIQUETAS } from '../imc.js';
import { TALLERES, obtenerTaller } from '../talleres.js';
import { COLORES, AVISO_SIN_GRAFICAS, chartDisponible, barrasApiladas } from './graficas.js';

const HTML = `
<div class="estadisticas">
  <form class="tarjeta filtros">
    <label>Ciclo escolar <select name="ciclo"></select></label>
    <label>Taller
      <select name="taller">
        <option value="">Todos</option>
        ${TALLERES.map((t) => `<option value="${t.clave}">${t.nombre}</option>`).join('')}
      </select>
    </label>
    <label>Grado <select name="grado" disabled><option value="">Todos</option></select></label>
    <fieldset>
      <legend>Medición</legend>
      <div class="opciones">
        <label><input type="radio" name="cual" value="primera"> Primera</label>
        <label><input type="radio" name="cual" value="ultima" checked> Última</label>
      </div>
    </fieldset>
  </form>
  <div class="contenido"></div>
</div>`;

const cambio = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');

const bloqueEvolucionHTML = (t, i) => `
  <div class="evolucion">
    <h3>${t.nombre} <small class="nota">(${t.ninos} ${t.ninos === 1 ? 'niño' : 'niños'})</small></h3>
    <div class="evolucion-cuerpo">
      <div class="grafica" style="height:150px"><canvas data-grafica="evolucion-${i}"></canvas></div>
      <table class="tabla">
        <thead><tr><th>Clasificación</th><th>Primera</th><th>Última</th><th>Cambio</th></tr></thead>
        <tbody>${CLASIFICACIONES.map((c) => `
          <tr>
            <td><span class="punto" style="--color:${COLORES[c]}"></span>${ETIQUETAS[c]}</td>
            <td>${t.primera[c]}</td>
            <td>${t.ultima[c]}</td>
            <td>${cambio(t.ultima[c] - t.primera[c])}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>`;

export function crearVistaEstadisticas(contenedor) {
  contenedor.innerHTML = HTML;
  const form = contenedor.querySelector('.filtros');
  const contenido = contenedor.querySelector('.contenido');
  let items = [];
  let graficas = [];

  function renderCiclos() {
    const ciclos = ciclosDisponibles(items);
    const select = form.elements.ciclo;
    const actual = select.value;
    select.innerHTML = ciclos.map((c) => `<option value="${c}">${c}</option>`).join('');
    if (ciclos.includes(actual)) select.value = actual;
  }

  function renderGrados() {
    const taller = obtenerTaller(form.elements.taller.value);
    const select = form.elements.grado;
    select.disabled = !taller;
    select.innerHTML = '<option value="">Todos</option>'
      + (taller ? taller.grados.map((g) => `<option value="${g}">${g}°</option>`).join('') : '');
  }

  function leerFiltros() {
    return {
      ciclo: form.elements.ciclo.value,
      taller: form.elements.taller.value || null,
      grado: form.elements.grado.value ? Number(form.elements.grado.value) : null,
      cual: form.querySelector('[name="cual"]:checked').value,
    };
  }

  function render() {
    graficas.forEach((g) => g.destroy());
    graficas = [];
    const filtros = leerFiltros();
    if (!filtros.ciclo) {
      contenido.innerHTML = '<p class="tarjeta nota">Todavía no hay mediciones.</p>';
      return;
    }
    const comparacion = comparacionTalleres(items, filtros).filter((t) => t.conteo.total > 0);
    const evol = evolucion(items, filtros).filter((t) => t.ninos > 0);
    contenido.innerHTML = `
      <section class="tarjeta">
        <h2>Comparación entre talleres</h2>
        <p class="nota">${filtros.cual === 'ultima' ? 'Última' : 'Primera'} medición de cada niño en el ciclo ${filtros.ciclo}.</p>
        ${comparacion.length
          ? `<div class="grafica" style="height:${90 + comparacion.length * 50}px"><canvas data-grafica="comparacion"></canvas></div>`
          : '<p class="nota">No hay mediciones para estos filtros.</p>'}
      </section>
      <section class="tarjeta">
        <h2>Evolución en el ciclo (primera vs. última)</h2>
        <p class="nota">Solo niños con 2 o más mediciones en el ciclo; cuentan en el taller y grado de su última medición.</p>
        ${evol.length
          ? evol.map(bloqueEvolucionHTML).join('')
          : '<p class="nota">No hay niños con 2 o más mediciones para estos filtros.</p>'}
      </section>`;
    if (!chartDisponible()) {
      contenido.querySelectorAll('.grafica').forEach((g) => {
        g.innerHTML = AVISO_SIN_GRAFICAS;
        g.style.height = 'auto';
      });
      return;
    }
    if (comparacion.length) {
      graficas.push(barrasApiladas(
        contenido.querySelector('[data-grafica="comparacion"]'),
        comparacion.map((t) => ({ etiqueta: `${t.nombre} (${t.conteo.total})`, conteo: t.conteo })),
      ));
    }
    evol.forEach((t, i) => {
      graficas.push(barrasApiladas(
        contenido.querySelector(`[data-grafica="evolucion-${i}"]`),
        [{ etiqueta: 'Primera', conteo: t.primera }, { etiqueta: 'Última', conteo: t.ultima }],
      ));
    });
  }

  form.addEventListener('input', (ev) => {
    if (ev.target.name === 'taller') renderGrados();
    render();
  });

  return {
    mostrar() {
      items = evaluarTodo(store.obtenerDatos());
      renderCiclos();
      render();
    },
  };
}
```

- [ ] **Step 2: Registrar la vista en `js/app.js`**

Agregar el import:

```js
import { crearVistaEstadisticas } from './views/estadisticas.js';
```

y la entrada:

```js
const CREADORES = {
  captura: crearVistaCaptura,
  ninos: crearVistaNinos,
  estadisticas: crearVistaEstadisticas,
};
```

- [ ] **Step 3: Revisar la sintaxis**

Run: `node --check js/views/estadisticas.js && node --check js/app.js && npm test`
Expected: sin errores y las pruebas en PASS.

- [ ] **Step 4: Verificar en el navegador**

Capturar al menos 3 niños en talleres distintos. Dos de ellos deben tener dos mediciones en el mismo ciclo (por ejemplo 15/09/2026 y una fecha posterior o igual a hoy). Abrir `#estadisticas` y comprobar:
1. El ciclo por defecto es el más reciente con datos.
2. La gráfica "Comparación entre talleres" muestra una barra al 100% por taller con datos, con el número de niños en la etiqueta y la leyenda Delgadez, Normal, Sobrepeso y Obesidad. El tooltip dice "Normal: 50% (1)".
3. "Primera"/"Última" cambia la gráfica.
4. Con Taller elegido, el filtro de grado se habilita y la gráfica muestra solo ese taller.
5. "Evolución en el ciclo" muestra un bloque por taller con niños de 2 o más mediciones, con su gráfica Primera/Última y la tabla con la columna Cambio ("+1", "−1", "0").
6. Sin mediciones aparece "Todavía no hay mediciones."

- [ ] **Step 5: Commit**

```bash
git add js/views/estadisticas.js js/app.js
git commit -m "Agregar vista de Estadísticas por taller y ciclo"
```

---

### Task 13: Vista Datos (CSV y respaldo)

**Files:**
- Create: `js/views/datos.js`
- Modify: `js/app.js` (registrar la vista)

**Interfaces:**
- Consumes: `store` (Task 7); `analizarImportacion`, `aplicarImportacion`, `generarCSVExportacion`, `PLANTILLA_CSV`, `COLUMNAS` (Task 9); `generarRespaldo`, `leerRespaldo` (Task 7); `hoyISO` (Task 1); `escaparHTML`, `descargar` (Task 10).
- Produces: `crearVistaDatos(contenedor)`. Al restaurar un respaldo oculta `#aviso-global`.

- [ ] **Step 1: Escribir `js/views/datos.js`**

```js
// Vista Datos: importar CSV con vista previa, exportar CSV y respaldo JSON.
import * as store from '../store.js';
import { analizarImportacion, aplicarImportacion, generarCSVExportacion, PLANTILLA_CSV, COLUMNAS } from '../csv.js';
import { generarRespaldo, leerRespaldo } from '../respaldo.js';
import { hoyISO } from '../fechas.js';
import { escaparHTML, descargar } from './dom.js';

const HTML = `
<div class="datos">
  <section class="tarjeta">
    <h2>Importar CSV</h2>
    <p class="nota">Una fila por medición. Columnas: ${COLUMNAS.join(', ')}.</p>
    <div class="acciones">
      <label class="boton">Elegir archivo… <input type="file" accept=".csv,text/csv" data-importar-csv hidden></label>
      <button type="button" data-plantilla>Descargar plantilla CSV</button>
    </div>
    <div class="vista-previa"></div>
  </section>
  <div class="fila">
    <section class="tarjeta">
      <h2>Exportar CSV</h2>
      <p class="nota">Todas las mediciones con edad, ciclo, IMC, puntaje Z, percentil y clasificación. Se abre en Excel.</p>
      <button type="button" class="primario" data-exportar-csv>Descargar CSV</button>
    </section>
    <section class="tarjeta">
      <h2>Respaldo JSON</h2>
      <p class="nota conteo"></p>
      <div class="acciones">
        <button type="button" class="primario" data-respaldo>Descargar respaldo</button>
        <label class="boton">Restaurar respaldo… <input type="file" accept=".json,application/json" data-restaurar hidden></label>
      </div>
      <p class="nota">Restaurar reemplaza todos los datos actuales.</p>
      <p class="mensaje-respaldo" role="status"></p>
    </section>
  </div>
</div>`;

export function crearVistaDatos(contenedor) {
  contenedor.innerHTML = HTML;
  const $ = (selector) => contenedor.querySelector(selector);
  const previa = $('.vista-previa');
  let analisis = null;

  function renderConteo() {
    const d = store.obtenerDatos();
    $('.conteo').textContent = `${d.ninos.length} niños · ${d.mediciones.length} mediciones`;
  }

  function renderVistaPrevia(nombreArchivo) {
    if (analisis.error) {
      previa.innerHTML = `<p class="caja error">${escaparHTML(analisis.error)}</p>`;
      return;
    }
    const { resumen, errores } = analisis;
    previa.innerHTML = `
      <p class="nota">${escaparHTML(nombreArchivo)}: vista previa, todavía no se guarda nada.</p>
      <p class="caja ok">✓ <strong>${resumen.validas} filas válidas</strong>:
        ${resumen.ninosNuevos} niños nuevos · ${resumen.medicionesNuevas} mediciones nuevas ·
        ${resumen.reemplazos} reemplazan una medición existente</p>
      ${errores.length ? `
        <div class="caja error">✗ <strong>${errores.length} filas con error</strong> (no se importan):
          <ul>${errores.map((e) => `<li>Fila ${e.fila}: ${escaparHTML(e.mensaje)}</li>`).join('')}</ul>
        </div>` : ''}
      <div class="acciones">
        <button type="button" class="primario" data-confirmar-importacion${resumen.validas ? '' : ' disabled'}>Importar ${resumen.validas} filas válidas</button>
        <button type="button" data-cancelar-importacion>Cancelar</button>
      </div>`;
  }

  async function alElegirCSV(input) {
    const archivo = input.files[0];
    input.value = '';
    if (!archivo) return;
    analisis = analizarImportacion(await archivo.text(), store.obtenerDatos(), hoyISO());
    renderVistaPrevia(archivo.name);
  }

  function confirmarImportacion() {
    try {
      store.modificar((d) => aplicarImportacion(d, analisis.validas));
    } catch (error) {
      previa.innerHTML = `<p class="caja error">${escaparHTML(error.message)}</p>`;
      return;
    }
    previa.innerHTML = `<p class="caja ok">Se importaron ${analisis.validas.length} mediciones.</p>`;
    analisis = null;
    renderConteo();
  }

  async function alElegirRespaldo(input) {
    const archivo = input.files[0];
    input.value = '';
    if (!archivo) return;
    const mensaje = $('.mensaje-respaldo');
    const r = leerRespaldo(await archivo.text());
    if (!r.valido) {
      mensaje.textContent = `No se restauró: ${r.error}.`;
      return;
    }
    const actual = store.obtenerDatos();
    const pregunta = `Se reemplazarán ${actual.ninos.length} niños y ${actual.mediciones.length} mediciones `
      + `por los del archivo: ${r.datos.ninos.length} niños y ${r.datos.mediciones.length} mediciones. ¿Continuar?`;
    if (!confirm(pregunta)) return;
    try {
      store.reemplazarTodo(r.datos);
    } catch (error) {
      mensaje.textContent = error.message;
      return;
    }
    document.getElementById('aviso-global').hidden = true;
    mensaje.textContent = 'Respaldo restaurado.';
    renderConteo();
  }

  contenedor.addEventListener('change', (ev) => {
    if (ev.target.matches('[data-importar-csv]')) alElegirCSV(ev.target);
    if (ev.target.matches('[data-restaurar]')) alElegirRespaldo(ev.target);
  });

  contenedor.addEventListener('click', (ev) => {
    const boton = ev.target.closest('button');
    if (!boton) return;
    const hoy = hoyISO();
    if (boton.hasAttribute('data-plantilla')) {
      descargar('imc-plantilla.csv', PLANTILLA_CSV, 'text/csv;charset=utf-8');
    } else if (boton.hasAttribute('data-exportar-csv')) {
      descargar(`imc-mediciones-${hoy}.csv`, generarCSVExportacion(store.obtenerDatos()), 'text/csv;charset=utf-8');
    } else if (boton.hasAttribute('data-respaldo')) {
      descargar(`imc-respaldo-${hoy}.json`, generarRespaldo(store.obtenerDatos()), 'application/json');
    } else if (boton.hasAttribute('data-confirmar-importacion')) {
      confirmarImportacion();
    } else if (boton.hasAttribute('data-cancelar-importacion')) {
      analisis = null;
      previa.innerHTML = '';
    }
  });

  return {
    mostrar() {
      renderConteo();
    },
  };
}
```

- [ ] **Step 2: Dejar `js/app.js` en su versión final**

```js
// Arranque de la app y navegación por pestañas con el hash de la URL (#vista?param=valor).
import { cargar } from './store.js';
import { crearVistaCaptura } from './views/captura.js';
import { crearVistaNinos } from './views/ninos.js';
import { crearVistaEstadisticas } from './views/estadisticas.js';
import { crearVistaDatos } from './views/datos.js';

const CREADORES = {
  captura: crearVistaCaptura,
  ninos: crearVistaNinos,
  estadisticas: crearVistaEstadisticas,
  datos: crearVistaDatos,
};
const vistas = {};

function leerHash() {
  const [nombre, consulta = ''] = location.hash.slice(1).split('?');
  return {
    nombre: CREADORES[nombre] ? nombre : 'captura',
    params: Object.fromEntries(new URLSearchParams(consulta)),
  };
}

function mostrarVista() {
  const { nombre, params } = leerHash();
  for (const clave of Object.keys(CREADORES)) {
    document.getElementById(`vista-${clave}`).hidden = clave !== nombre;
    document.querySelector(`[data-vista="${clave}"]`).classList.toggle('activa', clave === nombre);
  }
  vistas[nombre] ??= CREADORES[nombre](document.getElementById(`vista-${nombre}`));
  vistas[nombre].mostrar(params);
}

const estado = cargar();
if (!estado.ok) {
  const aviso = document.getElementById('aviso-global');
  aviso.textContent = estado.error;
  aviso.hidden = false;
}
window.addEventListener('hashchange', mostrarVista);
mostrarVista();
```

- [ ] **Step 3: Revisar la sintaxis**

Run: `for f in js/*.js js/views/*.js; do node --check "$f" || echo "FALLA $f"; done && npm test`
Expected: ninguna línea `FALLA` y las pruebas en PASS.

- [ ] **Step 4: Verificar en el navegador**

Abrir `#datos` y comprobar:
1. "Descargar plantilla CSV" baja `imc-plantilla.csv`. Al importarla, la vista previa dice "1 filas válidas: 1 niños nuevos · 1 mediciones nuevas · 0 reemplazan…" y "Importar 1 filas válidas" la guarda. El conteo del respaldo se actualiza.
2. Crear un CSV con una fila correcta, una con `T1,5` y otra con altura `12.5`. La vista previa lista "Fila 3: El grado 5° no pertenece a Taller I" y "Fila 4: Altura fuera de rango…", y solo importa la válida.
3. Abrir en Excel (o LibreOffice) el CSV de "Descargar CSV": los acentos y la ñ se ven bien y trae las columnas edad_meses, ciclo, imc, z, percentil y clasificacion.
4. "Descargar respaldo" baja `imc-respaldo-AAAA-MM-DD.json`. Borrar un niño, restaurar ese archivo, confirmar el mensaje "Se reemplazarán…" y el niño vuelve.
5. Restaurar un `.json` inválido muestra "No se restauró: …" y no cambia nada.
6. En DevTools, ejecutar `localStorage.setItem('imc-calculator', '{roto')` y recargar. Aparece el aviso amarillo de datos dañados, guardar en Captura falla con "Restaura un respaldo…", y restaurar un respaldo válido quita el aviso.

- [ ] **Step 5: Commit**

```bash
git add js/views/datos.js js/app.js
git commit -m "Agregar vista de Datos: importar/exportar CSV y respaldo JSON"
```

---

### Task 14: Verificación final y publicación en GitHub Pages

**Files:**
- Ninguno nuevo.

**Interfaces:**
- Consumes: toda la app.
- Produces: la app publicada.

- [ ] **Step 1: Correr todas las pruebas**

Run: `npm test`
Expected: PASS, 81 pruebas, 0 fallas.

- [ ] **Step 2: Recorrido completo en el navegador**

Con `python3 -m http.server 8000`:
1. Recorrer las cuatro pestañas sin errores en la consola.
2. Con el ancho de ventana en unos 700 px, Captura, Niños y la Evolución pasan a una sola columna y se pueden usar.
3. En DevTools → Network, bloquear `cdn.jsdelivr.net` y recargar. Captura y Datos funcionan; en Niños y Estadísticas aparece "No se pudo cargar la librería de gráficas…" en lugar de cada gráfica, y las tablas siguen visibles.

- [ ] **Step 3: Publicar (lo hace la persona usuaria)**

Crear el repositorio en GitHub, agregar el remoto y hacer `git push -u origin master`. Luego, en GitHub → Settings → Pages → "Deploy from a branch", elegir `master` y `/ (root)`. Abrir la URL publicada y repetir el punto 1 del Step 2.
