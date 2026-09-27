// Colores de clasificación y ayudantes de Chart.js (cargado desde el CDN como window.Chart).
import { ETIQUETAS } from '../imc.js';
import { GRUPOS_GRAFICA, porcentajesGrafica } from '../estadisticas.js';

export const COLORES = {
  'delgadez-severa': '#9a3412',
  delgadez: '#d97706',
  normal: '#16a34a',
  sobrepeso: '#eab308',
  obesidad: '#dc2626',
};

export const AVISO_SIN_GRAFICAS =
  '<p class="caja error">No se pudo cargar la librería de gráficas (¿sin internet?). Recarga la página cuando haya conexión.</p>';

export function chartDisponible() {
  return typeof window.Chart === 'function';
}

// Barras horizontales apiladas al 100%. filas: [{ etiqueta, conteo }] (conteo de estadisticas.contar).
export function barrasApiladas(canvas, filas) {
  const porFila = filas.map((f) => porcentajesGrafica(f.conteo));
  return new window.Chart(canvas, {
    type: 'bar',
    data: {
      labels: filas.map((f) => f.etiqueta),
      datasets: GRUPOS_GRAFICA.map((grupo, i) => ({
        label: ETIQUETAS[grupo],
        backgroundColor: COLORES[grupo],
        data: porFila.map((p) => p[i].pct),
        cantidades: porFila.map((p) => p[i].n),
      })),
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { stacked: true, min: 0, max: 100, ticks: { callback: (v) => `${v}%` } },
        y: { stacked: true },
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.x.toFixed(0)}% (${ctx.dataset.cantidades[ctx.dataIndex]})`,
          },
        },
      },
    },
  });
}

// Línea del puntaje Z en el tiempo con franjas de color por clasificación.
// puntos: [{ etiqueta, z, clasificacion }] en orden cronológico; tramos: imc.tramosEscala(...).
export function lineaZ(canvas, puntos, tramos) {
  const zs = puntos.map((p) => p.z);
  const franjas = {
    id: 'franjas',
    beforeDatasetsDraw(chart) {
      const { ctx, chartArea, scales: { y } } = chart;
      ctx.save();
      tramos.forEach((t, i) => {
        const desde = i === 0 ? y.min : Math.max(t.desde, y.min);
        const hasta = i === tramos.length - 1 ? y.max : Math.min(t.hasta, y.max);
        if (hasta <= desde) return;
        const arriba = y.getPixelForValue(hasta);
        ctx.fillStyle = `${COLORES[t.clasificacion]}26`;
        ctx.fillRect(chartArea.left, arriba, chartArea.right - chartArea.left, y.getPixelForValue(desde) - arriba);
      });
      ctx.restore();
    },
  };
  return new window.Chart(canvas, {
    type: 'line',
    data: {
      labels: puntos.map((p) => p.etiqueta),
      datasets: [{
        label: 'Puntaje Z',
        data: zs,
        borderColor: '#4f46e5',
        pointBackgroundColor: puntos.map((p) => COLORES[p.clasificacion]),
        pointRadius: 5,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          min: Math.min(-4, Math.floor(Math.min(...zs))),
          max: Math.max(4, Math.ceil(Math.max(...zs))),
          ticks: { stepSize: 1 },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: (ctx) => `Z ${ctx.parsed.y} · ${ETIQUETAS[puntos[ctx.dataIndex].clasificacion]}` },
        },
      },
    },
    plugins: [franjas],
  });
}
