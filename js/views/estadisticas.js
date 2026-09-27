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
