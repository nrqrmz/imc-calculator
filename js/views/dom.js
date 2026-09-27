// Utilidades de DOM compartidas por las vistas.
import { mascaraFecha } from '../fechas.js';

const ENTIDADES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escaparHTML(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ENTIDADES[c]);
}

// Campo de texto para fechas DD/MM/AAAA: pone las diagonales mientras se teclea.
export function activarCampoFecha(input) {
  input.addEventListener('input', () => {
    const formateado = mascaraFecha(input.value);
    if (formateado !== input.value) input.value = formateado;
  });
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
