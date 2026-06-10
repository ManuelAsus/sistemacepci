# CEPCI Offline School Management System

## Resumen general
Este proyecto es una aplicación web cliente que funciona principalmente con archivos locales y almacena datos usando IndexedDB. Está diseñada como un sistema de gestión escolar que maneja:

- login y permisos de usuarios
- alumnos, maestros, materias, asesores y grupos
- calificaciones
- pagos y caja
- inventario
- copias de seguridad / restauración (.json)
- administración de usuarios y permisos
- configuraciones y estados del sistema

La mayor parte del código está en páginas HTML individuales con scripts embebidos que consumen utilidades comunes definidas en `js/db.js`.

## Arquitectura

### Estructura clave

- `index.html` - pantalla de login y arranque del sistema.
- `dashboard.html` - panel principal que permite navegar entre módulos.
- Archivos principales por módulo:
  - `registroalumnos.html`, `registroalumnos.json`
  - `maestros.html`, `vermaestros.html`
  - `registrarmaterias.html`, `vermaterias.html`
  - `asesores.html`
  - `grupos.html`
  - `calificaciones.html` (y `calificaciones.legacy.html`)
  - `pagos.html`, `definircobros.html`, `definircostosypagos.html`
  - `inventario.html`
  - `caja.html`
  - `listas.html`
  - `copiadeseguridad.html`
  - `informacion.html`
  - `administrador.html`

- `js/db.js` - gestor central de IndexedDB y utilidades CRUD.
- `js/index.js` - script de arranque Cordova (no parece utilizado por las páginas HTML actuales).
- `css/index.css` - estilos generales.
- `img/` - recursos de imágenes locales.

## IndexedDB y persistencia de datos

El motor de datos principal es IndexedDB. `js/db.js` crea y gestiona estas tiendas:

- `alumnos`
- `maestros`
- `materias`
- `asesores`
- `imagenes`
- `grupos`
- `settings`
- `usuarios`
- `caja_movimientos`
- `caja_sesiones`
- `calificaciones`
- `inventario`
- `horarios`
- `login_usuarios`

### Funciones importantes en `js/db.js`

- `initIndexedDB()` — inicializa la base de datos, maneja upgrades y recrea la base si hay errores internos.
- `verificarUsuarioPorDefecto()` — garantiza que exista el usuario administrador `AdminCepci01` con contraseña `AdministracionCepci`.
- CRUD para cada tipo de entidad: alumnos, maestros, materias, asesores, grupos, inventario, calificaciones, horarios, usuarios de caja y login.
- `guardarImagen()` / `obtenerImagen()` — almacena blobs en IndexedDB para imágenes.
- `limpiarBaseDatos()` y `resetearSistemaCompleto()` — borran datos y reinician el sistema.
- `getSetting()` / `setSetting()` — almacenamiento de configuración global.

### Control de acceso y permisos

- `PAGE_MODULE_MAP` mapea cada página a un módulo lógico.
- `checkModuleAccess()` valida permisos almacenados en `sessionStorage`.
- `enforceCurrentPageAccess()` bloquea el acceso si el usuario no tiene permisos para la página actual.
- `hideDashboardCards()` oculta tarjetas del dashboard según permisos.

## Estado offline

### Compatible con offline

- Todas las páginas HTML cargan scripts locales (`js/db.js`, `js/index.js`) y estilos locales.
- Los datos se guardan 100% en IndexedDB, por lo que no se depende de un backend remoto en tiempo de ejecución.
- No hay llamadas `fetch()` o `XMLHttpRequest` visibles que necesiten recursos externos.

### Excepciones detectadas

Hay dos elementos que rompen la condición "100% offline":

1. `calificaciones.legacy.html`
   - Incluye scripts externos desde CDN:
     - `https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js`
     - `https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js`
   - Si se desea una versión completamente offline, esos scripts deben descargarse y servirse localmente.

2. `informacion.html`
   - Usa iframes de Google Maps con URLs `https://www.google.com/maps/embed?...`.
   - Esto requiere conexión a internet para mostrar mapas.

### Nota sobre `js/index.js`

- Contiene un manejador Cordova (`deviceready`) pero no se encontró referencia a `js/index.js` en los archivos HTML actuales.
- Esto sugiere que la aplicación puede haber sido preparada para despliegue en entorno híbrido, pero en la copia actual no es parte del flujo activo.

## Puntos fuertes

- Diseño modular basado en páginas independientes.
- Base de datos local bien estructurada con múltiples object stores.
- Control de acceso por módulo integrado en `js/db.js`.
- Respaldo / restauración en JSON está implementado.
- `calificaciones.html` y otras páginas contienen lógica avanzada de limpieza y actualización de datos.

## Riesgos / detalles a revisar

- `calificaciones.legacy.html` y `informacion.html` son los únicos puntos con dependencias externas.
- Si se ejecuta desde `file://`, algunos navegadores pueden restringir IndexedDB o el acceso a archivos. Se recomienda usar un servidor local simple si hay problemas de compatibilidad.
- El usuario administrador por defecto se crea automáticamente con contraseña en texto claro.
- No se vio cifrado ni hashing de contraseñas en `js/db.js`.

## Recomendaciones para modificaciones

1. Si necesitas mantenerlo 100% offline, reemplaza los scripts CDN en `calificaciones.legacy.html` por versiones locales.
2. Para información local sin internet, reemplaza los iframes de Google Maps en `informacion.html` por contenido estático o mapas offline.
3. Si quieres mejorar seguridad, convierte las contraseñas de `login_usuarios` a hashes en lugar de texto plano.
4. Revisa `js/index.js` y elimina o integra el código Cordova solo si se usa realmente.
5. Valida si `registroalumnos.json` y `users.json` son datos de respaldo o solo muestras; no hay indicio de que se carguen automáticamente.

## Conclusión
El sistema está bien organizado y es estable en su lógica local. Su arquitectura principal es totalmente offline, salvo `calificaciones.legacy.html` y `informacion.html`, que requieren Internet debido a dependencias externas.

> Para una versión 100% offline, esos dos archivos son los únicos puntos de atención reales.
