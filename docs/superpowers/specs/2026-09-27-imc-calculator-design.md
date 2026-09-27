# Calculadora de IMC escolar — Diseño

Fecha: 2026-09-27

## 1. Propósito

Herramienta interna de una escuela Montessori en México para registrar el peso y la altura de sus alumnos de 3 a 15 años, clasificar su IMC para la edad según la OMS y ver estadísticas por taller y grado a lo largo del ciclo escolar.

- **Usuario:** una sola persona (maestra/o) captura y consulta todo, en una sola computadora.
- **Sin acceso de padres.** Es una app de control interno: no lleva avisos de privacidad.
- **Idioma de la interfaz:** español.

### Criterios de éxito

- Capturar la medición de un niño toma pocos segundos y muestra de inmediato su IMC, puntaje Z, percentil y clasificación.
- Se puede cargar un grupo completo desde CSV, con vista previa y errores por fila antes de guardar.
- Se puede comparar la distribución de clasificaciones entre talleres y la evolución de cada taller dentro de un ciclo.
- Se puede ver el historial de cada niño a lo largo de los ciclos.
- Los datos se pueden respaldar y restaurar (JSON) y exportar a Excel (CSV).

## 2. Stack y despliegue

- HTML + CSS + JavaScript vanilla, sin frameworks ni paso de compilación. JS organizado en módulos ES nativos (`<script type="module">`).
- Gráficas con **Chart.js** cargado desde jsDelivr con versión exacta fijada (`chart.js@4.5.1`, `dist/chart.umd.min.js`).
- Persistencia en `localStorage`.
- Despliegue en GitHub Pages desde la rama `master`.
- La app requiere internet (CDN). Para desarrollo local se sirve con un servidor estático (p. ej. `npx serve`), ya que los módulos ES no funcionan con `file://`.

## 3. Estructura del código

```
index.html
css/styles.css
data-oms/           archivos oficiales de la OMS (fuente de oms-lms.js)
scripts/generar-oms-lms.mjs   genera js/oms-lms.js
js/
  app.js            arranque, navegación por pestañas (#captura, #ninos, #estadisticas, #datos)
  oms-lms.js        coeficientes L, M, S de la OMS (generado)
  fechas.js         parseo/formato de fechas, edad en días y calendario
  ciclo.js          fecha → ciclo escolar
  imc.js            IMC, puntaje Z, percentil, clasificación
  talleres.js       talleres y sus grados; validación del par taller/grado
  normalizar.js     normalización de nombres (clave de identidad), sexo, decimales
  validacion.js     validación de un registro (niño + medición), compartida por captura y CSV
  datos.js          operaciones sobre el objeto de datos: altas, cambios, bajas, búsquedas
  store.js          leer/guardar el objeto de datos en localStorage
  csv.js            parseo e importación de CSV; generación del CSV de exportación
  respaldo.js       exportar/restaurar JSON
  estadisticas.js   agregaciones por taller/grado/ciclo
  views/
    dom.js          utilidades de DOM (descargar, leer archivo, escapar HTML)
    graficas.js     colores y ayudantes de Chart.js
    captura.js
    ninos.js
    estadisticas.js
    datos.js
tests/*.test.js     pruebas con `node --test`
package.json        solo `{"type": "module", "scripts": {"test": "node --test"}}`, sin dependencias
```

Regla de separación: todo lo de `js/*.js` excepto `app.js` son módulos sin DOM, probables con Node (`store.js` con un `localStorage` simulado). Las vistas solo leen/escriben a través de `store.js` y usan las funciones puras para calcular.

## 4. Modelo de datos

Un solo objeto JSON guardado en `localStorage` bajo una clave (`imc-calculator`). Es el mismo objeto que se descarga como respaldo.

```js
{
  "version": 1,
  "ninos": [
    { "id": "uuid", "nombre": "Sofía López García", "fechaNacimiento": "2019-05-12", "sexo": "F" }
  ],
  "mediciones": [
    { "id": "uuid", "ninoId": "uuid", "fecha": "2026-09-15",
      "pesoKg": 29.0, "alturaCm": 125.0, "taller": "T2", "grado": 5 }
  ]
}
```

- `id`: `crypto.randomUUID()`.
- Fechas en formato `AAAA-MM-DD`.
- `sexo`: `"F"` o `"M"` (sexo biológico, requerido por las tablas OMS).
- `taller`: `"CN"` | `"T1"` | `"T2"` | `"T3"`.
- `grado`: número SEP. CN: 1–3 (preescolar), T1: 1–3 (primaria), T2: 4–6 (primaria), T3: 1–3 (secundaria).
- Taller y grado viven en la **medición**, no en el niño, porque cambian cada ciclo.
- **No se guarda nada calculado** (edad, IMC, Z, percentil, clasificación, ciclo): se calcula al mostrar.
- `version` permite migraciones futuras.

### Talleres

| Clave | Nombre | Grados |
|---|---|---|
| CN | Casa de Niños | 1°, 2°, 3° de preescolar |
| T1 | Taller I | 1°, 2°, 3° de primaria |
| T2 | Taller II | 4°, 5°, 6° de primaria |
| T3 | Taller III | 1°, 2°, 3° de secundaria |

### Reglas de integridad

- **Identidad del niño:** nombre normalizado + fecha de nacimiento. Normalizar = quitar acentos/diacríticos, pasar a minúsculas, recortar y colapsar espacios. No puede haber dos niños con la misma clave.
- **Una medición por niño por fecha.** Una nueva medición con la misma fecha reemplaza a la anterior (en captura manual, previa confirmación).
- **Validaciones de medición:**
  - Edad en la fecha de medición: de 3 a 15 años cumplidos (calendario). Fuera de rango → error.
  - Nombre no vacío.
  - Fecha de medición no posterior a hoy ni anterior a la fecha de nacimiento.
  - Altura: 70–200 cm. Peso: 8–150 kg. Fuera de rango → error.
  - Par taller/grado válido según la tabla.
  - |Z| > 5 → advertencia "revisa los datos"; se permite guardar.

## 5. Cálculo y clasificación (OMS)

Referencia oficial usada en México (NOM-031-SSA2, NOM-008-SSA3): OMS.

- **Hasta 1826 días de edad (60 meses):** Patrones de Crecimiento Infantil OMS 2006, IMC para la edad, **por día de edad** (igual que el software WHO Anthro).
- **Más de 1826 días:** Referencia de Crecimiento OMS 2007, IMC para la edad, por mes con **interpolación lineal** de L, M, S entre meses (igual que el software WHO AnthroPlus), con edad en meses = días / 30.4375.

`oms-lms.js` se genera con un script a partir de los archivos oficiales de la OMS, versionados en `data-oms/`:
- `bmianthro.txt` — repositorio `WorldHealthOrganization/anthro`, `data-raw/growthstandards/`.
- `bfawho2007.txt` — repositorio `WorldHealthOrganization/anthroplus`, `data-raw/growthstandards/`.

### Pasos

1. **Edad:** en días (diferencia de fechas) para el cálculo; en años y meses cumplidos (calendario) para mostrar y para validar el rango de 3 a 15 años.
2. **IMC** = peso (kg) / (altura (m))², mostrado con 1 decimal.
3. **Puntaje Z (LMS):** `Z = ((IMC / M)^L − 1) / (L · S)`.
   Ajuste OMS para colas, con `SD(k) = M · (1 + L·S·k)^(1/L)`:
   - Si Z > 3: `Z = 3 + (IMC − SD(3)) / (SD(3) − SD(2))`
   - Si Z < −3: `Z = −3 + (IMC − SD(−3)) / (SD(−2) − SD(−3))`
   Mostrado con 2 decimales.
4. **Percentil:** Φ(Z) × 100 con la función de distribución normal estándar, mostrado con 1 decimal.
5. **Clasificación** (con el Z ya redondeado a 2 decimales, como hace la OMS):

| Puntaje Z | ≤ 1826 días (≤ 60 meses) | > 1826 días |
|---|---|---|
| Z < −3 | Delgadez severa | Delgadez severa |
| −3 ≤ Z < −2 | Delgadez | Delgadez |
| −2 ≤ Z ≤ +1 | Normal | Normal |
| +1 < Z ≤ +2 | Sobrepeso | Sobrepeso |
| +2 < Z ≤ +3 | Sobrepeso | Obesidad |
| Z > +3 | Obesidad | Obesidad |

Para menores de 5 años, la categoría OMS "riesgo de sobrepeso" (+1 a +2) se etiqueta como "Sobrepeso", y la "emaciación" como "Delgadez", para usar una sola escala de etiquetas. Los cortes de obesidad de la OMS para menores de 5 (> +3) se conservan.

### Ciclo escolar

Agosto–diciembre del año A → ciclo `A–(A+1)`. Enero–julio del año A → ciclo `(A−1)–A`. Ejemplo: 15/09/2026 y 10/03/2027 → ciclo 2026–2027.

## 6. Interfaz

Encabezado con el nombre de la app y pestañas horizontales: **Captura · Niños · Estadísticas · Datos**. Navegación por hash; la pestaña activa se refleja en la URL.

Colores de clasificación (constantes en CSS/JS): Delgadez (severa y normal) ámbar/café, Normal verde, Sobrepeso amarillo, Obesidad rojo.

### 6.1 Captura

Dos columnas: formulario a la izquierda y resultado en vivo a la derecha.

- **Niño:** campo de nombre con autocompletado de niños existentes (búsqueda normalizada).
  - Si se elige un niño existente, se llenan su fecha de nacimiento y sexo (solo lectura; se editan en la vista Niños).
  - Si el nombre no existe, se capturan fecha de nacimiento y sexo (Niña/Niño) y se crea al guardar.
- **Medición:** fecha de medición (por defecto hoy), taller en botones de opción, grado en botones de opción que muestran solo los grados del taller elegido, altura (cm) y peso (kg), con 1 decimal.
- **Resultado en vivo** en cuanto hay datos suficientes: edad (años y meses), IMC, puntaje Z, percentil, clasificación con su color y una barra de −3 a +3 que marca la posición del niño.
- **Guardar:** valida, guarda y muestra confirmación. Para capturar grupos seguidos, se limpian el niño, la altura y el peso, y se conservan la fecha de medición, el taller y el grado.
- Llegar desde "+ Nueva medición" de la ficha de un niño preselecciona a ese niño.

### 6.2 Niños

- **Lista (izquierda):** búsqueda por nombre y filtros de taller y grado. Columnas: nombre, edad actual, taller y grado, y última clasificación. Taller, grado y clasificación salen de la medición más reciente.
- **Ficha (derecha)** al elegir un niño:
  - Nombre, sexo y fecha de nacimiento, con botones **Editar datos** y **Eliminar niño**. Eliminar pide confirmación y borra también sus mediciones. Editar no puede generar una clave duplicada.
  - Gráfica de línea (Chart.js) del puntaje Z en el tiempo, con franjas de color de fondo por clasificación.
  - Tabla de mediciones (de la más reciente a la más antigua): fecha, ciclo, taller y grado, altura, peso, IMC, Z y clasificación, con acciones **editar** y **borrar** (con confirmación).
  - Botón **+ Nueva medición** → Captura con el niño preseleccionado.

### 6.3 Estadísticas

- **Filtros:** ciclo escolar (por defecto el más reciente con datos), taller (Todos o uno), grado (se habilita solo con un taller elegido; muestra los grados de ese taller) y medición (Primera / Última, por defecto Última).
- Por cada niño y ciclo se toma su primera o su última medición dentro del ciclo, según el filtro. El taller y el grado de esa medición determinan en qué grupo cuenta.
- **Gráfica 1, comparación entre talleres:** barras horizontales apiladas al 100% por taller, con el número de niños junto al nombre. Delgadez severa y delgadez se agrupan en un solo segmento "Delgadez".
- **Gráfica 2, evolución en el ciclo:** por taller (uno solo o todos), dos barras apiladas (Primera y Última) y una tabla con los conteos por clasificación (con delgadez severa por separado), Primera, Última y Cambio. Solo cuenta niños con al menos 2 mediciones en el ciclo. El grupo se asigna según la última medición.
- Si no hay datos para los filtros, se muestra un mensaje en lugar de las gráficas.

### 6.4 Datos

**Importar CSV**

- Columnas (en cualquier orden, identificadas por encabezado): `nombre, fecha_nacimiento, sexo, fecha_medicion, taller, grado, altura_cm, peso_kg`. Las columnas extra se ignoran.
- Separador `,` o `;` (autodetectado por el encabezado). Campos entre comillas soportados. UTF-8, con o sin BOM.
- Fechas `DD/MM/AAAA` o `AAAA-MM-DD`.
- Sexo: `F`/`M`, `Niña`/`Niño`, `Mujer`/`Hombre` (sin distinguir mayúsculas ni acentos).
- Taller: `CN`/`T1`/`T2`/`T3` o el nombre completo (`Casa de Niños`, `Taller I`…).
- Decimales con punto.
- **Vista previa antes de guardar:**
  - Resumen: filas válidas, niños nuevos, mediciones nuevas y mediciones que reemplazan una existente.
  - Lista de filas con error, con número de fila y motivo (mismas validaciones que la captura manual, más: niño existente con el mismo nombre y fecha pero sexo distinto; dos filas del archivo con el mismo niño y la misma fecha).
  - Botones **Importar N filas válidas** y **Cancelar**. Las filas con error no se importan.
- Botón **Descargar plantilla CSV** con encabezados y una fila de ejemplo.

**Exportar CSV**

- Una fila por medición, con todas las mediciones y sin filtros. Incluye las 8 columnas de importación más `edad_meses, ciclo, imc, z, percentil, clasificacion`.
- UTF-8 con BOM, separador `,`, fechas `DD/MM/AAAA`. Se puede reimportar.
- Nombre del archivo: `imc-mediciones-AAAA-MM-DD.csv`.

**Respaldo JSON**

- **Descargar respaldo:** el objeto completo de la Sección 4, como `imc-respaldo-AAAA-MM-DD.json`.
- **Restaurar respaldo:** valida la estructura y la versión. Si es válido, pide confirmación ("Se reemplazarán X niños y Y mediciones por los del archivo: A niños y B mediciones") y reemplaza todo. Si no es válido, muestra el error y no toca los datos.

## 7. Manejo de errores

- `localStorage` no disponible o lleno al guardar → mensaje visible; el cambio no se aplica en memoria.
- Datos en `localStorage` corruptos (JSON inválido) al arrancar → mensaje que ofrece restaurar un respaldo; no se sobrescriben automáticamente.
- Errores de validación en captura → mensaje junto al campo; no se guarda.
- Chart.js no cargó (sin internet) → las vistas funcionan sin gráficas y muestran un aviso en lugar de cada gráfica.

## 8. Pruebas

`node --test`, sin dependencias, sobre los módulos puros:

- `imc.js`:
  - Edad en meses (bordes de día y mes).
  - IMC.
  - Para varias edades de ambas tablas y ambos sexos: IMC = M → Z = 0; IMC = SD(k) → Z = k para k ∈ {−2, +1, +2}.
  - Colas > +3 y < −3 con el ajuste OMS.
  - Percentil de Z = 0 → 50.
  - Clasificación en cada corte y en ambos rangos de edad.
- `ciclo.js`: julio contra agosto, cambio de año.
- `talleres.js`: pares válidos e inválidos.
- `normalizar.js`: acentos, mayúsculas, espacios.
- `csv.js`: separadores, comillas, formatos de fecha, sinónimos de sexo y taller, detección de errores por fila, duplicados dentro del archivo, ida y vuelta exportar → importar.
- `respaldo.js`: validación de estructura.
- `estadisticas.js`: primera/última por ciclo, agrupación por taller y grado, exclusión de niños con una sola medición en la evolución.

Las vistas se verifican manualmente en el navegador.

## 9. Fuera de alcance

- Varios usuarios, inicio de sesión, servidor o sincronización.
- Acceso de padres.
- Comparación entre ciclos distintos.
- Lista de alerta de niños en riesgo.
- Exportar solo lo filtrado; botón "borrar todo".
- Funcionamiento sin internet.
- Recordatorios de respaldo.
