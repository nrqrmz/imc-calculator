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
