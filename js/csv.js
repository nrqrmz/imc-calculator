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
