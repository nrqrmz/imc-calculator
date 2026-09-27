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
    campos.nombre.readOnly = false;
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
    // El niño elegido pudo borrarse o editarse en la pestaña Niños: se vuelve a buscar.
    const nino = ninoSeleccionado
      ? obtenerNino(datos, ninoSeleccionado.id)
      : buscarNinoPorClave(datos, registro.nombre, registro.fechaNacimiento);
    if (ninoSeleccionado && !nino) {
      limpiarParaSiguiente();
      $('.error-general').textContent = 'El niño elegido ya no existe; búscalo o captúralo de nuevo.';
      return;
    }
    if (nino && nino.sexo !== registro.sexo) {
      mostrarErrores({ sexo: `${nino.nombre} ya está registrado como ${nino.sexo === 'F' ? 'niña' : 'niño'}` });
      return;
    }
    const { fecha, pesoKg, alturaCm, taller, grado } = registro;
    const medicion = { fecha, pesoKg, alturaCm, taller, grado };

    try {
      if (medicionEditada) {
        const { ninoId } = datos.mediciones.find((m) => m.id === medicionEditada);
        store.modificar((d) => actualizarMedicion(d, medicionEditada, medicion));
        salirDeEdicion();
        location.hash = `#ninos?nino=${ninoId}`;
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
        campos.nombre.readOnly = true; // en edición no se cambia de niño
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
      } else if (ninoSeleccionado) {
        // Refleja cambios hechos en la pestaña Niños al niño que estaba elegido.
        const actual = obtenerNino(datos, ninoSeleccionado.id);
        if (actual) seleccionarNino(actual);
        else limpiarParaSiguiente();
        renderResultado();
      }
    },
  };
}
