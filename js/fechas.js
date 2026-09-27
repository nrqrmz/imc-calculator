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
