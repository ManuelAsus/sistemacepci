// www/js/db.js
// IndexedDB Manager para CEPCI
const DB_NAME = 'CEPCIDatabase';
const DB_VERSION = 15; // bump to force maestros store creation

// lista de módulos para permisos de usuario de login
const LOGIN_MODULES = ['registroalumnos','veralumnos','maestros','materias','asesores','grupos','calificaciones','pagos','definircostosypagos','inventario','caja','listas','copiadeseguridad','importar','informacion','otros'];

// mapeo de nombres de página a módulos (para comprobación automática)
const PAGE_MODULE_MAP = {
    'registroalumnos.html': 'registroalumnos',
    'maestros.html': 'maestros',
    'vermaestros.html': 'maestros',
    'registrarmaterias.html': 'materias',
    'vermaterias.html': 'materias',
    'veralumnos.html': 'veralumnos',
    'calificaciones.html': 'calificaciones',
    'pagos.html': 'pagos',
    'definircostosypagos.html': 'definircostosypagos',
    'asesores.html': 'asesores',
    'grupos.html': 'grupos',
    'inventario.html': 'inventario',
    'caja.html': 'caja',
    'listas.html': 'listas',
    'copiadeseguridad.html': 'copiadeseguridad',
    'definircobros.html': 'pagos',
    'administrador.html': 'otros',
    'dashboard.html': null, // dashboard itself not restricted here
    'informacion.html': 'informacion'
};

// Función para calcular edad a partir de fecha de nacimiento
function calcularEdad(fechaNacimiento) {
    if (!fechaNacimiento) return null;
    const hoy = new Date();
    const nacimiento = new Date(fechaNacimiento);
    let edad = hoy.getFullYear() - nacimiento.getFullYear();
    const mes = hoy.getMonth() - nacimiento.getMonth();
    if (mes < 0 || (mes === 0 && hoy.getDate() < nacimiento.getDate())) {
        edad--;
    }
    return edad;
}

// Helper para permisos (usa sessionStorage)
function checkModuleAccess(module) {
    const perms = JSON.parse(sessionStorage.getItem('permissions') || '{}');
    // compatibilidad hacia atrás: si es registroalumnos o veralumnos, también chequear 'alumnos'
    if (module === 'registroalumnos' || module === 'veralumnos') {
        return perms[module] === true || perms['alumnos'] === true;
    }
    // solo si existe y es true se permite; undefined/false deniega
    return perms[module] === true;
}

async function enforceCurrentPageAccess() {
    const file = window.location.pathname.split('/').pop();
    const mod = PAGE_MODULE_MAP[file];
    if (mod && mod !== null) {
        // recargar permisos desde DB para asegurar que estén actualizados
        const username = sessionStorage.getItem('usuario');
        if (username) {
            try {
                const user = await obtenerUsuarioLogin(username);
                if (user && user.permissions) {
                    // backfill any missing module keys to true
                    let changed = false;
                    LOGIN_MODULES.forEach(m => {
                        if (user.permissions[m] === undefined) {
                            user.permissions[m] = true;
                            changed = true;
                        }
                    });
                    if (changed) {
                        await actualizarUsuarioLogin(user);
                    }
                    sessionStorage.setItem('permissions', JSON.stringify(user.permissions));
                }
            } catch (e) {
                console.error('Error recargando permisos:', e);
            }
        }
        if (!checkModuleAccess(mod)) {
            alert('No tienes permiso para acceder a esta sección.');
            window.location.href = 'dashboard.html';
            return false;
        }
    }
    return true;
}

// función para ocultar tarjetas en dashboard según permisos
function hideDashboardCards() {
    const perms = JSON.parse(sessionStorage.getItem('permissions') || '{}');
    document.querySelectorAll('.card[data-module]').forEach(card => {
        const mod = card.getAttribute('data-module');
        if (!checkModuleAccess(mod)) {
            card.style.display = 'none';
        } else {
            card.style.display = ''; // mostrar si tiene permiso
        }
    });
}

// ejecutar verificación al cargar cualquier página
document.addEventListener('DOMContentLoaded', async () => {
    await enforceCurrentPageAccess();
    // verificar permisos cada 30 segundos para cerrar acceso inmediato si se revocan
    setInterval(async () => {
        await enforceCurrentPageAccess();
        // si estamos en dashboard, ocultar tarjetas según permisos actualizados
        if (window.location.pathname.endsWith('dashboard.html')) {
            hideDashboardCards();
        }
    }, 30000);
});


let db = null;
let dbInitPromise = null;

function initIndexedDB() {
    // Si ya se está inicializando, devolver la promesa existente
    if (dbInitPromise) return dbInitPromise;
    
    dbInitPromise = new Promise((resolve, reject) => {
        if (db) {
            resolve(db);
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            console.error('Error IndexedDB:', request.error);
            dbInitPromise = null;
            
            // Si es un error interno, intentar eliminar la base de datos y recrear
            if (request.error && request.error.name === 'InvalidStateError' || request.error.message.includes('Internal error')) {
                console.warn('Error interno en IndexedDB, intentando eliminar y recrear la base de datos...');
                const deleteRequest = indexedDB.deleteDatabase(DB_NAME);
                deleteRequest.onsuccess = () => {
                    console.log('Base de datos eliminada, intentando recrear...');
                    // Resetear y volver a intentar
                    db = null;
                    initIndexedDB().then(resolve).catch(reject);
                };
                deleteRequest.onerror = () => {
                    console.error('Error eliminando base de datos:', deleteRequest.error);
                    reject(request.error);
                };
            } else {
                reject(request.error);
            }
        };

        request.onsuccess = async () => {
            db = request.result;
            console.log('IndexedDB inicializado correctamente (version', db.version, ')');
            
            // Si por alguna razón falta el object store de login, hacemos un upgrade dinámico
            if (!db.objectStoreNames.contains('login_usuarios')) {
                console.warn('login_usuarios ausente en la base; forzando creación mediante upgrade');
                db.close();
                const newVersion = db.version + 1;
                await new Promise((res, rej) => {
                    const r2 = indexedDB.open(DB_NAME, newVersion);
                    r2.onupgradeneeded = (evt) => {
                        evt.target.result.createObjectStore('login_usuarios', { keyPath: 'username' });
                        console.log('login_usuarios store creado en upgrade dinámico');
                    };
                    r2.onsuccess = () => {
                        db = r2.result;
                        res();
                    };
                    r2.onerror = () => rej(r2.error);
                });
            }
            
            // No llamar verificarUsuarioPorDefecto aquí para evitar ciclo
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            console.log('onupgradeneeded triggered, oldVersion=', event.oldVersion, 'newVersion=', event.newVersion);
            
            if (!database.objectStoreNames.contains('alumnos')) {
                database.createObjectStore('alumnos', { keyPath: 'id', autoIncrement: true });
            }
            if (!database.objectStoreNames.contains('maestros')) {
                database.createObjectStore('maestros', { keyPath: 'id', autoIncrement: true });
            }
            if (!database.objectStoreNames.contains('materias')) {
                database.createObjectStore('materias', { keyPath: 'id', autoIncrement: true });
            }
            if (!database.objectStoreNames.contains('asesores')) {
                database.createObjectStore('asesores', { keyPath: 'id', autoIncrement: true });
            }
            if (!database.objectStoreNames.contains('imagenes')) {
                database.createObjectStore('imagenes', { keyPath: 'id' });
            }
            if (!database.objectStoreNames.contains('grupos')) {
                database.createObjectStore('grupos', { keyPath: 'id', autoIncrement: true });
            }
            if (!database.objectStoreNames.contains('settings')) {
                database.createObjectStore('settings', { keyPath: 'name' });
            }
            if (!database.objectStoreNames.contains('usuarios')) {
                database.createObjectStore('usuarios', { keyPath: 'username' });
            }
            if (!database.objectStoreNames.contains('caja_movimientos')) {
                database.createObjectStore('caja_movimientos', { keyPath: 'id', autoIncrement: true });
            }
            if (!database.objectStoreNames.contains('caja_sesiones')) {
                database.createObjectStore('caja_sesiones', { keyPath: 'id', autoIncrement: true });
            }
            if (!database.objectStoreNames.contains('calificaciones')) {
                // store for grades: { id(auto), alumnoId, grupoId, materiaId, calificacion, timestamp }
                database.createObjectStore('calificaciones', { keyPath: 'id', autoIncrement: true });
            }
            if (!database.objectStoreNames.contains('inventario')) {
                // store for products: { id(auto), nombre, descripcion, precio, categoria, stock, timestamp }
                database.createObjectStore('inventario', { keyPath: 'id', autoIncrement: true });
            }
            if (!database.objectStoreNames.contains('horarios')) {
                const store = database.createObjectStore('horarios', { keyPath: 'id', autoIncrement: true });
                store.createIndex('nombre', 'nombre', { unique: true });
            }
            if (!database.objectStoreNames.contains('login_usuarios')) {
                // store para usuarios de login del sistema: { username, password }
                database.createObjectStore('login_usuarios', { keyPath: 'username' });
                // Insertar usuario por defecto
                const tx = event.currentTarget.transaction;
                const store = tx.objectStore('login_usuarios');
                // generar permisos por defecto (todos true)
                const defaultPerms = {};
                LOGIN_MODULES.forEach(m => defaultPerms[m] = true);
                store.put({ username: 'AdminCepci01', password: 'AdministracionCepci', permissions: defaultPerms });
                console.log('Usuario por defecto AdminCepci01 agregado en onupgradeneeded con permisos');
            }
            console.log('Object stores creados/validados');
        };
    });

    return dbInitPromise;
}

// ---------- SETTINGS (configuración global) ----------
async function getSetting(name) {
    await initIndexedDB();
    
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['settings'], 'readonly');
        const store = tx.objectStore('settings');
        const req = store.get(name);
        
        req.onerror = () => {
            console.error('Error obteniendo setting:', name, req.error);
            reject(req.error);
        };
        
        req.onsuccess = () => {
            const result = req.result ? req.result.value : null;
            console.log(`getSetting('${name}') =`, result);
            resolve(result);
        };
    });
}

async function setSetting(name, value) {
    await initIndexedDB();
    
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['settings'], 'readwrite');
        const store = tx.objectStore('settings');
        const req = store.put({ name, value });
        
        req.onerror = () => {
            console.error('Error guardando setting:', name, req.error);
            reject(req.error);
        };
        
        req.onsuccess = () => {
            console.log(`setSetting('${name}', ${value}) guardado`);
            resolve();
        };
    });
}

// ========== ALUMNOS ==========
async function cargarAlumnos() {
    await initIndexedDB();
    
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['alumnos'], 'readonly');
        const store = tx.objectStore('alumnos');
        const request = store.getAll();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
    });
}

async function agregarAlumno(alumno) {
    await initIndexedDB();
    
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['alumnos'], 'readwrite');
        const store = tx.objectStore('alumnos');
        const request = store.add(alumno);
        request.onerror = () => reject(request.error);
        request.onsuccess = (e) => {
            alumno.id = e.target.result;
            resolve(alumno);
        };
    });
}

async function actualizarAlumno(alumno) {
    await initIndexedDB();
    
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['alumnos'], 'readwrite');
        const store = tx.objectStore('alumnos');
        const request = store.put(alumno);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(alumno);
    });
}

async function obtenerAlumnoPorId(id) {
    await initIndexedDB();
    
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['alumnos'], 'readonly');
        const store = tx.objectStore('alumnos');
        const request = store.get(id);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
    });
}

async function eliminarAlumno(id) {
    await initIndexedDB();
    
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['alumnos'], 'readwrite');
        const store = tx.objectStore('alumnos');
        const request = store.delete(id);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
}

async function obtenerProximoCodigoAlumno() {
    const alumnos = await cargarAlumnos();
    if (!alumnos || alumnos.length === 0) return 1;
    const maxCodigo = Math.max(...alumnos.map(a => a.codigo || 0));
    return maxCodigo + 1;
}

async function obtenerProximaMatricula() {
    const alumnos = await cargarAlumnos();
    if (!alumnos || alumnos.length === 0) return 'ALUMNO0000000001';
    const maxNum = Math.max(...alumnos.map(a => {
        const match = String(a.matricula || '').match(/(\d+)$/);
        return match ? parseInt(match[1]) : 0;
    }));
    const nextNum = maxNum + 1;
    return 'ALUMNO' + String(nextNum).padStart(7, '0');
}

async function obtenerProximoIdMaestro() {
    const maestros = await cargarMaestros();
    if (!maestros || maestros.length === 0) return 'M00001';
    const maxNum = Math.max(...maestros.map(m => {
        const match = String(m.id || '').match(/(\d+)$/);
        return match ? parseInt(match[1]) : 0;
    }));
    const nextNum = maxNum + 1;
    return 'M' + String(nextNum).padStart(5, '0');
}

// ========== MAESTROS ==========
async function cargarMaestros() {
    await initIndexedDB();
    
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['maestros'], 'readonly');
        const store = tx.objectStore('maestros');
        const request = store.getAll();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
    });
}

async function agregarMaestro(maestro) {
    await initIndexedDB();
    
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['maestros'], 'readwrite');
        const store = tx.objectStore('maestros');
        const request = store.add(maestro);
        request.onerror = () => reject(request.error);
        request.onsuccess = (e) => {
            maestro.id = e.target.result;
            resolve(maestro);
        };
    });
}

async function actualizarMaestro(maestro) {
    await initIndexedDB();
    
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['maestros'], 'readwrite');
        const store = tx.objectStore('maestros');
        const request = store.put(maestro);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(maestro);
    });
}

async function eliminarMaestro(id) {
    await initIndexedDB();
    
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['maestros'], 'readwrite');
        const store = tx.objectStore('maestros');
        const request = store.delete(id);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
}

// ========== MATERIAS ==========
async function cargarMaterias() {
    await initIndexedDB();
    
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['materias'], 'readonly');
        const store = tx.objectStore('materias');
        const request = store.getAll();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
    });
}

async function agregarMateria(materia) {
    await initIndexedDB();
    
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['materias'], 'readwrite');
        const store = tx.objectStore('materias');
        const request = store.add(materia);
        request.onerror = () => reject(request.error);
        request.onsuccess = (e) => {
            materia.id = e.target.result;
            resolve(materia);
        };
    });
}

async function actualizarMateria(materia) {
    await initIndexedDB();
    
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['materias'], 'readwrite');
        const store = tx.objectStore('materias');
        const request = store.put(materia);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(materia);
    });
}

async function eliminarMateria(id) {
    await initIndexedDB();
    
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['materias'], 'readwrite');
        const store = tx.objectStore('materias');
        const request = store.delete(id);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
}

// ========== ASESORES ==========
async function cargarAsesores() {
    await initIndexedDB();
    
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['asesores'], 'readonly');
        const store = tx.objectStore('asesores');
        const request = store.getAll();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
    });
}

async function agregarAsesor(asesor) {
    await initIndexedDB();
    
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['asesores'], 'readwrite');
        const store = tx.objectStore('asesores');
        const request = store.add(asesor);
        request.onerror = () => reject(request.error);
        request.onsuccess = (e) => {
            asesor.id = e.target.result;
            resolve(asesor);
        };
    });
}

async function actualizarAsesor(asesor) {
    await initIndexedDB();
    
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['asesores'], 'readwrite');
        const store = tx.objectStore('asesores');
        const request = store.put(asesor);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(asesor);
    });
}

async function obtenerAsesorPorId(id) {
    await initIndexedDB();
    
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['asesores'], 'readonly');
        const store = tx.objectStore('asesores');
        const request = store.get(id);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
    });
}

async function eliminarAsesor(id) {
    await initIndexedDB();
    
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['asesores'], 'readwrite');
        const store = tx.objectStore('asesores');
        const request = store.delete(id);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
}

// ========== IMÁGENES ==========
async function guardarImagen(id, blob) {
    await initIndexedDB();
    
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['imagenes'], 'readwrite');
        const store = tx.objectStore('imagenes');
        const request = store.put({ id, blob });
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
}

async function obtenerImagen(id) {
    await initIndexedDB();
    
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['imagenes'], 'readonly');
        const store = tx.objectStore('imagenes');
        const request = store.get(id);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            if (request.result) {
                resolve(URL.createObjectURL(request.result.blob));
            } else {
                resolve(null);
            }
        };
    });
}

// ========== GRUPOS ==========
async function cargarGrupos() {
    await initIndexedDB();
    
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['grupos'], 'readonly');
        const store = tx.objectStore('grupos');
        const request = store.getAll();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
    });
}

async function agregarGrupo(grupo) {
    await initIndexedDB();
    
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['grupos'], 'readwrite');
        const store = tx.objectStore('grupos');
        const request = store.add(grupo);
        request.onerror = () => reject(request.error);
        request.onsuccess = (e) => {
            grupo.id = e.target.result;
            resolve(grupo);
        };
    });
}

async function actualizarGrupo(grupo) {
    await initIndexedDB();
    
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['grupos'], 'readwrite');
        const store = tx.objectStore('grupos');
        const request = store.put(grupo);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(grupo);
    });
}

async function eliminarGrupo(id) {
    await initIndexedDB();
    
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['grupos'], 'readwrite');
        const store = tx.objectStore('grupos');
        const request = store.delete(id);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
}

async function obtenerGrupoPorId(id) {
    await initIndexedDB();
    
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['grupos'], 'readonly');
        const store = tx.objectStore('grupos');
        const request = store.get(id);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
    });
}

// ========== USUARIOS DE LOGIN DEL SISTEMA ==========
async function agregarUsuarioLogin(usuario) {
    console.log('agregarUsuarioLogin llamado con:', usuario);
    await initIndexedDB();
    console.log('DB inicializada en agregarUsuarioLogin');
    
    return new Promise((resolve, reject) => {
        console.log('Iniciando transacción para login_usuarios');
        const tx = db.transaction(['login_usuarios'], 'readwrite');
        const store = tx.objectStore('login_usuarios');
        console.log('Store obtenido:', store.name);
        const request = store.add(usuario);
        request.onerror = () => {
            console.error('Error agregando usuario login:', usuario, request.error);
            // si ya existe o store no encontrado, intentar put como fallback
            if (request.error && (request.error.name === 'ConstraintError' || request.error.name === 'NotFoundError')) {
                console.warn('Intentando put como fallback para:', usuario);
                const putReq = store.put(usuario);
                putReq.onerror = () => {
                    console.error('Put también falló:', putReq.error);
                    reject(putReq.error);
                };
                putReq.onsuccess = () => {
                    console.log('Usuario login actualizado con put:', usuario);
                    resolve();
                };
            } else {
                reject(request.error);
            }
        };
        request.onsuccess = () => {
            console.log('Usuario login agregado exitosamente:', usuario);
            resolve();
        };
    });
}

async function obtenerUsuarioLogin(username) {
    await initIndexedDB();
    
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['login_usuarios'], 'readonly');
        const store = tx.objectStore('login_usuarios');
        const request = store.get(username);
        request.onerror = () => {
            console.error('Error obteniendo usuario login:', username, request.error);
            reject(request.error);
        };
        request.onsuccess = () => {
            console.log('obtenerUsuarioLogin result for', username, ':', request.result);
            resolve(request.result);
        };
    });
}

async function cargarUsuariosLogin() {
    await initIndexedDB();
    
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['login_usuarios'], 'readonly');
        const store = tx.objectStore('login_usuarios');
        const request = store.getAll();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
    });
}

async function eliminarUsuarioLogin(username) {
    await initIndexedDB();
    
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['login_usuarios'], 'readwrite');
        const store = tx.objectStore('login_usuarios');
        const request = store.delete(username);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
}

async function actualizarUsuarioLogin(usuario) {
    await initIndexedDB();
    
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['login_usuarios'], 'readwrite');
        const store = tx.objectStore('login_usuarios');
        const request = store.put(usuario);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
}

// ========== USUARIOS DE CAJA ==========
async function agregarUsuario(usuario) {
    await initIndexedDB();
    
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['usuarios'], 'readwrite');
        const store = tx.objectStore('usuarios');
        const request = store.add(usuario);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
}

async function obtenerUsuario(username) {
    await initIndexedDB();
    
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['usuarios'], 'readonly');
        const store = tx.objectStore('usuarios');
        const request = store.get(username);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
    });
}

async function cargarUsuarios() {
    await initIndexedDB();
    
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['usuarios'], 'readonly');
        const store = tx.objectStore('usuarios');
        const request = store.getAll();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
    });
}

async function actualizarUsuario(usuario) {
    await initIndexedDB();
    
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['usuarios'], 'readwrite');
        const store = tx.objectStore('usuarios');
        const request = store.put(usuario);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
}

async function eliminarUsuario(username) {
    await initIndexedDB();
    
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['usuarios'], 'readwrite');
        const store = tx.objectStore('usuarios');
        const request = store.delete(username);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
}

// ========== CAJA MOVIMIENTOS ==========
async function agregarMovimiento(movimiento) {
    await initIndexedDB();
    
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['caja_movimientos'], 'readwrite');
        const store = tx.objectStore('caja_movimientos');
        const request = store.add(movimiento);
        request.onerror = () => reject(request.error);
        request.onsuccess = (e) => {
            movimiento.id = e.target.result;
            resolve(movimiento);
        };
    });
}

async function cargarMovimientosPorFecha(fecha) {
    await initIndexedDB();
    
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['caja_movimientos'], 'readonly');
        const store = tx.objectStore('caja_movimientos');
        const request = store.getAll();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const movimientos = request.result.filter(m => m.fecha.startsWith(fecha));
            resolve(movimientos);
        };
    });
}

// ========== CAJA SESIONES ==========
async function agregarSesion(sesion) {
    await initIndexedDB();
    
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['caja_sesiones'], 'readwrite');
        const store = tx.objectStore('caja_sesiones');
        const request = store.add(sesion);
        request.onerror = () => reject(request.error);
        request.onsuccess = (e) => {
            sesion.id = e.target.result;
            resolve(sesion);
        };
    });
}

async function obtenerSesionPorFecha(fecha) {
    await initIndexedDB();
    
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['caja_sesiones'], 'readonly');
        const store = tx.objectStore('caja_sesiones');
        const request = store.getAll();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const sesion = request.result.find(s => s.fecha === fecha);
            resolve(sesion);
        };
    });
}

async function actualizarSesion(sesion) {
    await initIndexedDB();
    
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['caja_sesiones'], 'readwrite');
        const store = tx.objectStore('caja_sesiones');
        const request = store.put(sesion);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
}

// ========== LIMPIAR BASE DE DATOS COMPLETAMENTE ==========
async function limpiarBaseDatos() {
    await initIndexedDB();
    
    return new Promise((resolve, reject) => {
        const stores = ['alumnos','maestros','materias','asesores','imagenes','grupos','usuarios','caja_movimientos','caja_sesiones','settings'];
        let completadas = 0;
        let errores = 0;

        stores.forEach(storeName => {
            const tx = db.transaction([storeName], 'readwrite');
            const store = tx.objectStore(storeName);
            const req = store.clear();
            
            req.onerror = () => {
                console.error(`Error limpiando ${storeName}:`, req.error);
                errores++;
            };
            
            req.onsuccess = () => {
                completadas++;
                console.log(`✓ ${storeName} limpiado`);
                if (completadas + errores === stores.length) {
                    if (errores === 0) {
                        console.log('✓ Base de datos completamente limpia');
                        resolve();
                    } else {
                        console.warn(`⚠ Se limpió con ${errores} errores`);
                        resolve();
                    }
                }
            };
        });
    });
}

// Función para resetear completamente el sistema
async function resetearSistemaCompleto() {
    if (!confirm('⚠️ ADVERTENCIA CRÍTICA:\n\nEsto BORRARÁ PERMANENTEMENTE todos los datos del sistema incluyendo:\n\n✓ Alumnos, maestros, materias, asesores\n✓ Grupos y asignaciones\n✓ Usuarios y credenciales\n✓ Registro de caja completo\n✓ Imágenes de perfil\n✓ Todas las configuraciones\n\nEsta acción NO se puede deshacer. ¿Deseas continuar?')) {
        return false;
    }

    if (!confirm('⚠️ CONFIRMACIÓN FINAL:\n\n¿Estás COMPLETAMENTE SEGURO? Se borrará TODO sin opción de recuperación.')) {
        return false;
    }

    try {
        console.log('🔄 Limpiando base de datos...');
        await limpiarBaseDatos();
        console.log('✓ Base de datos limpiada exitosamente');
        
        // Limpiar sessionStorage también
        sessionStorage.clear();
        localStorage.clear();
        
        alert('✓ Sistema resetado completamente. Será redirigido a login.');
        window.location.href = 'index.html';
        return true;
    } catch (err) {
        console.error('Error al resetear:', err);
        alert('Error al resetear el sistema: ' + (err.message || err));
        return false;
    }
}

// Inicializar al cargar el DOM
document.addEventListener('DOMContentLoaded', () => {
    initIndexedDB().catch(err => console.error('Error inicializando IndexedDB:', err));
});

// ========== CALIFICACIONES ==========
async function guardarCalificacion(entry) {
    await initIndexedDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['calificaciones'], 'readwrite');
        const store = tx.objectStore('calificaciones');
        const data = Object.assign({}, entry, { timestamp: new Date().toISOString() });
        const req = store.add(data);
        req.onerror = () => reject(req.error);
        req.onsuccess = (e) => {
            data.id = e.target.result;
            resolve(data);
        };
    });
}

async function cargarCalificacionesPorAlumno(alumnoId) {
    await initIndexedDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['calificaciones'], 'readonly');
        const store = tx.objectStore('calificaciones');
        const req = store.getAll();
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve((req.result || []).filter(r => r.alumnoId === alumnoId));
    });
}

async function cargarCalificacionesPorGrupo(grupoId) {
    await initIndexedDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['calificaciones'], 'readonly');
        const store = tx.objectStore('calificaciones');
        const req = store.getAll();
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve((req.result || []).filter(r => r.grupoId === grupoId));
    });
}

async function exportarCalificaciones() {
    await initIndexedDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['calificaciones'], 'readonly');
        const store = tx.objectStore('calificaciones');
        const req = store.getAll();
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result || []);
    });
}

async function actualizarCalificacion(entry) {
    await initIndexedDB();
    return new Promise((resolve, reject) => {
        if (!entry || !entry.id) return reject(new Error('Entry.id requerido para actualizar'));
        const tx = db.transaction(['calificaciones'], 'readwrite');
        const store = tx.objectStore('calificaciones');
        const data = Object.assign({}, entry, { timestamp: new Date().toISOString() });
        const req = store.put(data);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(data);
    });
}

// ---------- INVENTARIO (productos) ----------
async function guardarProducto(producto) {
    await initIndexedDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['inventario'], 'readwrite');
        const store = tx.objectStore('inventario');
        const data = Object.assign({}, producto, { timestamp: new Date().toISOString() });
        const req = store.add(data);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
            data.id = req.result;
            resolve(data);
        };
    });
}

async function cargarProductos() {
    await initIndexedDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['inventario'], 'readonly');
        const store = tx.objectStore('inventario');
        const req = store.getAll();
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result || []);
    });
}

async function obtenerProductoPorId(id) {
    await initIndexedDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['inventario'], 'readonly');
        const store = tx.objectStore('inventario');
        const req = store.get(id);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result || null);
    });
}

async function actualizarProducto(producto) {
    await initIndexedDB();
    return new Promise((resolve, reject) => {
        if (!producto || !producto.id) return reject(new Error('Producto.id requerido'));
        const tx = db.transaction(['inventario'], 'readwrite');
        const store = tx.objectStore('inventario');
        const data = Object.assign({}, producto, { timestamp: new Date().toISOString() });
        const req = store.put(data);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(data);
    });
}

async function eliminarProducto(id) {
    await initIndexedDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['inventario'], 'readwrite');
        const store = tx.objectStore('inventario');
        const req = store.delete(id);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve();
    });
}

async function exportarInventario() {
    await initIndexedDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['inventario'], 'readonly');
        const store = tx.objectStore('inventario');
        const req = store.getAll();
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result || []);
    });
}
// ---------- HORARIOS ----------
async function cargarHorarios() {
    await initIndexedDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['horarios'], 'readonly');
        const store = transaction.objectStore('horarios');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function agregarHorario(horario) {
    await initIndexedDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['horarios'], 'readwrite');
        const store = transaction.objectStore('horarios');
        const request = store.add(horario);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function eliminarHorario(id) {
    await initIndexedDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['horarios'], 'readwrite');
        const store = transaction.objectStore('horarios');
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

async function inicializarHorariosPorDefecto() {
    const horarios = await cargarHorarios();
    if (horarios.length === 0) {
        const defaults = [
            { nombre: 'SÁBADO 8 AM - 12 PM' },
            { nombre: 'SÁBADO 12 PM - 4 PM' },
            { nombre: 'DOMINGO 8 AM - 12 PM' },
            { nombre: 'DOMINGO 12 PM - 4 PM' }
        ];
        for (const h of defaults) {
            await agregarHorario(h);
        }
    }
}
// Función para verificar y agregar usuario por defecto
async function verificarUsuarioPorDefecto() {
    try {
        console.log('Verificando usuario por defecto...');
        const existingUser = await obtenerUsuarioLogin('AdminCepci01');
        console.log('Usuario existente:', existingUser);
        
        if (!existingUser) {
            console.log('Agregando usuario por defecto...');
            const defaultPerms = {};
            LOGIN_MODULES.forEach(m => defaultPerms[m] = true);
            await agregarUsuarioLogin({ username: 'AdminCepci01', password: 'AdministracionCepci', permissions: defaultPerms });
            console.log('Usuario por defecto AdminCepci01 agregado exitosamente');
        } else {
            console.log('Usuario por defecto ya existe');
        }
    } catch (error) {
        console.error('Error verificando usuario por defecto:', error);
        // Intentar agregar de todas formas usando put en lugar de add
        try {
            console.log('Intentando agregar usuario por defecto con put...');
            const tx = db.transaction(['login_usuarios'], 'readwrite');
            const store = tx.objectStore('login_usuarios');
            const request = store.put({ username: 'AdminCepci01', password: 'AdministracionCepci' });
            await new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    console.log('Usuario por defecto agregado con put');
                    resolve();
                };
                request.onerror = () => {
                    console.error('Error con put:', request.error);
                    reject(request.error);
                };
            });
        } catch (forceError) {
            console.error('Error forzando agregar usuario:', forceError);
        }
    }
}