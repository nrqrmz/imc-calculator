// Vista Datos: importar CSV con vista previa, exportar CSV y respaldo JSON.
import * as store from '../store.js';
import {
  analizarImportacion, aplicarImportacion, generarCSVExportacion, decodificarCSV, PLANTILLA_CSV, COLUMNAS,
} from '../csv.js';
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
    // Con datos dañados lo que hay en memoria está vacío: no se ofrece descargarlo.
    for (const boton of contenedor.querySelectorAll('[data-respaldo], [data-exportar-csv]')) {
      boton.disabled = store.estaBloqueado();
    }
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
    analisis = analizarImportacion(decodificarCSV(await archivo.arrayBuffer()), store.obtenerDatos(), hoyISO());
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
