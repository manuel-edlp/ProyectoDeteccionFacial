import csv
import json
import cv2
from flask import Flask, request, jsonify, render_template, send_from_directory, send_file, session
import dlib
from PIL import Image
import numpy as np
import io
import os
import re
import imutils
from imutils import build_montages
import zipfile
import shutil
from tensorflow import keras
from keras.layers import Dense
from keras.models import Sequential, load_model, model_from_json
import time
from paz.applications import HaarCascadeFrontalFace, MiniXceptionFER
import paz.processors as pr
import argparse
import pickle
from sklearn.cluster import DBSCAN
from paz.backend.image import load_image
import imghdr
import face_recognition
import tensorflow as tf
import threading
from datetime import datetime

IS_HF = "SPACE_ID" in os.environ

# Locks globales
lock_dlib = threading.Lock()
lock_fer = threading.Lock()

if IS_HF:
    print("--- Configurando TensorFlow para entorno PRODUCCIÓN (HF) ---")
    tf.config.threading.set_intra_op_parallelism_threads(2)
    tf.config.threading.set_inter_op_parallelism_threads(2)
else:
    print("--- Configurando TensorFlow para entorno LOCAL (Alto Rendimiento) ---")


# --- HELPER DE AISLAMIENTO ---
def get_user_workdir():
    """
    Obtiene el ID de sesión del header y retorna la ruta base de trabajo.
    Valida que el ID sea alfanumérico para evitar Directory Traversal.
    """
    sid = request.headers.get('X-Session-ID', 'default_user')
    # Sanitización: solo permitimos alfanuméricos y guiones
    sid = re.sub(r'[^a-zA-Z0-9_\-]', '', sid)
    
    base_path = os.path.join('outputs', sid)
    if not os.path.exists(base_path):
        os.makedirs(base_path, exist_ok=True)
    return base_path, sid


# Variables globales para conservar modelos en memoria (RAM)
_MODELO_CNN_DLIB = None
_MODELO_EMOCIONES_TF = None

# Ruta base de outputs
BASE_OUTPUTS = 'outputs'
EXAMPLES_ROOT = 'examples'
SESSION_STATE_FILENAME = 'session_state.json'
EMOTION_CLASSES = ['enfadado', 'asqueado', 'miedo', 'feliz', 'neutral', 'triste', 'sorprendido']
DEFAULT_OPTIONS = {
    "vj": {"scaleFactor": 1.1, "minNeighbors": 4, "minSize": 30},
    "cnn": {"resizeWidth": 800, "upsampleTimes": 1},
    "hog": {"upsampleTimes": 1},
    "clustering": {"eps": 0.55, "minSamples": 2},
}

# Cargamos el clasificador una sola vez al inicio del servidor
FACE_CASCADE = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')

def get_dlib_cnn_model():
    """
    Carga el modelo pesado de DLIB una sola vez en la memoria.
    """
    global _MODELO_CNN_DLIB
    if _MODELO_CNN_DLIB is None:
        with lock_dlib:
            if _MODELO_CNN_DLIB is None: # Doble chequeo
                print("[*] Levantando modelo DLIB CNN por primera vez...")
                _MODELO_CNN_DLIB = dlib.cnn_face_detection_model_v1("mmod_human_face_detector.dat")
    return _MODELO_CNN_DLIB

def get_fer_model():
    """
    Carga el modelo de TensorFlow una sola vez en la memoria RAM evitando OOM.
    """
    global _MODELO_EMOCIONES_TF
    if _MODELO_EMOCIONES_TF is None:
        with lock_fer:
            if _MODELO_EMOCIONES_TF is None: # Doble chequeo
                print("[*] Levantando modelo Keras FER_model.h5 por primera vez...")
                _MODELO_EMOCIONES_TF = load_model('FER_model.h5')
    return _MODELO_EMOCIONES_TF


ALLOW_CNN_ZIP = False

def is_valid_image(file_stream):
    header = file_stream.read(512)
    file_stream.seek(0)
    format = imghdr.what(None, header)
    return format in ['jpeg', 'png', 'bmp', 'gif', 'webp']

def get_images_from_request(req, allow_zip=True):
    images = []
    for key in req.files:
        for f in req.files.getlist(key):
            if f.filename == '': continue
            
            if f.filename.lower().endswith('.zip'):
                if not allow_zip:
                    raise ValueError("No se permite ZIP para CNN debido a carga computacional.")
                with zipfile.ZipFile(f, 'r') as zip_ref:
                    for zinfo in zip_ref.infolist():
                        if not zinfo.is_dir():
                            file_bytes = zip_ref.read(zinfo.filename)
                            if imghdr.what(None, file_bytes[:512]) in ['jpeg', 'png', 'bmp', 'webp']:
                                basename = os.path.basename(zinfo.filename)
                                if basename:
                                    images.append((basename, file_bytes))
            else:
                if is_valid_image(f):
                    images.append((f.filename, f.read()))
                f.seek(0)
    return images


app = Flask(__name__, static_folder='static', template_folder='templates')


def sanitize_session_id(raw_sid, default='default_user'):
    safe_sid = re.sub(r'[^a-zA-Z0-9_\-]', '', raw_sid or '')
    return safe_sid or default


def utc_now_iso():
    return datetime.utcnow().replace(microsecond=0).isoformat() + 'Z'


def ensure_dir(path):
    os.makedirs(path, exist_ok=True)
    return path


def safe_remove_path(path):
    if os.path.isdir(path):
        shutil.rmtree(path)
    elif os.path.exists(path):
        os.remove(path)


def clear_directory(path):
    safe_remove_path(path)
    os.makedirs(path, exist_ok=True)
    return path


def get_safe_examples_path(raw_path=''):
    relative_path = (raw_path or '').replace('\\', '/').strip('/')
    normalized = os.path.normpath(relative_path) if relative_path else ''
    if normalized in ('.', ''):
        normalized = ''
    if normalized.startswith('..'):
        return None, None

    root_abs = os.path.abspath(EXAMPLES_ROOT)
    target_abs = os.path.abspath(os.path.join(root_abs, normalized))
    if not target_abs.startswith(root_abs):
        return None, None

    return normalized.replace('\\', '/'), target_abs


def coerce_float(value, default, minimum=None, maximum=None):
    try:
        coerced = float(value)
    except (TypeError, ValueError):
        coerced = float(default)

    if minimum is not None:
        coerced = max(minimum, coerced)
    if maximum is not None:
        coerced = min(maximum, coerced)
    return coerced


def coerce_int(value, default, minimum=None, maximum=None):
    try:
        coerced = int(float(value))
    except (TypeError, ValueError):
        coerced = int(default)

    if minimum is not None:
        coerced = max(minimum, coerced)
    if maximum is not None:
        coerced = min(maximum, coerced)
    return coerced


def parse_json_field(raw_value, default=None):
    if not raw_value:
        return default if default is not None else {}
    try:
        return json.loads(raw_value)
    except (TypeError, ValueError, json.JSONDecodeError):
        return default if default is not None else {}


def get_request_payload():
    return request.get_json(silent=True) or {}


def get_user_workdir():
    sid = sanitize_session_id(request.headers.get('X-Session-ID', 'default_user'))
    base_path = ensure_dir(os.path.join(BASE_OUTPUTS, sid))
    return base_path, sid


def get_user_paths():
    sid = sanitize_session_id(request.headers.get('X-Session-ID', 'default'))
    user_path = ensure_dir(os.path.join(BASE_OUTPUTS, sid))
    return sid, user_path


def build_api_payload(status, message_key=None, message=None, **extra):
    payload = {"status": status}
    if message_key:
        payload["message_key"] = message_key
    if message:
        payload["message"] = message
    payload.update(extra)
    return payload


def default_session_state(sid):
    return {
        "session_id": sid,
        "created_at": utc_now_iso(),
        "updated_at": utc_now_iso(),
        "runs": {
            "detections": [],
            "clustering": [],
            "emotions": [],
        },
        "summary": {},
    }


def get_session_state_path(workdir):
    return os.path.join(workdir, SESSION_STATE_FILENAME)


def get_directory_stats(path):
    total_bytes = 0
    file_count = 0
    for root, _, files in os.walk(path):
        for filename in files:
            full_path = os.path.join(root, filename)
            try:
                total_bytes += os.path.getsize(full_path)
                file_count += 1
            except OSError:
                continue
    return total_bytes, file_count


def load_session_state(workdir, sid):
    state_path = get_session_state_path(workdir)
    if not os.path.exists(state_path):
        return default_session_state(sid)

    try:
        with open(state_path, 'r', encoding='utf-8') as fh:
            state = json.load(fh)
    except (OSError, ValueError, json.JSONDecodeError):
        return default_session_state(sid)

    state.setdefault("session_id", sid)
    state.setdefault("created_at", utc_now_iso())
    state.setdefault("updated_at", utc_now_iso())
    state.setdefault("runs", {})
    state["runs"].setdefault("detections", [])
    state["runs"].setdefault("clustering", [])
    state["runs"].setdefault("emotions", [])
    state.setdefault("summary", {})
    return state


def rebuild_session_summary(state, workdir):
    detection_runs = state.get("runs", {}).get("detections", [])
    clustering_runs = state.get("runs", {}).get("clustering", [])
    emotion_runs = state.get("runs", {}).get("emotions", [])

    detection_summary = {
        "runs_count": len(detection_runs),
        "images_processed": 0,
        "faces_detected": 0,
        "images_with_faces": 0,
        "images_without_faces": 0,
        "max_faces_single_image": 0,
        "avg_faces_per_image": 0.0,
        "methods_used": [],
        "by_method": {},
    }

    for run in detection_runs:
        method = run.get("method", "unknown")
        method_bucket = detection_summary["by_method"].setdefault(method, {
            "runs_count": 0,
            "images_processed": 0,
            "faces_detected": 0,
            "processing_time_sec": 0.0,
            "average_confidence": None,
            "confidence_sum": 0.0,
            "confidence_count": 0,
        })

        detection_summary["images_processed"] += run.get("images_processed", 0)
        detection_summary["faces_detected"] += run.get("faces_detected", 0)
        detection_summary["images_with_faces"] += run.get("images_with_faces", 0)
        detection_summary["images_without_faces"] += run.get("images_without_faces", 0)
        detection_summary["max_faces_single_image"] = max(
            detection_summary["max_faces_single_image"],
            run.get("max_faces_single_image", 0),
        )

        method_bucket["runs_count"] += run.get("runs_count", 1)
        method_bucket["images_processed"] += run.get("images_processed", 0)
        method_bucket["faces_detected"] += run.get("faces_detected", 0)
        method_bucket["processing_time_sec"] += run.get("processing_time_sec", 0.0)
        method_bucket["confidence_sum"] += run.get("confidence_sum", 0.0)
        method_bucket["confidence_count"] += run.get("confidence_count", 0)

    for bucket in detection_summary["by_method"].values():
        if bucket["confidence_count"] > 0:
            bucket["average_confidence"] = round(
                bucket["confidence_sum"] / bucket["confidence_count"], 4
            )
        bucket["processing_time_sec"] = round(bucket["processing_time_sec"], 3)
        bucket.pop("confidence_sum", None)
        bucket.pop("confidence_count", None)

    detection_summary["methods_used"] = sorted(detection_summary["by_method"].keys())
    if detection_summary["images_processed"] > 0:
        detection_summary["avg_faces_per_image"] = round(
            detection_summary["faces_detected"] / detection_summary["images_processed"], 3
        )

    last_clustering = clustering_runs[-1] if clustering_runs else None
    last_emotions = emotion_runs[-1] if emotion_runs else None
    total_processing_time = sum(run.get("processing_time_sec", 0.0) for run in detection_runs)
    total_processing_time += sum(run.get("processing_time_sec", 0.0) for run in clustering_runs)
    total_processing_time += sum(run.get("processing_time_sec", 0.0) for run in emotion_runs)
    storage_bytes, total_files = get_directory_stats(workdir)

    state["summary"] = {
        "session": {
            "created_at": state.get("created_at"),
            "updated_at": state.get("updated_at"),
            "storage_bytes": storage_bytes,
            "files_count": total_files,
            "total_processing_time_sec": round(total_processing_time, 3),
            "total_runs": len(detection_runs) + len(clustering_runs) + len(emotion_runs),
        },
        "detection": detection_summary,
        "clustering": last_clustering,
        "emotions": last_emotions,
    }
    return state


def save_session_state(workdir, state):
    state["updated_at"] = utc_now_iso()
    rebuild_session_summary(state, workdir)
    with open(get_session_state_path(workdir), 'w', encoding='utf-8') as fh:
        json.dump(state, fh, indent=2, ensure_ascii=False)


def append_session_run(workdir, sid, bucket_name, run_data, max_runs=25):
    state = load_session_state(workdir, sid)
    state["runs"].setdefault(bucket_name, [])
    state["runs"][bucket_name].append(run_data)
    state["runs"][bucket_name] = state["runs"][bucket_name][-max_runs:]
    save_session_state(workdir, state)
    return state


def parse_detector_options(method, raw_options):
    raw_options = raw_options or {}

    if method == "vj":
        return {
            "scaleFactor": round(coerce_float(raw_options.get("scaleFactor"), 1.1, 1.01, 2.0), 2),
            "minNeighbors": coerce_int(raw_options.get("minNeighbors"), 4, 1, 20),
            "minSize": coerce_int(raw_options.get("minSize"), 30, 10, 500),
        }
    if method == "cnn":
        return {
            "resizeWidth": coerce_int(raw_options.get("resizeWidth"), 800, 320, 2400),
            "upsampleTimes": coerce_int(raw_options.get("upsampleTimes"), 1, 0, 3),
        }
    if method == "hog":
        return {
            "upsampleTimes": coerce_int(raw_options.get("upsampleTimes"), 1, 0, 4),
        }
    return DEFAULT_OPTIONS.get(method, {}).copy()


def parse_clustering_options(raw_options):
    raw_options = raw_options or {}
    return {
        "eps": round(coerce_float(raw_options.get("eps"), 0.55, 0.1, 1.5), 2),
        "minSamples": coerce_int(raw_options.get("minSamples"), 2, 2, 20),
    }


def build_csv_string(rows, fieldnames):
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=fieldnames)
    writer.writeheader()
    for row in rows:
        writer.writerow(row)
    return buffer.getvalue()


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/examples', methods=['GET'])
def api_examples():
    relative_path, target_abs = get_safe_examples_path(request.args.get('path', ''))
    root_abs = os.path.abspath(EXAMPLES_ROOT)

    if target_abs is None:
        return jsonify({"error": "Ruta de examples inválida"}), 400
    if not os.path.exists(root_abs):
        return jsonify({"path": "", "parent_path": None, "breadcrumbs": [], "folders": [], "files": []})
    if not os.path.isdir(target_abs):
        return jsonify({"error": "La carpeta solicitada no existe"}), 404

    entries = sorted(os.listdir(target_abs), key=lambda value: value.lower())
    folders = []
    files = []
    allowed_extensions = ('.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif')

    for entry in entries:
        entry_abs = os.path.join(target_abs, entry)
        entry_rel = f"{relative_path}/{entry}" if relative_path else entry
        if os.path.isdir(entry_abs):
            folders.append({"name": entry, "path": entry_rel.replace('\\', '/')})
        elif entry.lower().endswith(allowed_extensions):
            files.append({
                "name": entry,
                "path": entry_rel.replace('\\', '/'),
                "url": f"/api/examples/file/{entry_rel.replace(os.sep, '/')}",
            })

    segments = [segment for segment in relative_path.split('/') if segment] if relative_path else []
    breadcrumbs = [{"name": "examples", "path": ""}]
    current = []
    for segment in segments:
        current.append(segment)
        breadcrumbs.append({"name": segment, "path": '/'.join(current)})

    parent_path = '/'.join(segments[:-1]) if segments else None
    return jsonify({
        "path": relative_path,
        "parent_path": parent_path,
        "breadcrumbs": breadcrumbs,
        "folders": folders,
        "files": files,
    })


@app.route('/api/examples/file/<path:relative_path>', methods=['GET'])
def api_example_file(relative_path):
    safe_path, target_abs = get_safe_examples_path(relative_path)
    if target_abs is None or safe_path is None:
        return "Ruta de example inválida", 400
    if not os.path.isfile(target_abs):
        return "Archivo no encontrado", 404
    # send_file with absolute path is more robust on Windows than send_from_directory
    return send_file(target_abs)

# --- EXPLORADOR DE ARCHIVOS ---
@app.route('/api/explorar', methods=['GET'])
def explorar_carpetas():
    # 1. Obtenemos el ID de sesión y la ruta privada del usuario
    sid = request.headers.get('X-Session-ID', 'default_user')
    sid = re.sub(r'[^a-zA-Z0-9_\-]', '', sid) # Sanitización de seguridad
    user_workdir = os.path.join('outputs', sid)
    
    # Aseguramos que la carpeta raíz del usuario exista
    if not os.path.exists(user_workdir):
        os.makedirs(user_workdir, exist_ok=True)

    # Carpetas raíz que monitoreamos dentro de la sesión
    directorios = ['vj_images', 'cnn_images', 'hog_images', 'emociones_clasificadas', 'clustered_faces']
    estructura = {}
    
    for dir_raiz in directorios:
        # 2. Construimos la ruta apuntando a la carpeta del usuario
        ruta_absoluta_raiz = os.path.join(user_workdir, dir_raiz)
        
        if os.path.exists(ruta_absoluta_raiz):
            # Listamos subcarpetas del usuario
            subdirs = [d for d in os.listdir(ruta_absoluta_raiz) 
                      if os.path.isdir(os.path.join(ruta_absoluta_raiz, d))]
            
            detalles_subdirs = []
            for subdir in subdirs:
                ruta_completa = os.path.join(ruta_absoluta_raiz, subdir)
                # Contamos imágenes solo en la carpeta del usuario
                conteo = len([f for f in os.listdir(ruta_completa) 
                             if os.path.isfile(os.path.join(ruta_completa, f)) 
                             and f.lower().endswith(('.png', '.jpg', '.jpeg'))])
                
                detalles_subdirs.append({
                    'nombre': subdir,
                    'conteo': conteo
                })
            estructura[dir_raiz] = detalles_subdirs
        else:
            # Si el usuario aún no creó esta categoría, devolvemos lista vacía
            estructura[dir_raiz] = []
            
    return jsonify(estructura)

@app.route('/api/listar_imagenes/<path:ruta_relativa>', methods=['GET'])
def listar_imagenes(ruta_relativa):
    # 1. Obtenemos el SID y la ruta base del usuario
    sid, user_path = get_user_paths() 
    
    # 2. Seguridad: Evitar que usen ".." para subir de nivel en el directorio
    ruta_relativa = ruta_relativa.replace('..', '')
    
    # 3. Construimos la ruta real: outputs/sess_123/vj_images/nombre_proceso
    ruta_real = os.path.join(user_path, ruta_relativa)
    
    # 4. Verificación física en el servidor
    if os.path.exists(ruta_real) and os.path.isdir(ruta_real):
        # Listamos solo archivos de imagen
        archivos = [f for f in os.listdir(ruta_real) 
                   if f.lower().endswith(('.png', '.jpg', '.jpeg'))]
        
        # Ordenamos alfabéticamente para que la galería sea consistente
        archivos.sort()
        
        return jsonify({
            "ruta_base": ruta_relativa, # El front necesita la relativa para armar la URL final
            "archivos": archivos
        })
    
    return jsonify({"error": f"No se encontró la carpeta: {ruta_relativa}"}), 404

def get_user_paths():
    sid = request.headers.get('X-Session-ID', 'default')
    sid = re.sub(r'[^a-zA-Z0-9_\-]', '', sid) # Solo caracteres seguros
    user_path = os.path.join('outputs', sid)
    if not os.path.exists(user_path):
        os.makedirs(user_path, exist_ok=True)
    return sid, user_path


@app.route('/api/eliminar', methods=['POST'])
def eliminar_carpeta():
    # 1. Obtenemos el directorio de trabajo absoluto y normalizado
    workdir, _ = get_user_workdir()
    workdir_abs = os.path.abspath(workdir)
    
    data = get_request_payload()
    # Limpiamos la ruta que viene del front
    ruta_relativa = data.get('ruta', '').strip().lstrip('/')
    
    if not ruta_relativa:
        return jsonify({"error": "No se especificó una ruta válida"}), 400

    # 2. Construimos la ruta absoluta de lo que se quiere borrar
    # Usamos normpath para arreglar mezclas de / y \
    ruta_objetivo_abs = os.path.abspath(os.path.normpath(os.path.join(workdir_abs, ruta_relativa)))
    
    # 3. LOG DE DEPURACIÓN (Opcional: sacalo cuando funcione)
    # print(f"DEBUG: Workdir: {workdir_abs}")
    # print(f"DEBUG: Objetivo: {ruta_objetivo_abs}")

    # 4. VALIDACIÓN DE SEGURIDAD
    # Verificamos que la ruta objetivo esté REALMENTE dentro del workdir
    if os.path.exists(ruta_objetivo_abs) and ruta_objetivo_abs.startswith(workdir_abs):
        try:
            # Si es un archivo se borra con os.remove, si es carpeta con rmtree
            if os.path.isdir(ruta_objetivo_abs):
                shutil.rmtree(ruta_objetivo_abs)
            else:
                os.remove(ruta_objetivo_abs)
                
            return jsonify({"status": "success", "mensaje": f"Eliminado: {ruta_relativa}"})
        except Exception as e:
            return jsonify({"error": f"Error al eliminar: {str(e)}"}), 500
            
    # Si llega acá es porque startswith falló (intento de escape o error de ruta)
    return jsonify({"error": "Acceso denegado o ruta inexistente"}), 403

@app.route('/api/renombrar', methods=['POST'])
def renombrar_carpeta():
    # 1. Obtenemos el directorio de trabajo absoluto
    workdir, _ = get_user_workdir()
    workdir_abs = os.path.abspath(workdir)
    
    data = request.json
    ruta_relativa_actual = data.get('ruta_actual', '').strip().lstrip('/')
    nuevo_nombre = data.get('nuevo_nombre', '').strip()

    # 2. Construimos y normalizamos la ruta actual
    ruta_actual_abs = os.path.abspath(os.path.join(workdir_abs, ruta_relativa_actual))

    # 3. VALIDACIONES DE SEGURIDAD
    # Verificar que la ruta exista y pertenezca al usuario
    if not os.path.exists(ruta_actual_abs) or not ruta_actual_abs.startswith(workdir_abs):
        return jsonify({"error": "Ruta inválida o acceso denegado"}), 400
        
    # Validar que el nuevo nombre sea seguro (sin slashes, solo texto/números)
    if not nuevo_nombre or not re.match(r'^[a-zA-Z0-9_\- ]+$', nuevo_nombre):
        return jsonify({"error": "El nuevo nombre contiene caracteres no permitidos"}), 400

    # 4. Construir la nueva ruta (en el mismo directorio padre)
    directorio_padre = os.path.dirname(ruta_actual_abs)
    nueva_ruta_abs = os.path.abspath(os.path.join(directorio_padre, nuevo_nombre))

    # 5. VALIDACIÓN FINAL DE DESTINO
    # Aseguramos que la nueva ruta siga estando dentro del workdir (doble check)
    if not nueva_ruta_abs.startswith(workdir_abs):
        return jsonify({"error": "Operación de escape de directorio detectada"}), 403

    # Verificar que no exista ya una carpeta con ese nombre
    if os.path.exists(nueva_ruta_abs):
        return jsonify({"error": "Ya existe una carpeta con ese nombre"}), 409

    try:
        os.rename(ruta_actual_abs, nueva_ruta_abs)
        return jsonify({"status": "success", "mensaje": "Carpeta renombrada con éxito"})
    except Exception as e:
        return jsonify({"error": f"Error del sistema: {str(e)}"}), 500

# --- SERVIR IMÁGENES (DINÁMICO Y PROTEGIDO) ---
@app.route('/outputs/<sid>/<path:filename>')
def serve_outputs(sid, filename):
    # 1. Validación de formato del SID (Seguridad contra Inyección)
    if not re.match(r'^[a-zA-Z0-9_\-]+$', sid):
        return "ID de sesión inválido", 400

    # 2. Validación de Identidad
    # Solo permitimos ver la imagen si el Header coincide con el SID de la URL
    client_sid = request.headers.get('X-Session-ID')
    if client_sid and client_sid != sid:
        return "Acceso denegado: No puedes ver datos de otra sesión", 403

    # 3. Construcción segura del path
    # Usamos os.path.abspath para garantizar que estamos en el lugar correcto
    base_dir = os.path.abspath('outputs')
    user_dir = os.path.join(base_dir, sid)

    # 4. Envío seguro
    # send_from_directory previene ataques de ".." por defecto, pero 
    # especificar el directorio base absoluto es la mejor práctica.
    try:
        return send_from_directory(user_dir, filename)
    except FileNotFoundError:
        return "Imagen no encontrada", 404


@app.route('/api/metricas', methods=['GET'])
def api_metricas():
    workdir, sid = get_user_workdir()
    state = load_session_state(workdir, sid)
    rebuild_session_summary(state, workdir)
    return jsonify(build_api_payload(
        'success',
        'metrics_loaded',
        state=state,
        defaults=DEFAULT_OPTIONS,
    ))


@app.route('/api/exportar', methods=['GET'])
def api_exportar():
    workdir, sid = get_user_workdir()
    state = load_session_state(workdir, sid)
    rebuild_session_summary(state, workdir)

    if not os.path.exists(workdir):
        return jsonify(build_api_payload(
            'error',
            'export_no_data',
            error='No hay datos para exportar en esta sesiÃ³n.',
        )), 404

    detection_runs = state.get('runs', {}).get('detections', [])
    clustering_runs = state.get('runs', {}).get('clustering', [])
    emotion_runs = state.get('runs', {}).get('emotions', [])

    buffer = io.BytesIO()
    timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')

    with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as zip_buffer:
        zip_buffer.writestr(
            'session_metrics.json',
            json.dumps(state, indent=2, ensure_ascii=False),
        )

        if detection_runs:
            detection_rows = [{
                'timestamp': run.get('timestamp'),
                'method': run.get('method'),
                'images_processed': run.get('images_processed'),
                'faces_detected': run.get('faces_detected'),
                'images_with_faces': run.get('images_with_faces'),
                'images_without_faces': run.get('images_without_faces'),
                'avg_faces_per_image': run.get('avg_faces_per_image'),
                'max_faces_single_image': run.get('max_faces_single_image'),
                'processing_time_sec': run.get('processing_time_sec'),
                'average_confidence': run.get('average_confidence'),
            } for run in detection_runs]
            zip_buffer.writestr(
                'detection_runs.csv',
                build_csv_string(detection_rows, list(detection_rows[0].keys())),
            )

        if clustering_runs:
            clustering_rows = [{
                'timestamp': run.get('timestamp'),
                'status': run.get('status'),
                'source': run.get('source'),
                'candidate_faces': run.get('candidate_faces'),
                'encodings_extracted': run.get('encodings_extracted'),
                'clusters_count': run.get('clusters_count'),
                'clustered_faces': run.get('clustered_faces'),
                'noise_faces': run.get('noise_faces'),
                'largest_cluster_size': run.get('largest_cluster_size'),
                'avg_cluster_size': run.get('avg_cluster_size'),
                'eps': (run.get('parameters') or {}).get('eps'),
                'min_samples': (run.get('parameters') or {}).get('minSamples'),
                'processing_time_sec': run.get('processing_time_sec'),
            } for run in clustering_runs]
            zip_buffer.writestr(
                'clustering_runs.csv',
                build_csv_string(clustering_rows, list(clustering_rows[0].keys())),
            )

        if emotion_runs:
            emotion_rows = []
            for run in emotion_runs:
                distribution = run.get('distribution', {})
                for emotion_name, count in distribution.items():
                    emotion_rows.append({
                        'timestamp': run.get('timestamp'),
                        'source': run.get('source'),
                        'emotion': emotion_name,
                        'count': count,
                        'percentage': (run.get('percentages') or {}).get(emotion_name, 0),
                        'average_confidence': (run.get('average_confidence_by_emotion') or {}).get(emotion_name),
                    })
            if emotion_rows:
                zip_buffer.writestr(
                    'emotion_distribution.csv',
                    build_csv_string(emotion_rows, list(emotion_rows[0].keys())),
                )

        for root, _, files in os.walk(workdir):
            for filename in files:
                full_path = os.path.join(root, filename)
                rel_path = os.path.relpath(full_path, workdir)
                zip_buffer.write(full_path, os.path.join('outputs', rel_path))

    buffer.seek(0)
    return send_file(
        buffer,
        mimetype='application/zip',
        as_attachment=True,
        download_name=f'aicr_session_{sid}_{timestamp}.zip',
    )


@app.route('/api/session/cleanup', methods=['POST'])
def api_session_cleanup():
    payload = get_request_payload()
    sid_from_header = sanitize_session_id(request.headers.get('X-Session-ID', ''), '')
    sid_from_body = sanitize_session_id(payload.get('sid', ''), '') if payload else ''

    if sid_from_header and sid_from_body and sid_from_header != sid_from_body:
        return jsonify(build_api_payload(
            'error',
            'cleanup_invalid_session',
            error='ID de sesiÃ³n inconsistente.',
        )), 400

    sid = sid_from_header or sid_from_body
    if not sid:
        return jsonify(build_api_payload(
            'error',
            'cleanup_missing_session',
            error='No se recibiÃ³ una sesiÃ³n para limpiar.',
        )), 400

    base_outputs_abs = os.path.abspath(BASE_OUTPUTS)
    target_dir = os.path.abspath(os.path.join(BASE_OUTPUTS, sid))

    if not target_dir.startswith(base_outputs_abs):
        return jsonify(build_api_payload(
            'error',
            'cleanup_invalid_session',
            error='Ruta de sesiÃ³n invÃ¡lida.',
        )), 400

    if os.path.exists(target_dir):
        shutil.rmtree(target_dir)

    return jsonify(build_api_payload(
        'success',
        'cleanup_completed',
        session_id=sid,
    ))

# --- LÓGICA DE PROCESAMIENTO ---
def guardar_en_sesion(img_orig, img_rec, nombre_archivo, rostros, subcarpeta_tipo):
    # 1. Obtenemos el directorio de trabajo del usuario
    workdir, _ = get_user_workdir()
    
    # 2. Aseguramos que la carpeta de categoría (ej: vj_images) exista
    raiz_tipo = os.path.join(workdir, subcarpeta_tipo)
    os.makedirs(raiz_tipo, exist_ok=True)
    
    # 3. Sanitizar el nombre del archivo (quitar espacios y caracteres raros)
    nombre_limpio = re.sub(r'[^a-zA-Z0-9_\-]', '_', os.path.splitext(nombre_archivo)[0])
    
    # 4. Lógica de evitar duplicados
    idx = 0
    while True:
        nombre_carpeta = f"{nombre_limpio}_{idx}" if idx > 0 else nombre_limpio
        target_abs = os.path.join(raiz_tipo, nombre_carpeta)
        if not os.path.exists(target_abs):
            os.makedirs(target_abs)
            break
        idx += 1
    
    # 5. Escritura física de archivos
    cv2.imwrite(os.path.join(target_abs, 'imagen.jpg'), img_rec)
    
    for i, (x, y, w, h) in enumerate(rostros):
        # Aseguramos que el recorte esté dentro de los límites de la imagen
        y1, y2 = max(0, y), min(img_orig.shape[0], y + h)
        x1, x2 = max(0, x), min(img_orig.shape[1], x + w)
        
        recorte = img_orig[y1:y2, x1:x2]
        if recorte.size > 0:
            cv2.imwrite(os.path.join(target_abs, f'rostro_{i}.jpg'), recorte)
            
    # 6. Retornamos la ruta RELATIVA respecto al workdir 
    # Esto es vital para que el JSON que recibe el Front sea "vj_images/foto_0"
    return os.path.join(subcarpeta_tipo, nombre_carpeta)



@app.route('/procesar/clustering', methods=['POST'])
def api_cluster_faces():
    # 1. Obtenemos el contexto de sesión
    workdir, sid = get_user_workdir()
    
    data = get_request_payload()
    fuente = data.get("fuente", "todas")
    clustering_options = parse_clustering_options(data.get("options", {}))
    
    # 2. Definimos los orígenes SIEMPRE dentro del workdir del usuario
    posibles_fuentes = ["vj_images", "cnn_images", "hog_images"]
    
    if fuente == "todas":
        origenes = [os.path.join(workdir, d) for d in posibles_fuentes]
    else:
        # Validamos que la fuente solicitada sea una de las permitidas
        if fuente not in posibles_fuentes:
            return jsonify(build_api_payload(
                'error',
                'invalid_source',
                error='Fuente no permitida.',
            )), 400
        origenes = [os.path.join(workdir, fuente)]
    
    # 3. Filtramos solo las que realmente existen (donde el usuario ya detectó rostros)
    validos = [o for o in origenes if os.path.exists(o)]
    
    if not validos:
        return jsonify(build_api_payload(
            'error',
            'clustering_missing_detections',
            error='No se encontraron detecciones previas para agrupar.',
        )), 400
    
    # 4. Pasamos el workdir a la lógica interna para que guarde en outputs/sid/clustered_faces
    try:
        metrics = clustered_faces(validos, workdir, fuente=fuente, options=clustering_options)
        metrics["timestamp"] = utc_now_iso()
        append_session_run(workdir, sid, 'clustering', metrics)

        if metrics.get("status") != 'success':
            return jsonify(build_api_payload(
                'warning',
                metrics.get("message_key", 'clustering_no_matches'),
                warning=metrics.get("message"),
                help_key='clustering_minimum_help',
                metrics=metrics,
            )), 422

        return jsonify(build_api_payload(
            'success',
            'clustering_completed',
            message='Clustering finalizado con éxito.',
            metrics=metrics,
        ))
    except Exception as e:
        return jsonify(build_api_payload(
            'error',
            'clustering_failed',
            error=f'Error en clustering: {str(e)}',
        )), 500

# --- ENDPOINT PARA EMOCIONES ---
@app.route('/procesar/emociones', methods=['POST'])
def api_emociones():
    try:
        # 1. Obtenemos el contexto de sesión
        workdir, sid = get_user_workdir()
        
        data = get_request_payload()
        fuente = data.get("fuente", "todas")
        
        posibles_fuentes = ["vj_images", "cnn_images", "hog_images"]
        
        # 2. Construimos rutas absolutas dentro del workdir del usuario
        if fuente == "todas":
            origenes_validos = [os.path.join(workdir, d) for d in posibles_fuentes 
                               if os.path.exists(os.path.join(workdir, d))]
        else:
            ruta_especifica = os.path.join(workdir, fuente)
            origenes_validos = [ruta_especifica] if os.path.exists(ruta_especifica) else []

        if not origenes_validos:
            return jsonify(build_api_payload(
                'error',
                'emotions_missing_detections',
                error='No tienes detecciones previas para analizar emociones.',
            )), 400
            
        # 3. Procesamos cada carpeta de origen
        metrics = clasificar_emociones_cnn(origenes_validos, workdir, fuente=fuente)
        metrics["timestamp"] = utc_now_iso()
        append_session_run(workdir, sid, 'emotions', metrics)

        if metrics.get("total_faces_analyzed", 0) == 0:
            return jsonify(build_api_payload(
                'warning',
                'emotions_no_faces_found',
                warning='No se encontraron rostros recortados para clasificar emociones.',
                metrics=metrics,
            )), 422

        return jsonify(build_api_payload(
            'success',
            'emotions_completed',
            message='Análisis de emociones completado para tu sesión.',
            metrics=metrics,
        ))
            
        
    except Exception as e:
        return jsonify(build_api_payload(
            'error',
            'emotions_failed',
            error=f'Error en análisis de emociones: {str(e)}',
        )), 500


def procesar_y_guardar_resultados(imagen_original, imagen_recuadros, nombre_archivo, rostros, subcarpeta_tipo):
    # 1. Obtenemos el directorio de trabajo del usuario
    workdir, _ = get_user_workdir()
    
    # 2. Definimos la raíz de la categoría dentro de la sesión (ej: outputs/sess_123/vj_images)
    raiz_categoria = os.path.join(workdir, subcarpeta_tipo)
    os.makedirs(raiz_categoria, exist_ok=True)

    # 3. Sanitización del nombre base
    nombre_base = re.sub(r'[^a-zA-Z0-9_\-]', '_', os.path.splitext(nombre_archivo)[0])
    
    # 4. Lógica de índice para evitar colisiones
    indice = 0
    while True:
        nombre_carpeta = f"{nombre_base}_{indice}" if indice > 0 else nombre_base
        ruta_absoluta = os.path.join(raiz_categoria, nombre_carpeta)
        if not os.path.exists(ruta_absoluta):
            os.makedirs(ruta_absoluta)
            break
        indice += 1

    # 5. Escritura física
    cv2.imwrite(os.path.join(ruta_absoluta, 'imagen.jpg'), imagen_recuadros)

    for i, (x, y, w, h) in enumerate(rostros):
        # Ajuste de límites para evitar recortes fuera de la matriz
        y1, y2 = max(0, y), min(imagen_original.shape[0], y + h)
        x1, x2 = max(0, x), min(imagen_original.shape[1], x + w)
        
        recorte = imagen_original[y1:y2, x1:x2]
        if recorte.size > 0:
            cv2.imwrite(os.path.join(ruta_absoluta, f'rostro_{i}.jpg'), recorte)
    
    # 6. RETORNO CLAVE: Devolvemos la ruta relativa para el Frontend
    # Ejemplo: "vj_images/foto_archivo_0"
    # Reemplazamos barras de Windows por las de URL
    ruta_relativa = os.path.join(subcarpeta_tipo, nombre_carpeta).replace("\\", "/")
    return ruta_relativa





# Endpoint ViolaJones
# clasificador como constante global para ahorrar recursos
CLASIFICADOR_VJ = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')


# Endpoint HOG
# detector HOG de dlib como global para eficiencia
HOG_DETECTOR = dlib.get_frontal_face_detector()



def build_detection_run_metrics(method, options, images_processed, faces_detected, images_with_faces,
                                max_faces_single_image, processing_time, confidence_sum=0.0,
                                confidence_count=0):
    return {
        "timestamp": utc_now_iso(),
        "method": method,
        "parameters": options,
        "images_processed": images_processed,
        "faces_detected": faces_detected,
        "images_with_faces": images_with_faces,
        "images_without_faces": images_processed - images_with_faces,
        "avg_faces_per_image": round(faces_detected / images_processed, 3) if images_processed else 0.0,
        "max_faces_single_image": max_faces_single_image,
        "processing_time_sec": round(processing_time, 3),
        "confidence_sum": round(confidence_sum, 4),
        "confidence_count": confidence_count,
        "average_confidence": round(confidence_sum / confidence_count, 4) if confidence_count else None,
    }


def build_detection_response(message_key, last_path, run_metrics):
    return jsonify(build_api_payload(
        'success',
        message_key,
        ruta_carpeta=last_path,
        metrics=run_metrics,
    ))


@app.route('/detectar_rostros/cnn', methods=['POST'])
def detectar_rostros_cnn_v3():
    workdir, sid = get_user_workdir()
    options = parse_detector_options('cnn', parse_json_field(request.form.get('options'), {}))
    start_time = time.time()

    try:
        imagenes = get_images_from_request(request, allow_zip=globals().get('ALLOW_CNN_ZIP', True))
    except ValueError as e:
        return jsonify(build_api_payload('error', 'cnn_zip_not_allowed', error=str(e))), 400

    if not imagenes:
        return jsonify(build_api_payload('error', 'no_valid_images', error='No se recibieron imágenes válidas.')), 400

    detector = get_dlib_cnn_model()
    last_path = ""
    images_processed = 0
    faces_detected = 0
    images_with_faces = 0
    max_faces_single_image = 0
    confidence_sum = 0.0
    confidence_count = 0

    for nombre_archivo, imagen_bytes in imagenes:
        imagen_cv2 = cv2.imdecode(np.frombuffer(imagen_bytes, np.uint8), cv2.IMREAD_COLOR)
        if imagen_cv2 is None:
            continue

        images_processed += 1
        alto_orig, ancho_orig = imagen_cv2.shape[:2]
        imagen_small = imutils.resize(imagen_cv2, width=options["resizeWidth"])
        alto_small, ancho_small = imagen_small.shape[:2]
        factor_x = ancho_orig / ancho_small
        factor_y = alto_orig / alto_small
        gris_small = cv2.cvtColor(imagen_small, cv2.COLOR_BGR2GRAY)

        with lock_dlib:
            detecciones = detector(gris_small, options["upsampleTimes"])

        imagen_copia = imagen_cv2.copy()
        rects_formateados = []
        for deteccion in detecciones:
            x_o = int(deteccion.rect.left() * factor_x)
            y_o = int(deteccion.rect.top() * factor_y)
            w_o = int(deteccion.rect.width() * factor_x)
            h_o = int(deteccion.rect.height() * factor_y)
            rects_formateados.append((x_o, y_o, w_o, h_o))
            cv2.rectangle(imagen_copia, (x_o, y_o), (x_o + w_o, y_o + h_o), (0, 255, 0), 2)
            if hasattr(deteccion, 'confidence'):
                confidence_sum += float(deteccion.confidence)
                confidence_count += 1

        if rects_formateados:
            images_with_faces += 1

        faces_detected += len(rects_formateados)
        max_faces_single_image = max(max_faces_single_image, len(rects_formateados))
        last_path = procesar_y_guardar_resultados(
            imagen_cv2,
            imagen_copia,
            nombre_archivo,
            rects_formateados,
            'cnn_images'
        )

    if images_processed == 0:
        return jsonify(build_api_payload('error', 'no_valid_images', error='No se pudieron decodificar imágenes válidas.')), 400

    run_metrics = build_detection_run_metrics(
        'cnn',
        options,
        images_processed,
        faces_detected,
        images_with_faces,
        max_faces_single_image,
        time.time() - start_time,
        confidence_sum=confidence_sum,
        confidence_count=confidence_count,
    )
    append_session_run(workdir, sid, 'detections', run_metrics)

    message_key = 'detection_completed' if faces_detected > 0 else 'detection_completed_no_faces'
    return build_detection_response(message_key, last_path, run_metrics)


@app.route('/detectar_rostros/vj', methods=['POST'])
def detectar_rostros_vj_v3():
    workdir, sid = get_user_workdir()
    options = parse_detector_options('vj', parse_json_field(request.form.get('options'), {}))
    start_time = time.time()

    try:
        imagenes = get_images_from_request(request, allow_zip=True)
    except ValueError as e:
        return jsonify(build_api_payload('error', 'no_valid_images', error=str(e))), 400

    if not imagenes:
        return jsonify(build_api_payload('error', 'no_valid_images', error='No se recibieron imágenes válidas.')), 400

    last_path = ""
    images_processed = 0
    faces_detected = 0
    images_with_faces = 0
    max_faces_single_image = 0

    for nombre_archivo, imagen_bytes in imagenes:
        imagen_cv2 = cv2.imdecode(np.frombuffer(imagen_bytes, np.uint8), cv2.IMREAD_COLOR)
        if imagen_cv2 is None:
            continue

        images_processed += 1
        imagen_copia = imagen_cv2.copy()
        imagen_gris = cv2.cvtColor(imagen_cv2, cv2.COLOR_BGR2GRAY)
        rostros_detectados = CLASIFICADOR_VJ.detectMultiScale(
            imagen_gris,
            scaleFactor=options["scaleFactor"],
            minNeighbors=options["minNeighbors"],
            minSize=(options["minSize"], options["minSize"])
        )

        for (x, y, w, h) in rostros_detectados:
            cv2.rectangle(imagen_copia, (x, y), (x + w, y + h), (0, 255, 0), 2)

        if len(rostros_detectados) > 0:
            images_with_faces += 1

        faces_detected += len(rostros_detectados)
        max_faces_single_image = max(max_faces_single_image, len(rostros_detectados))
        last_path = procesar_y_guardar_resultados(
            imagen_cv2,
            imagen_copia,
            nombre_archivo,
            rostros_detectados,
            'vj_images'
        )

    if images_processed == 0:
        return jsonify(build_api_payload('error', 'no_valid_images', error='No se pudieron decodificar imágenes válidas.')), 400

    run_metrics = build_detection_run_metrics(
        'vj',
        options,
        images_processed,
        faces_detected,
        images_with_faces,
        max_faces_single_image,
        time.time() - start_time,
    )
    append_session_run(workdir, sid, 'detections', run_metrics)

    message_key = 'detection_completed' if faces_detected > 0 else 'detection_completed_no_faces'
    return build_detection_response(message_key, last_path if last_path else 'vj_images', run_metrics)


@app.route('/detectar_rostros/hog', methods=['POST'])
def detectar_rostros_hog_v3():
    workdir, sid = get_user_workdir()
    options = parse_detector_options('hog', parse_json_field(request.form.get('options'), {}))
    start_time = time.time()

    try:
        imagenes = get_images_from_request(request, allow_zip=True)
    except ValueError as e:
        return jsonify(build_api_payload('error', 'no_valid_images', error=str(e))), 400

    if not imagenes:
        return jsonify(build_api_payload('error', 'no_valid_images', error='No se recibieron imágenes válidas.')), 400

    last_path = ""
    images_processed = 0
    faces_detected = 0
    images_with_faces = 0
    max_faces_single_image = 0

    for nombre_archivo, imagen_bytes in imagenes:
        imagen_cv2 = cv2.imdecode(np.frombuffer(imagen_bytes, np.uint8), cv2.IMREAD_COLOR)
        if imagen_cv2 is None:
            continue

        images_processed += 1
        imagen_copia = imagen_cv2.copy()
        imagen_gris = cv2.cvtColor(imagen_cv2, cv2.COLOR_BGR2GRAY)
        detecciones = HOG_DETECTOR(imagen_gris, options["upsampleTimes"])

        rects_formateados = []
        for rect in detecciones:
            x = rect.left()
            y = rect.top()
            w = rect.right() - x
            h = rect.bottom() - y
            rects_formateados.append((x, y, w, h))
            cv2.rectangle(imagen_copia, (x, y), (x + w, y + h), (0, 255, 0), 2)

        if rects_formateados:
            images_with_faces += 1

        faces_detected += len(rects_formateados)
        max_faces_single_image = max(max_faces_single_image, len(rects_formateados))
        last_path = procesar_y_guardar_resultados(
            imagen_cv2,
            imagen_copia,
            nombre_archivo,
            rects_formateados,
            'hog_images'
        )

    if images_processed == 0:
        return jsonify(build_api_payload('error', 'no_valid_images', error='No se pudieron decodificar imágenes válidas.')), 400

    run_metrics = build_detection_run_metrics(
        'hog',
        options,
        images_processed,
        faces_detected,
        images_with_faces,
        max_faces_single_image,
        time.time() - start_time,
    )
    append_session_run(workdir, sid, 'detections', run_metrics)

    message_key = 'detection_completed' if faces_detected > 0 else 'detection_completed_no_faces'
    return build_detection_response(message_key, last_path if last_path else 'hog_images', run_metrics)


def clasificar_emociones_cnn(recortes_path, workdir, fuente='todas'):
    """
    Clasifica emociones de rostros detectados y guarda los resultados 
    dentro del workdir del usuario.
    """
    start_time = time.time()
    
    # 1. Obtener el modelo pre-cargado globalmente
    modelo_emociones = get_fer_model()
    
    # 2. Definir la ruta de destino privada del usuario
    carpeta_destino_raiz = os.path.join(workdir, 'emociones_clasificadas')
    
    clases_emociones = ['enfadado', 'asqueado', 'miedo', 'feliz', 'neutral', 'triste', 'sorprendido']

    # 3. Crear subcarpetas de emociones dentro de la sesión del usuario
    for emocion in clases_emociones:
        os.makedirs(os.path.join(carpeta_destino_raiz, emocion), exist_ok=True)

    # 4. Iterar sobre los recortes (ya están en el workdir del usuario)
    for root, dirs, files in os.walk(recortes_path):
        for filename in files:
            # Solo procesamos archivos que sigan el patrón de rostros extraídos
            if filename.startswith('rostro_') and filename.endswith(('.jpg', '.jpeg', '.png')):
                ruta_recorte = os.path.join(root, filename)
                
                recorte = cv2.imread(ruta_recorte)
                if recorte is None: continue
                
                # Pre-procesamiento para el modelo FER (48x48, Grayscale, Normalizado)
                recorte_input = cv2.resize(recorte, (48, 48))
                recorte_input = cv2.cvtColor(recorte_input, cv2.COLOR_BGR2GRAY)
                recorte_input = recorte_input.astype("float32") / 255.0
                recorte_input = np.expand_dims(recorte_input, axis=0)
                recorte_input = np.expand_dims(recorte_input, axis=-1) # (1, 48, 48, 1)

                # 5. INFERENCIA CON LOCK (Seguridad para Concurrencia)
                with lock_fer:
                    predicciones = modelo_emociones.predict(recorte_input, verbose=0)
                
                emocion_predicha = clases_emociones[np.argmax(predicciones)]

                # 6. Guardar el resultado en la carpeta privada
                # Usamos un nombre único para evitar que rostros de diferentes fotos 
                # con el mismo nombre (ej: rostro_0.jpg) se sobreescriban
                id_unico = os.path.basename(root) # El nombre de la carpeta de la foto original
                nombre_final = f"{id_unico}_{filename}"
                
                ruta_destino = os.path.join(carpeta_destino_raiz, emocion_predicha, nombre_final)
                cv2.imwrite(ruta_destino, recorte)

    elapsed_time = time.time() - start_time
    print(f"[SESIÓN] Clasificación de emociones completada en {elapsed_time:.2f}s")



def clasificar_emociones_cnn(recortes_path, workdir, fuente='todas'):
    start_time = time.time()
    modelo_emociones = get_fer_model()
    carpeta_destino_raiz = clear_directory(os.path.join(workdir, 'emociones_clasificadas'))
    rutas = recortes_path if isinstance(recortes_path, list) else [recortes_path]

    for emocion in EMOTION_CLASSES:
        os.makedirs(os.path.join(carpeta_destino_raiz, emocion), exist_ok=True)

    distribution = {emocion: 0 for emocion in EMOTION_CLASSES}
    confidence_by_emotion_sum = {emocion: 0.0 for emocion in EMOTION_CLASSES}
    confidence_by_emotion_count = {emocion: 0 for emocion in EMOTION_CLASSES}
    source_breakdown = {}
    total_faces_analyzed = 0
    confidence_sum_total = 0.0

    for recortes_dir in rutas:
        if not os.path.exists(recortes_dir):
            continue

        source_key = os.path.basename(recortes_dir.rstrip("\\/")) or 'source'
        source_breakdown[source_key] = 0

        for root, dirs, files in os.walk(recortes_dir):
            for filename in files:
                if not filename.startswith('rostro_') or not filename.lower().endswith(('.jpg', '.jpeg', '.png')):
                    continue

                ruta_recorte = os.path.join(root, filename)
                recorte = cv2.imread(ruta_recorte)
                if recorte is None:
                    continue

                recorte_input = cv2.resize(recorte, (48, 48))
                recorte_input = cv2.cvtColor(recorte_input, cv2.COLOR_BGR2GRAY)
                recorte_input = recorte_input.astype("float32") / 255.0
                recorte_input = np.expand_dims(recorte_input, axis=0)
                recorte_input = np.expand_dims(recorte_input, axis=-1)

                with lock_fer:
                    predicciones = modelo_emociones.predict(recorte_input, verbose=0)

                probabilidades = predicciones[0]
                indice_predicho = int(np.argmax(probabilidades))
                emocion_predicha = EMOTION_CLASSES[indice_predicho]
                confianza_predicha = float(probabilidades[indice_predicho])

                distribution[emocion_predicha] += 1
                confidence_by_emotion_sum[emocion_predicha] += confianza_predicha
                confidence_by_emotion_count[emocion_predicha] += 1
                source_breakdown[source_key] += 1
                total_faces_analyzed += 1
                confidence_sum_total += confianza_predicha

                relative_root = os.path.relpath(root, workdir).replace("\\", "_").replace("/", "_")
                nombre_final = f"{relative_root}_{filename}"
                ruta_destino = os.path.join(carpeta_destino_raiz, emocion_predicha, nombre_final)
                cv2.imwrite(ruta_destino, recorte)

    dominant_emotion = None
    if total_faces_analyzed > 0:
        dominant_emotion = max(distribution.items(), key=lambda item: item[1])[0]

    percentages = {
        emocion: round((count / total_faces_analyzed) * 100, 2) if total_faces_analyzed else 0.0
        for emocion, count in distribution.items()
    }
    average_confidence_by_emotion = {
        emocion: round(confidence_by_emotion_sum[emocion] / confidence_by_emotion_count[emocion], 4)
        if confidence_by_emotion_count[emocion] else None
        for emocion in EMOTION_CLASSES
    }
    happiness_index = round((distribution.get('feliz', 0) / total_faces_analyzed) * 100, 2) if total_faces_analyzed else 0.0

    return {
        "timestamp": utc_now_iso(),
        "status": "success",
        "source": fuente,
        "total_faces_analyzed": total_faces_analyzed,
        "distribution": distribution,
        "percentages": percentages,
        "dominant_emotion": dominant_emotion,
        "happiness_index": happiness_index,
        "average_confidence": round(confidence_sum_total / total_faces_analyzed, 4) if total_faces_analyzed else None,
        "average_confidence_by_emotion": average_confidence_by_emotion,
        "source_breakdown": source_breakdown,
        "processing_time_sec": round(time.time() - start_time, 3),
    }


def extract_face_features(image_path):
    # 1. Carga segura de la imagen
    try:
        # cv2.imread puede fallar o retornar None si el archivo está corrupto
        image = cv2.imread(image_path)
        if image is None:
            return None
            
        # 2. Conversión de color
        # face_recognition trabaja internamente con dlib, que requiere RGB
        image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        alto, ancho = image_rgb.shape[:2]

        # 3. Definición de la caja (Face Location)
        # El formato de face_recognition es (top, right, bottom, left)
        # Forzamos a que el modelo analice el recorte completo como un solo rostro
        caja_manual = [(0, ancho, alto, 0)]

        # 4. Extracción de Encodings (Vector de 128 dimensiones)
        # No usamos 'model' aquí porque al pasar known_face_locations, 
        # dlib solo extrae los rasgos (landmarks) sin buscar rostros.
        encodings = face_recognition.face_encodings(
            image_rgb, 
            known_face_locations=caja_manual,
            num_jitters=1 # 1 es suficiente para velocidad; 10 para más precisión pero es más lento
        )

        # 5. Retornar el vector de características si se encontró
        if len(encodings) > 0:
            return encodings[0]
            
    except Exception as e:
        print(f"[-] Error extrayendo características en {image_path}: {e}")
        return None
    
    return None



def clustered_faces(dataset_paths, workdir, jobs=-1, fuente='todas', options=None):
    start_time = time.time()
    options = parse_clustering_options(options or {})
    output_dir = clear_directory(os.path.join(workdir, 'clustered_faces'))
    encodings_path = os.path.join(workdir, "encodings.pickle")
    safe_remove_path(encodings_path)

    data = []
    image_paths = []
    candidate_faces = 0

    if isinstance(dataset_paths, str):
        dataset_paths = [dataset_paths]

    for dataset_path in dataset_paths:
        if not os.path.exists(dataset_path):
            continue

        for root, dirs, files in os.walk(dataset_path):
            for filename in files:
                if not filename.startswith('rostro_') or not filename.lower().endswith(('.jpg', '.jpeg', '.png')):
                    continue

                candidate_faces += 1
                image_path = os.path.join(root, filename)
                face_feat = extract_face_features(image_path)

                if face_feat is not None and len(face_feat) == 128:
                    data.append(face_feat)
                    image_paths.append(image_path)

    metrics = {
        "timestamp": utc_now_iso(),
        "source": fuente,
        "parameters": options,
        "candidate_faces": candidate_faces,
        "encodings_extracted": len(data),
        "clusters_count": 0,
        "clustered_faces": 0,
        "noise_faces": 0,
        "largest_cluster_size": 0,
        "avg_cluster_size": 0.0,
        "cluster_sizes": [],
        "status": "success",
        "message_key": "clustering_completed",
        "message": None,
        "processing_time_sec": 0.0,
    }

    if len(data) < options["minSamples"]:
        metrics["status"] = "warning"
        metrics["message_key"] = "clustering_not_enough_matches"
        metrics["message"] = "No hay suficientes coincidencias para generar clusters. DBSCAN necesita al menos 2 coincidencias."
        metrics["processing_time_sec"] = round(time.time() - start_time, 3)
        return metrics

    data_matrix = np.array(data, dtype="float64")
    dbscan = DBSCAN(
        eps=options["eps"],
        min_samples=options["minSamples"],
        metric="euclidean",
        n_jobs=jobs,
    )
    labels = dbscan.fit_predict(data_matrix)

    unique_labels = sorted(label for label in set(labels) if label != -1)
    metrics["noise_faces"] = int(np.sum(labels == -1))

    for label in unique_labels:
        persona_subdir = os.path.join(output_dir, f"persona_{label}")
        os.makedirs(persona_subdir, exist_ok=True)

        indices = np.where(labels == label)[0]
        imagenes_cv2 = []
        cluster_size = len(indices)
        metrics["cluster_sizes"].append({
            "label": f"persona_{label}",
            "size": cluster_size,
        })
        metrics["largest_cluster_size"] = max(metrics["largest_cluster_size"], cluster_size)
        metrics["clustered_faces"] += cluster_size

        for idx in indices:
            ruta_origen = image_paths[idx]
            img = cv2.imread(ruta_origen)
            if img is None:
                continue
            imagenes_cv2.append(img)
            shutil.copy(ruta_origen, os.path.join(persona_subdir, f"face_{idx}.jpg"))

        if imagenes_cv2:
            montajes = build_montages(imagenes_cv2, (120, 120), (5, 5))
            if montajes:
                cv2.imwrite(os.path.join(persona_subdir, "_resumen_montaje.jpg"), montajes[0])

    metrics["clusters_count"] = len(unique_labels)
    if metrics["clusters_count"] > 0:
        metrics["avg_cluster_size"] = round(metrics["clustered_faces"] / metrics["clusters_count"], 3)

    if metrics["clusters_count"] == 0:
        safe_remove_path(output_dir)
        os.makedirs(output_dir, exist_ok=True)
        metrics["status"] = "warning"
        metrics["message_key"] = "clustering_no_matches"
        metrics["message"] = "No se encontraron coincidencias suficientes entre rostros para formar clusters."
        metrics["processing_time_sec"] = round(time.time() - start_time, 3)
        return metrics

    with open(encodings_path, 'wb') as f:
        pickle.dump({"labels": labels, "paths": image_paths}, f)

    metrics["processing_time_sec"] = round(time.time() - start_time, 3)
    return metrics


if __name__ == '__main__':
    port = int(os.environ.get("PORT", 7860))
    # Activar la recarga automática de plantillas HTML
    app.config['TEMPLATES_AUTO_RELOAD'] = True
    # Iniciar en modo debug auto-refresca si cambias archivos Python
    app.run(host='0.0.0.0', port=port, debug=True)
