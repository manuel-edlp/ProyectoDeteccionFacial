const appState = {
    selectedFiles: [],
    timerInterval: null,
    secondsPassed: 0,
    currentPreviewMode: 'list',
    currentLightboxIndex: 0,
    currentLightboxImages: [],
    currentTimerSpan: null,
    cacheDeCarpetas: new Map(),
    charts: { emotion: null, method: null },
    cleanupTriggered: false,
    examplesCurrentPath: '',
    examplesSelectedPaths: new Set(),
    examplesEntries: { folders: [], files: [], parentPath: null, breadcrumbs: [] },
    exampleFileCache: new Map(),
    selectedMotor: 'cnn',
};

function isHuggingFace() {
    const host = window.location.hostname;
    return host.includes('huggingface.co') || host.includes('hf.space');
}

const DOM = {
    fileInput: document.getElementById('fileInput'),
    previewControls: document.getElementById('previewControls'),
    previewCount: document.getElementById('previewCount'),
    previewList: document.getElementById('previewList'),
    dropZone: document.getElementById('dropZone'),
    btnAddMore: document.getElementById('btnAddMore'),
    btnClearAll: document.getElementById('btnClearAll'),
    btnRefreshExamples: document.getElementById('btnRefreshExamples'),
    examplesBreadcrumb: document.getElementById('examplesBreadcrumb'),
    examplesExplorer: document.getElementById('examplesExplorer'),
    examplesSelectionInfo: document.getElementById('examplesSelectionInfo'),
    statusBadge: document.getElementById('statusBadge'),
    statusLog: document.getElementById('status'),
    statusInitialLine: document.getElementById('statusInitialLine'),
    visorImagenes: document.getElementById('visorImagenes'),
    visorTitulo: document.getElementById('visorTitulo'),
    arbolCarpetas: document.getElementById('arbolCarpetas'),
    sourceSelect: document.getElementById('sourceSelect'),
    languageSelect: document.getElementById('languageSelect'),
    labPanels: document.getElementById('labPanels'),
    metricsCards: document.getElementById('metricsCards'),
    metricHighlights: document.getElementById('metricHighlights'),
    runHistory: document.getElementById('runHistory'),
    emotionChart: document.getElementById('emotionChart'),
    emotionChartEmpty: document.getElementById('emotionChartEmpty'),
    methodChart: document.getElementById('methodChart'),
    methodChartEmpty: document.getElementById('methodChartEmpty'),
    lightbox: document.getElementById('lightbox'),
    lightboxImg: document.getElementById('lightbox-img'),
    lightboxCaption: document.getElementById('lightbox-caption'),
};

const ROOT_LABELS = {
    vj_images: 'Viola-Jones',
    cnn_images: 'CNN Dlib',
    hog_images: 'HOG',
    emociones_clasificadas: 'Emotions',
    clustered_faces: 'Clusters',
};

const EMOTION_NAMES = {
    enfadado: { es: 'Enfadado', en: 'Angry' },
    asqueado: { es: 'Asqueado', en: 'Disgusted' },
    miedo: { es: 'Miedo', en: 'Fear' },
    feliz: { es: 'Feliz', en: 'Happy' },
    neutral: { es: 'Neutral', en: 'Neutral' },
    triste: { es: 'Triste', en: 'Sad' },
    sorprendido: { es: 'Sorprendido', en: 'Surprised' },
};

const PARAMETER_CONFIG = [
    {
        key: 'vj',
        titleKey: 'lab.vj.title',
        subtitleKey: 'lab.vj.subtitle',
        controls: [
            { key: 'scaleFactor', labelKey: 'lab.vj.scaleFactor', helpKey: 'lab.vj.scaleFactor.help', min: 1.05, max: 1.6, step: 0.05, default: 1.1, format: (value) => Number(value).toFixed(2) },
            { key: 'minNeighbors', labelKey: 'lab.vj.minNeighbors', helpKey: 'lab.vj.minNeighbors.help', min: 1, max: 12, step: 1, default: 4, format: (value) => `${Math.round(value)}` },
            { key: 'minSize', labelKey: 'lab.vj.minSize', helpKey: 'lab.vj.minSize.help', min: 20, max: 180, step: 5, default: 30, format: (value) => `${Math.round(value)} px` },
        ],
    },
    {
        key: 'cnn',
        titleKey: 'lab.cnn.title',
        subtitleKey: 'lab.cnn.subtitle',
        controls: [
            { key: 'resizeWidth', labelKey: 'lab.cnn.resizeWidth', helpKey: 'lab.cnn.resizeWidth.help', min: 320, max: 1600, step: 40, default: 800, format: (value) => `${Math.round(value)} px` },
            { key: 'upsampleTimes', labelKey: 'lab.cnn.upsampleTimes', helpKey: 'lab.cnn.upsampleTimes.help', min: 0, max: 3, step: 1, default: 1, format: (value) => `${Math.round(value)}` },
        ],
    },
    {
        key: 'hog',
        titleKey: 'lab.hog.title',
        subtitleKey: 'lab.hog.subtitle',
        controls: [
            { key: 'upsampleTimes', labelKey: 'lab.hog.upsampleTimes', helpKey: 'lab.hog.upsampleTimes.help', min: 0, max: 4, step: 1, default: 1, format: (value) => `${Math.round(value)}` },
        ],
    },
    {
        key: 'clustering',
        titleKey: 'lab.clustering.title',
        subtitleKey: 'lab.clustering.subtitle',
        controls: [
            { key: 'eps', labelKey: 'lab.clustering.eps', helpKey: 'lab.clustering.eps.help', min: 0.1, max: 1.5, step: 0.05, default: 0.55, format: (value) => Number(value).toFixed(2) },
            { key: 'minSamples', labelKey: 'lab.clustering.minSamples', helpKey: 'lab.clustering.minSamples.help', min: 2, max: 10, step: 1, default: 2, format: (value) => `${Math.round(value)}` },
        ],
    },
];

const TRANSLATIONS = {
    es: {
        'hero.kicker': 'Plataforma de análisis facial',
        'hero.title': 'Detección, clustering y análisis de rostros asistido por inteligencia artificial.',
        'hero.subtitle': 'La aplicación integra carga de imágenes, detección facial, análisis derivado y exploración visual de resultados en una única experiencia pensada para experimentar, comparar métodos y revisar salidas con claridad.',
        'hero.statusLabel': 'Estado de la sesión',
        'hero.statusCopy': 'Todo listo para empezar con una carga nueva o reutilizar ejemplos.',
        'workflow.step1': 'Cargar datos',
        'workflow.step2': 'Elegir método',
        'workflow.step3': 'Procesar',
        'workflow.step4': 'Explorar resultados',
        'guide.title': 'Orden recomendado',
        'guide.flowTitle': 'Flujo de funcionamiento',
        'guide.subtitle': 'Una secuencia clara reduce errores y mejora la interpretación de resultados.',
        'guide.item1.title': 'Cargá o probá ejemplos',
        'guide.item1.text': 'Definí primero el set de entrada que querés validar.',
        'guide.item2.title': 'Ajustá parámetros sólo si hace falta',
        'guide.item2.text': 'Los controles avanzados quedan a mano, pero no interrumpen la acción principal.',
        'guide.item3.title': 'Elegí detector y ejecutá',
        'guide.item3.text': 'Cada método se presenta según su promesa: velocidad, precisión o balance.',
        'guide.item4.title': 'Profundizá con emociones o clustering',
        'guide.item4.text': 'Los análisis posteriores aparecen como una continuación natural del detector.',
        'upload.addMore': 'Agregar más archivos',
        'nav.docs': 'Docs',
        'nav.repo': 'Repo',
        'upload.title': 'Entrada de datos',
        'upload.subtitle': 'JPG, PNG o ZIP para procesamiento por lotes.',
        'upload.guidance': 'Empezá por una muestra pequeña para validar el detector antes de correr lotes grandes.',
        'upload.pickPrompt': 'Click aquí para seleccionar imágenes o archivos ZIP',
        'upload.clearAll': 'Eliminar todas',
        'upload.filesSelected': '{count} archivos seleccionados',
        'upload.loadingFiles': 'Cargando archivos y extrayendo ZIPs...',
        'upload.examplesTitle': 'Explorador de ejemplos',
        'upload.examplesSubtitle': 'Navegá la carpeta examples y cargá una o varias imágenes al panel.',
        'upload.examplesRefresh': 'Actualizar',
        'upload.examplesEmpty': 'No hay imágenes ni subcarpetas en esta carpeta.',
        'upload.examplesLoadError': 'No se pudo cargar la carpeta de ejemplos.',
        'upload.examplesSelected': '{count} ejemplos seleccionados en el explorador.',
        'upload.examplesRoot': 'examples',
        'upload.examplesUp': 'Subir un nivel',
        'upload.examplesLoaded': 'Ejemplos cargados al panel de entrada.',
        'console.title': 'Consola de mando',
        'console.subtitle': 'Primero corré un detector base y después, si lo necesitás, dispará análisis derivados sobre los resultados generados.',
        'console.step1': '[1] Motor base de detección',
        'console.startDetection': 'Iniciar detección',
        'console.step2': '[2] Cómputo analítico',
        'console.detector.vj': 'Rápido para validaciones iniciales',
        'console.detector.cnn': 'Mayor precisión para casos exigentes',
        'console.detector.hog': 'Balanceado para uso general',
        'console.analyticsCopy': 'Usá esta etapa cuando ya tengas detecciones generadas y quieras enriquecerlas.',
        'console.runEmotions': 'Analizar emociones',
        'console.runClustering': 'Armar clusters',
        'console.clusterHint': 'El clustering necesita al menos 2 rostros que coincidan para formar un grupo.',
        'sources.all': '*/todas',
        'vfs.title': 'Sistema de archivos virtual',
        'vfs.subtitle': 'Acá inspeccionás cada salida generada, comparás carpetas y abrís imágenes finales.',
        'vfs.noFolderSelected': 'Ninguna carpeta seleccionada',
        'vfs.folderDeleted': 'Carpeta eliminada.',
        'vfs.emptyFolder': 'Carpeta vacía',
        'vfs.exploring': 'Explorando: {path}',
        'vfs.selectFolder': 'Selecciona una carpeta',
        'vfs.loadError': 'Error al cargar: {message}',
        'vfs.root.vj_images': 'Detecciones Viola-Jones',
        'vfs.root.cnn_images': 'Detecciones CNN Dlib',
        'vfs.root.hog_images': 'Detecciones HOG',
        'vfs.root.emociones_clasificadas': 'Emociones clasificadas',
        'vfs.root.clustered_faces': 'Clusters generados',
        'lab.title': 'Laboratorio de parámetros',
        'lab.subtitle': 'Ajustá los hiperparámetros antes de ejecutar cada método.',
        'lab.reset': 'Restaurar',
        'lab.applyNextRun': 'Se aplica en la próxima ejecución.',
        'lab.vj.title': 'Viola-Jones',
        'lab.vj.subtitle': 'Rapidez alta, sensible a escala y vecinos mínimos.',
        'lab.vj.scaleFactor': 'Scale factor',
        'lab.vj.scaleFactor.help': 'Controla cuánto se reduce la imagen entre escalas de búsqueda. Un valor mayor acelera el barrido pero puede saltear rostros; un valor menor revisa más escalas, detecta mejor y tarda más.',
        'lab.vj.minNeighbors': 'Min neighbors',
        'lab.vj.minNeighbors.help': 'Define cuántas detecciones vecinas hacen falta para aceptar un rostro. Un valor mayor reduce falsos positivos pero puede perder caras reales; un valor menor detecta más, con más ruido.',
        'lab.vj.minSize': 'Tamaño mínimo',
        'lab.vj.minSize.help': 'Marca el tamaño mínimo de rostro a buscar en píxeles. Un valor mayor ignora caras chicas y acelera; un valor menor encuentra rostros pequeños pero aumenta tiempo y falsos positivos.',
        'lab.cnn.title': 'CNN Dlib',
        'lab.cnn.subtitle': 'Más pesado pero más preciso. Ajustá resolución y sobremuestreo.',
        'lab.cnn.disabled': 'Ajustes no disponibles en Hugging Face',
        'lab.cnn.disabledHelp': 'La infraestructura de HF tiene límites de cómputo que impiden modificar estos parámetros. Corré el proyecto localmente para tener control total.',
        'lab.cnn.resizeWidth': 'Ancho de resize',
        'lab.cnn.resizeWidth.help': 'Fija el ancho al que se reescala la imagen antes de detectar. Un valor mayor conserva más detalle y mejora caras pequeñas, pero consume más tiempo y memoria; un valor menor acelera, con menos precisión fina.',
        'lab.cnn.upsampleTimes': 'Upsample',
        'lab.cnn.upsampleTimes.help': 'Amplía la imagen antes de correr la red para hacer visibles rostros chicos. Un valor mayor mejora detecciones difíciles, pero sube mucho el costo; un valor menor es más rápido y puede omitir caras pequeñas.',
        'lab.hog.title': 'HOG',
        'lab.hog.subtitle': 'Balance entre velocidad y robustez.',
        'lab.hog.upsampleTimes': 'Upsample',
        'lab.hog.upsampleTimes.help': 'Aumenta la resolución efectiva antes de extraer descriptores HOG. Un valor mayor ayuda con rostros pequeños o lejanos, pero tarda más; un valor menor mantiene velocidad, con menos sensibilidad.',
        'lab.clustering.title': 'DBSCAN',
        'lab.clustering.subtitle': 'Controlá sensibilidad y tamaño mínimo de cluster.',
        'lab.clustering.eps': 'EPS',
        'lab.clustering.eps.help': 'Es la distancia máxima para considerar que dos rostros son similares. Un valor mayor une más caras y puede mezclar identidades; un valor menor separa mejor, pero deja más casos como ruido.',
        'lab.clustering.minSamples': 'Min samples',
        'lab.clustering.minSamples.help': 'Define cuántas coincidencias mínimas necesita un grupo para existir. Un valor mayor exige clusters más consistentes y genera más ruido; un valor menor arma clusters con menos evidencia, pero es más permisivo.',
        'metrics.title': 'Panel de métricas',
        'metrics.subtitle': 'El cierre del flujo resume volumen, calidad y comportamiento del procesamiento para apoyar decisiones rápidas.',
        'metrics.export': 'Exportar datos',
        'metrics.emotionChart': 'Distribución emocional',
        'metrics.methodChart': 'Detecciones por método',
        'metrics.highlights': 'Indicadores clave',
        'metrics.history': 'Historial reciente',
        'metrics.noEmotionData': 'Todavía no hay datos emocionales para graficar.',
        'metrics.noDetectionData': 'Todavía no hay detecciones acumuladas.',
        'metrics.noHistory': 'Todavía no hay ejecuciones registradas en esta sesión.',
        'metrics.card.images': 'Imágenes procesadas',
        'metrics.card.faces': 'Rostros detectados',
        'metrics.card.methods': 'Métodos usados',
        'metrics.card.clusters': 'Clusters',
        'metrics.card.happiness': 'Índice de felicidad',
        'metrics.card.time': 'Tiempo total',
        'metrics.card.imagesMeta': '{withFaces} imágenes con detecciones',
        'metrics.card.facesMeta': 'Promedio: {avg} rostros/imagen',
        'metrics.card.methodsMeta': '{methods}',
        'metrics.card.clustersMeta': '{clustered} rostros agrupados • {noise} ruido',
        'metrics.card.happinessMeta': 'Emoción dominante: {emotion}',
        'metrics.card.timeMeta': 'Almacenamiento: {size}',
        'metrics.highlight.imagesWithFaces': 'Imágenes con rostros',
        'metrics.highlight.imagesWithoutFaces': 'Imágenes sin rostros',
        'metrics.highlight.maxFaces': 'Máximo por imagen',
        'metrics.highlight.storage': 'Tamaño de sesión',
        'metrics.highlight.lastClustering': 'Último clustering',
        'metrics.highlight.lastEmotions': 'Último análisis emocional',
        'metrics.highlight.avgConfidence': 'Confianza emocional media',
        'metrics.highlight.files': 'Archivos generados',
        'metrics.highlight.dominantEmotion': 'Emoción dominante',
        'metrics.highlight.clusterParams': 'Parámetros DBSCAN',
        'metrics.highlight.clusterNoise': 'Ruido detectado',
        'metrics.history.detection': 'Detección {method}',
        'metrics.history.clustering': 'Clustering',
        'metrics.history.emotions': 'Emociones',
        'metrics.history.meta.detection': '{images} imágenes • {faces} rostros • {time}',
        'metrics.history.meta.clustering': '{clusters} clusters • {clustered} agrupados • {time}',
        'metrics.history.meta.emotions': '{faces} rostros • felicidad {happiness}% • {time}',
        'badge.waiting': 'Esperando...',
        'badge.ready': 'Listo',
        'badge.processing': 'Procesando',
        'badge.success': 'Online',
        'badge.warning': 'Atención',
        'badge.error': 'Error',
        'common.refresh': 'Actualizar',
        'common.refreshTree': 'Actualizar árbol',
        'common.confirm': 'Confirmar',
        'common.cancel': 'Cancelar',
        'common.none': 'Sin datos',
        'common.na': 'N/D',
        'alerts.warningTitle': 'Atención',
        'alerts.infoTitle': 'Información',
        'alerts.errorTitle': 'Error',
        'alerts.serverError': 'Error del servidor',
        'alerts.deleteTitle': '¿Confirmar borrado?',
        'alerts.deleteText': 'Se eliminarán los archivos de: {path}',
        'alerts.renameTitle': 'Renombrar carpeta',
        'alerts.renamePlaceholder': 'Ingresá el nuevo nombre',
        'alerts.renameRequired': 'Debes ingresar un nombre.',
        'alerts.renameInvalid': 'Usá solo letras, números, guiones y espacios.',
        'alerts.renameLong': 'El nombre es muy largo (máx. 40 caracteres).',
        'alerts.exportReady': 'Exportación lista.',
        'alerts.cleanupNotice': 'La sesión se limpiará al cerrar la pestaña.',
        'status.initial': '> Terminal lista. Aguardando imágenes.',
        'status.folderDeleted': 'Carpeta eliminada: {path}',
        'status.folderRenamed': 'Carpeta renombrada.',
        'status.metricsUpdated': 'Panel de métricas actualizado.',
        'status.processingDetection': 'Iniciando detección {method}...',
        'status.processingSpecial': 'Ejecutando {type} sobre [{source}]...',
        'status.filesLoaded': 'Archivos cargados y listos para analizar.',
        'status.exporting': 'Generando paquete de exportación...',
        'status.exportComplete': 'Exportación generada correctamente.',
        'status.connectionError': 'No se pudo actualizar el explorador.',
        'footer.madeBy': 'Desarrollado por',
        'api.metrics_loaded': 'Métricas actualizadas.',
        'api.detection_completed': 'Detección finalizada correctamente.',
        'api.detection_completed_no_faces': 'La detección finalizó, pero no se encontraron rostros.',
        'api.no_valid_images': 'No se recibieron imágenes válidas.',
        'api.invalid_source': 'La fuente seleccionada no es válida.',
        'api.clustering_missing_detections': 'No hay detecciones previas para ejecutar clustering.',
        'api.clustering_completed': 'Clustering finalizado con éxito.',
        'api.clustering_no_matches': 'No se encontraron coincidencias suficientes entre rostros para formar clusters.',
        'api.clustering_not_enough_matches': 'No hay suficientes coincidencias para generar clusters. Verificá que haya al menos 2 rostros coincidentes.',
        'api.clustering_failed': 'Ocurrió un error durante el clustering.',
        'api.clustering_minimum_help': 'Consejo: DBSCAN necesita al menos 2 coincidencias para armar un cluster.',
        'api.emotions_missing_detections': 'No hay detecciones previas para analizar emociones.',
        'api.emotions_no_faces_found': 'No se encontraron rostros recortados para clasificar emociones.',
        'api.emotions_completed': 'Análisis de emociones completado.',
        'api.emotions_failed': 'Ocurrió un error durante el análisis emocional.',
        'api.cnn_zip_not_allowed': 'No se permite ZIP para CNN debido a la carga computacional.',
        'api.export_no_data': 'No hay datos para exportar en esta sesión.',
        'api.cleanup_completed': 'La sesión fue limpiada correctamente.',
        'api.unknown': 'No se pudo completar la operación.',
    },
    en: {
        'hero.kicker': 'Facial analysis platform',
        'hero.title': 'AI-assisted project for face detection, clustering, and facial analysis.',
        'hero.subtitle': 'The application brings together image upload, face detection, derived analysis, and visual result exploration in a single workflow designed for experimentation, method comparison, and clear review of outputs.',
        'hero.statusLabel': 'Session status',
        'hero.statusCopy': 'Everything is ready to start with a fresh upload or reuse examples.',
        'workflow.step1': 'Load data',
        'workflow.step2': 'Choose method',
        'workflow.step3': 'Process',
        'workflow.step4': 'Explore results',
        'guide.title': 'Recommended order',
        'guide.flowTitle': 'Workflow guide',
        'guide.subtitle': 'A clear sequence reduces errors and makes the results easier to interpret.',
        'guide.item1.title': 'Upload files or try examples',
        'guide.item1.text': 'Start by defining the input set you want to validate.',
        'guide.item2.title': 'Adjust parameters only if needed',
        'guide.item2.text': 'Advanced controls stay within reach without interrupting the main action.',
        'guide.item3.title': 'Choose a detector and run it',
        'guide.item3.text': 'Each method is framed by its promise: speed, precision, or balance.',
        'guide.item4.title': 'Go deeper with emotions or clustering',
        'guide.item4.text': 'Post-processing appears as a natural continuation of the detector stage.',
        'upload.addMore': 'Add more files',
        'nav.docs': 'Docs',
        'nav.repo': 'Repo',
        'upload.title': 'Data input',
        'upload.subtitle': 'JPG, PNG or ZIP for batch processing.',
        'upload.guidance': 'Start with a small sample to validate the detector before running large batches.',
        'upload.pickPrompt': 'Click here to choose images or ZIP files',
        'upload.clearAll': 'Clear all',
        'upload.filesSelected': '{count} files selected',
        'upload.loadingFiles': 'Loading files and extracting ZIPs...',
        'upload.examplesTitle': 'Examples browser',
        'upload.examplesSubtitle': 'Browse the examples folder and load one or more images into the input panel.',
        'upload.examplesRefresh': 'Refresh',
        'upload.examplesEmpty': 'There are no images or subfolders in this folder.',
        'upload.examplesLoadError': 'The examples folder could not be loaded.',
        'upload.examplesSelected': '{count} examples selected in the browser.',
        'upload.examplesRoot': 'examples',
        'upload.examplesUp': 'Go up one level',
        'upload.examplesLoaded': 'Examples were loaded into the input panel.',
        'console.title': 'Command console',
        'console.subtitle': 'Run a base detector first and then, if needed, launch derived analysis on the generated outputs.',
        'console.step1': '[1] Base detection engine',
        'console.startDetection': 'Start detection',
        'console.step2': '[2] Analytical compute',
        'console.detector.vj': 'Fast for initial validation runs',
        'console.detector.cnn': 'Higher precision for demanding cases',
        'console.detector.hog': 'Balanced for general use',
        'console.analyticsCopy': 'Use this stage once detections already exist and you want to enrich them.',
        'console.runEmotions': 'run emotions',
        'console.runClustering': 'run clustering',
        'console.clusterHint': 'Clustering needs at least 2 matching faces to form a group.',
        'sources.all': '*/all',
        'vfs.title': 'Virtual file system',
        'vfs.subtitle': 'Inspect every generated output here, compare folders, and open final images.',
        'vfs.noFolderSelected': 'No folder selected',
        'vfs.folderDeleted': 'Folder deleted.',
        'vfs.emptyFolder': 'Empty folder',
        'vfs.exploring': 'Browsing: {path}',
        'vfs.selectFolder': 'Select a folder',
        'vfs.loadError': 'Load error: {message}',
        'vfs.root.vj_images': 'Viola-Jones detections',
        'vfs.root.cnn_images': 'CNN Dlib detections',
        'vfs.root.hog_images': 'HOG detections',
        'vfs.root.emociones_clasificadas': 'Classified emotions',
        'vfs.root.clustered_faces': 'Generated clusters',
        'lab.title': 'Parameter lab',
        'lab.subtitle': 'Tune hyperparameters before running each method.',
        'lab.reset': 'Reset',
        'lab.applyNextRun': 'Applies on the next run.',
        'lab.vj.title': 'Viola-Jones',
        'lab.vj.subtitle': 'Fast, sensitive to scale and neighborhood size.',
        'lab.vj.scaleFactor': 'Scale factor',
        'lab.vj.scaleFactor.help': 'Controls how much the image shrinks between search scales. A higher value scans faster but may skip faces; a lower value checks more scales, improves recall, and takes longer.',
        'lab.vj.minNeighbors': 'Min neighbors',
        'lab.vj.minNeighbors.help': 'Sets how many nearby detections are required to accept a face. A higher value reduces false positives but may miss real faces; a lower value detects more, with more noise.',
        'lab.vj.minSize': 'Minimum size',
        'lab.vj.minSize.help': 'Sets the minimum face size to search for in pixels. A higher value ignores small faces and speeds things up; a lower value finds smaller faces but increases time and false positives.',
        'lab.cnn.title': 'CNN Dlib',
        'lab.cnn.subtitle': 'Heavier but more precise. Tune resize and upsampling.',
        'lab.cnn.disabled': 'Settings unavailable on Hugging Face',
        'lab.cnn.disabledHelp': 'HF infrastructure has compute limits that prevent modifying these parameters. Run the project locally for full control.',
        'lab.cnn.resizeWidth': 'Resize width',
        'lab.cnn.resizeWidth.help': 'Sets the width used to resize the image before detection. A higher value preserves more detail and helps with small faces, but uses more time and memory; a lower value is faster with less fine-grained accuracy.',
        'lab.cnn.upsampleTimes': 'Upsample',
        'lab.cnn.upsampleTimes.help': 'Enlarges the image before running the network so small faces become more visible. A higher value improves hard detections but raises the cost sharply; a lower value is faster and may miss tiny faces.',
        'lab.hog.title': 'HOG',
        'lab.hog.subtitle': 'Balance between speed and robustness.',
        'lab.hog.upsampleTimes': 'Upsample',
        'lab.hog.upsampleTimes.help': 'Increases the effective resolution before extracting HOG descriptors. A higher value helps with small or distant faces, but takes longer; a lower value keeps speed with lower sensitivity.',
        'lab.clustering.title': 'DBSCAN',
        'lab.clustering.subtitle': 'Control sensitivity and minimum cluster size.',
        'lab.clustering.eps': 'EPS',
        'lab.clustering.eps.help': 'This is the maximum distance allowed to treat two faces as similar. A higher value groups more faces and may merge identities; a lower value separates better, but leaves more cases as noise.',
        'lab.clustering.minSamples': 'Min samples',
        'lab.clustering.minSamples.help': 'Defines how many matches a group needs before it becomes a cluster. A higher value requires more consistent clusters and creates more noise; a lower value builds clusters with less evidence and is more permissive.',
        'metrics.title': 'Metrics panel',
        'metrics.subtitle': 'The last stage of the flow summarizes volume, quality, and processing behavior to support faster decisions.',
        'metrics.export': 'Export data',
        'metrics.emotionChart': 'Emotion distribution',
        'metrics.methodChart': 'Detections by method',
        'metrics.highlights': 'Key indicators',
        'metrics.history': 'Recent history',
        'metrics.noEmotionData': 'There is no emotion data to plot yet.',
        'metrics.noDetectionData': 'There are no accumulated detections yet.',
        'metrics.noHistory': 'No runs have been recorded for this session yet.',
        'metrics.card.images': 'Processed images',
        'metrics.card.faces': 'Detected faces',
        'metrics.card.methods': 'Methods used',
        'metrics.card.clusters': 'Clusters',
        'metrics.card.happiness': 'Happiness index',
        'metrics.card.time': 'Total time',
        'metrics.card.imagesMeta': '{withFaces} images with detections',
        'metrics.card.facesMeta': 'Average: {avg} faces/image',
        'metrics.card.methodsMeta': '{methods}',
        'metrics.card.clustersMeta': '{clustered} grouped faces • {noise} noise',
        'metrics.card.happinessMeta': 'Dominant emotion: {emotion}',
        'metrics.card.timeMeta': 'Storage: {size}',
        'metrics.highlight.imagesWithFaces': 'Images with faces',
        'metrics.highlight.imagesWithoutFaces': 'Images without faces',
        'metrics.highlight.maxFaces': 'Max per image',
        'metrics.highlight.storage': 'Session size',
        'metrics.highlight.lastClustering': 'Last clustering',
        'metrics.highlight.lastEmotions': 'Last emotion analysis',
        'metrics.highlight.avgConfidence': 'Average emotion confidence',
        'metrics.highlight.files': 'Generated files',
        'metrics.highlight.dominantEmotion': 'Dominant emotion',
        'metrics.highlight.clusterParams': 'DBSCAN parameters',
        'metrics.highlight.clusterNoise': 'Detected noise',
        'metrics.history.detection': '{method} detection',
        'metrics.history.clustering': 'Clustering',
        'metrics.history.emotions': 'Emotions',
        'metrics.history.meta.detection': '{images} images • {faces} faces • {time}',
        'metrics.history.meta.clustering': '{clusters} clusters • {clustered} grouped • {time}',
        'metrics.history.meta.emotions': '{faces} faces • happiness {happiness}% • {time}',
        'badge.waiting': 'Waiting...',
        'badge.ready': 'Ready',
        'badge.processing': 'Processing',
        'badge.success': 'Online',
        'badge.warning': 'Attention',
        'badge.error': 'Error',
        'common.refresh': 'Refresh',
        'common.refreshTree': 'Refresh tree',
        'common.confirm': 'Confirm',
        'common.cancel': 'Cancel',
        'common.none': 'No data',
        'common.na': 'N/A',
        'alerts.warningTitle': 'Warning',
        'alerts.infoTitle': 'Info',
        'alerts.errorTitle': 'Error',
        'alerts.serverError': 'Server error',
        'alerts.deleteTitle': 'Confirm deletion?',
        'alerts.deleteText': 'Files under {path} will be removed',
        'alerts.renameTitle': 'Rename folder',
        'alerts.renamePlaceholder': 'Enter the new name',
        'alerts.renameRequired': 'You need to enter a name.',
        'alerts.renameInvalid': 'Use only letters, numbers, dashes and spaces.',
        'alerts.renameLong': 'The name is too long (max 40 characters).',
        'alerts.exportReady': 'Export is ready.',
        'alerts.cleanupNotice': 'The session will be cleaned up when the tab closes.',
        'status.initial': '> Terminal ready. Waiting for images.',
        'status.folderDeleted': 'Folder deleted: {path}',
        'status.folderRenamed': 'Folder renamed.',
        'status.metricsUpdated': 'Metrics panel refreshed.',
        'status.processingDetection': 'Starting {method} detection...',
        'status.processingSpecial': 'Running {type} on [{source}]...',
        'status.filesLoaded': 'Files loaded and ready for analysis.',
        'status.exporting': 'Building export package...',
        'status.exportComplete': 'Export generated successfully.',
        'status.connectionError': 'Could not refresh the explorer.',
        'footer.madeBy': 'Built by',
        'api.metrics_loaded': 'Metrics refreshed.',
        'api.detection_completed': 'Detection finished successfully.',
        'api.detection_completed_no_faces': 'Detection finished, but no faces were found.',
        'api.no_valid_images': 'No valid images were received.',
        'api.invalid_source': 'The selected source is not valid.',
        'api.clustering_missing_detections': 'There are no previous detections for clustering.',
        'api.clustering_completed': 'Clustering finished successfully.',
        'api.clustering_no_matches': 'Not enough matching faces were found to create clusters.',
        'api.clustering_not_enough_matches': 'There are not enough matches to create clusters. Check that at least 2 matching faces exist.',
        'api.clustering_failed': 'An error occurred while clustering.',
        'api.clustering_minimum_help': 'Tip: DBSCAN needs at least 2 matches to build a cluster.',
        'api.emotions_missing_detections': 'There are no previous detections for emotion analysis.',
        'api.emotions_no_faces_found': 'No cropped faces were found for emotion classification.',
        'api.emotions_completed': 'Emotion analysis completed.',
        'api.emotions_failed': 'An error occurred during emotion analysis.',
        'api.cnn_zip_not_allowed': 'ZIP files are not allowed for CNN because of the computational cost.',
        'api.export_no_data': 'There is no data to export for this session.',
        'api.cleanup_completed': 'The session was cleaned successfully.',
        'api.unknown': 'The operation could not be completed.',
    },
};

function getCurrentLanguage() {
    return localStorage.getItem('aicr_language') || 'es';
}

function createSessionId() {
    return `sess_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function createTabId() {
    return `tab_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function t(key, params = {}) {
    const lang = appState.language || 'es';
    const text = (TRANSLATIONS[lang] && TRANSLATIONS[lang][key]) || TRANSLATIONS.es[key] || key;
    return Object.entries(params).reduce((acc, [name, value]) => acc.replaceAll(`{${name}}`, value), text);
}

function humanizeMethod(method) {
    if (method === 'vj') return 'Viola-Jones';
    if (method === 'cnn') return 'CNN Dlib';
    if (method === 'hog') return 'HOG';
    return method || t('common.none');
}

function humanizeEmotion(emotionKey) {
    const emotion = EMOTION_NAMES[emotionKey];
    if (!emotion) return emotionKey || t('common.none');
    return emotion[appState.language] || emotion.es;
}

function humanizeRoot(rootKey) {
    return t(`vfs.root.${rootKey}`) || ROOT_LABELS[rootKey] || rootKey;
}

function sanitizeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function formatNumber(value, digits = 0) {
    const number = Number(value ?? 0);
    return number.toLocaleString(appState.language === 'es' ? 'es-AR' : 'en-US', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    });
}

function formatFloat(value, digits = 2) {
    return formatNumber(Number(value ?? 0), digits);
}

function formatBytes(bytes) {
    const value = Number(bytes || 0);
    if (value === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
    const size = value / (1024 ** exponent);
    return `${size.toFixed(size >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function formatDuration(seconds) {
    const value = Number(seconds || 0);
    if (value < 60) return `${value.toFixed(1)}s`;
    const minutes = Math.floor(value / 60);
    const remainder = value % 60;
    return `${minutes}m ${remainder.toFixed(0)}s`;
}

function formatConfidence(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return t('common.na');
    const numeric = Number(value);
    return numeric <= 1 ? `${(numeric * 100).toFixed(1)}%` : numeric.toFixed(2);
}

function formatTimestamp(isoString) {
    if (!isoString) return t('common.none');
    const locale = appState.language === 'es' ? 'es-AR' : 'en-US';
    return new Date(isoString).toLocaleString(locale, {
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function loadParametersFromDefaults() {
    const params = {};
    PARAMETER_CONFIG.forEach((group) => {
        params[group.key] = {};
        group.controls.forEach((control) => {
            params[group.key][control.key] = control.default;
        });
    });
    return params;
}

function loadParameters() {
    const stored = JSON.parse(localStorage.getItem('aicr_parameters') || '{}');
    const defaults = loadParametersFromDefaults();
    PARAMETER_CONFIG.forEach((group) => {
        group.controls.forEach((control) => {
            defaults[group.key][control.key] = stored[group.key]?.[control.key] ?? control.default;
        });
    });
    return defaults;
}

function saveParameters() {
    localStorage.setItem('aicr_parameters', JSON.stringify(appState.parameters));
}

function resolveApiMessage(payload) {
    if (!payload) return t('api.unknown');
    if (payload.message_key) return t(`api.${payload.message_key}`);
    if (payload.error_key) return t(`api.${payload.error_key}`);
    return payload.warning || payload.error || payload.message || payload.mensaje || t('api.unknown');
}

async function apiFetchJson(url, options = {}) {
    const headers = new Headers(options.headers || {});
    if (!headers.has('X-Session-ID')) headers.set('X-Session-ID', appState.sessionId);
    const response = await fetch(url, { ...options, headers });
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await response.json() : null;
    if (!response.ok) {
        const error = new Error(resolveApiMessage(payload));
        error.status = response.status;
        error.payload = payload;
        throw error;
    }
    return payload;
}

function getOptionsForRun(runType) {
    return JSON.parse(JSON.stringify(appState.parameters[runType] || {}));
}

function initializeSession() {
    appState.language = getCurrentLanguage();
    appState.sessionId = sessionStorage.getItem('argus_session_id') || createSessionId();
    appState.tabId = sessionStorage.getItem('aicr_tab_id') || createTabId();
    appState.parameters = loadParameters();
    sessionStorage.setItem('argus_session_id', appState.sessionId);
    sessionStorage.setItem('aicr_tab_id', appState.tabId);
}

function bindEvents() {
    DOM.fileInput.addEventListener('change', handleFileSelection);
    DOM.languageSelect.addEventListener('change', (event) => {
        appState.language = event.target.value;
        localStorage.setItem('aicr_language', appState.language);
        applyTranslations();
        actualizarExplorador();
        actualizarMetricas(false);
    });
    window.addEventListener('pagehide', cleanupSessionOnClose);
    window.addEventListener('beforeunload', cleanupSessionOnClose);
}

async function init() {
    initializeSession();
    registerActiveTab();
    bindEvents();
    applyTranslations();
    renderPreview();
    if (typeof initExamplesBrowser === 'function') {
        await initExamplesBrowser();
    }
    setPreviewMode('list');
    await Promise.all([actualizarExplorador(), actualizarMetricas(false)]);
    appendStatusLine('info', t('alerts.cleanupNotice'));
}

window.addEventListener('load', init);
