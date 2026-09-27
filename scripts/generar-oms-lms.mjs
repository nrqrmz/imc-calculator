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
