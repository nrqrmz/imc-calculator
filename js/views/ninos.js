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
