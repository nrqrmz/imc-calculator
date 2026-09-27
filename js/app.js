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
