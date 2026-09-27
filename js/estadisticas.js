// Agregaciones para la vista de Estadísticas.
import { evaluarSeguro, CLASIFICACIONES } from './imc.js';
import { TALLERES } from './talleres.js';

// En las gráficas, "delgadez severa" se suma a "delgadez".
export const GRUPOS_GRAFICA = ['delgadez', 'normal', 'sobrepeso', 'obesidad'];

// Todas las mediciones que se pueden evaluar: [{ nino, medicion, resultado }].
export function evaluarTodo(datos) {
  const ninos = new Map(datos.ninos.map((n) => [n.id, n]));
  const items = [];
  for (const medicion of datos.mediciones) {
    const nino = ninos.get(medicion.ninoId);
    const resultado = nino ? evaluarSeguro(nino, medicion) : null;
    if (resultado) items.push({ nino, medicion, resultado });
  }
  return items;
}

// Ciclos con datos, del más reciente al más antiguo.
export function ciclosDisponibles(items) {
  return [...new Set(items.map((i) => i.resultado.ciclo))].sort().reverse();
}

// Por niño dentro de un ciclo: [{ primera, ultima, total }].
export function primeraYUltima(items, ciclo) {
  const porNino = new Map();
  for (const item of items) {
    if (item.resultado.ciclo !== ciclo) continue;
    const grupo = porNino.get(item.nino.id);
    if (!grupo) {
      porNino.set(item.nino.id, { primera: item, ultima: item, total: 1 });
      continue;
    }
    grupo.total += 1;
    if (item.medicion.fecha < grupo.primera.medicion.fecha) grupo.primera = item;
    if (item.medicion.fecha > grupo.ultima.medicion.fecha) grupo.ultima = item;
  }
  return [...porNino.values()];
}

// { 'delgadez-severa': n, delgadez: n, normal: n, sobrepeso: n, obesidad: n, total: n }
export function contar(items) {
  const conteo = Object.fromEntries(CLASIFICACIONES.map((c) => [c, 0]));
  for (const item of items) conteo[item.resultado.clasificacion] += 1;
  conteo.total = items.length;
  return conteo;
}

// [{ grupo, n, pct }] en el orden de GRUPOS_GRAFICA.
export function porcentajesGrafica(conteo) {
  return GRUPOS_GRAFICA.map((grupo) => {
    const n = grupo === 'delgadez' ? conteo.delgadez + conteo['delgadez-severa'] : conteo[grupo];
    return { grupo, n, pct: conteo.total ? (n * 100) / conteo.total : 0 };
  });
}

const coincide = (item, taller, grado) =>
  item.medicion.taller === taller && (grado == null || item.medicion.grado === grado);

const talleresFiltrados = (taller) => (taller ? TALLERES.filter((t) => t.clave === taller) : TALLERES);

// Distribución por taller usando la primera o la última medición de cada niño en el ciclo.
// filtros: { ciclo, cual: 'primera' | 'ultima', taller: clave | null, grado: número | null }
export function comparacionTalleres(items, { ciclo, cual, taller = null, grado = null }) {
  const elegidas = primeraYUltima(items, ciclo).map((g) => g[cual]);
  return talleresFiltrados(taller).map((t) => ({
    taller: t.clave,
    nombre: t.nombre,
    conteo: contar(elegidas.filter((i) => coincide(i, t.clave, grado))),
  }));
}

// Primera contra última medición del ciclo. Solo cuenta niños con 2 o más mediciones;
// el taller y grado del niño son los de su última medición.
export function evolucion(items, { ciclo, taller = null, grado = null }) {
  const grupos = primeraYUltima(items, ciclo).filter((g) => g.total >= 2);
  return talleresFiltrados(taller).map((t) => {
    const delTaller = grupos.filter((g) => coincide(g.ultima, t.clave, grado));
    return {
      taller: t.clave,
      nombre: t.nombre,
      ninos: delTaller.length,
      primera: contar(delTaller.map((g) => g.primera)),
      ultima: contar(delTaller.map((g) => g.ultima)),
    };
  });
}
