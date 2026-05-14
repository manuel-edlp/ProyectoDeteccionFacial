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
    selectedMotor: 'vj',
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
        'hero.title': 'Detección, clustering y análisis de rostros asistido por IA.',
        'hero.subtitle': 'Entorno de pruebas para visión computacional: un recorrido por la evolución de la IA, integrando herramientas de detección, agrupación y análisis de sentimientos para el estudio del reconocimiento facial moderno.',
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
        'vfs.parameterHint': 'Si los resultados presentan falsos positivos o no son los esperados, ajustá los parámetros en el laboratorio para optimizar la precisión del motor seleccionado.',
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
        
        // ACADEMIA
        'academy.title': 'Base de Conocimiento IA',
        'academy.desc': 'Comprender qué pasa debajo del capó te permite tomar mejores decisiones analíticas. Explora el mundo de la visión artificial, desde los conceptos base hasta el funcionamiento de cada motor.',
        'academy.eco_title': 'El Ecosistema de la IA y Clasificación',
        'academy.eco_text': 'La "Inteligencia Artificial" es un término paraguas. Dentro de ella existe el <strong>Machine Learning</strong> (algoritmos que aprenden de datos sin ser programados explícitamente) y, más profundo aún, el <strong>Deep Learning</strong> (redes neuronales complejas inspiradas en el cerebro humano). A su vez, los modelos se dividen en <strong>Supervisados</strong> (aprenden con ejemplos etiquetados, ej: "esto es una cara") y <strong>No Supervisados</strong> (encuentran patrones por sí solos en datos desordenados).',
        'academy.vj_badge': 'ML Supervisado Clásico',
        'academy.hog_badge': 'ML Supervisado Clásico',
        'academy.cnn_badge': 'Deep Learning Supervisado',
        'academy.dbscan_badge': 'ML No Supervisado',
        'academy.motors_title': 'Los Motores de Análisis',
        'academy.motors_text': 'Los 5 modelos utilizados en esta plataforma no son simples variaciones de un mismo código, sino que pertenecen a generaciones tecnológicas distintas de la visión por computadora. Selecciona un motor a continuación para descubrir su funcionamiento interno, cuándo es tu mejor opción, y cómo sus parámetros alteran la balanza entre precisión y rendimiento.',
        'academy.vj_desc': 'Detección Rápida',
        'academy.hog_desc': 'Gradientes Estructurales',
        'academy.cnn_desc': 'Deep Learning MMOD',
        'academy.dbscan_desc': 'Agrupación por Densidad',
        'academy.emotions_desc': 'Análisis de Emociones',
        'academy.how_it_works': '¿Cómo funciona internamente?',
        'academy.vj_how_text': 'Revolucionó la visión por computadora. No busca "ojos" o "narices" directamente, sino que escanea la imagen usando <strong>Características de Haar</strong> (bloques de contraste, ej: el área de los ojos es más oscura que las mejillas). Utiliza una estructura llamada "Imagen Integral" para hacer sumas de píxeles al instante. Finalmente, pasa la imagen por una <strong>Cascada Atencional</strong>: etapas sucesivas donde descarta rápidamente áreas que no son rostros, concentrando el cómputo solo en candidatos fuertes.',
        'academy.when_to_use': '¿Cuándo usarlo?',
        'academy.vj_when_1': 'Ideal para procesamiento en tiempo real (webcams, videos).',
        'academy.vj_when_2': 'Hardware con recursos limitados.',
        'academy.vj_when_3': 'Rostros completamente frontales y bien iluminados.',
        'academy.disadvantages': 'Desventajas',
        'academy.vj_con_1': 'Pésimo con rostros de perfil o inclinados.',
        'academy.vj_con_2': 'Muy sensible a sombras cruzadas.',
        'academy.vj_con_3': 'Alto índice de falsos positivos (detecta cosas que no son caras) si no se ajusta bien.',
        'academy.key_params': 'Parámetros clave',
        'academy.vj_param_1_desc': 'El detector escanea la imagen buscando caras de 30x30, luego amplía la "lupa" un porcentaje (ej. 10%) y vuelve a buscar. Este valor dictamina ese porcentaje.',
        'academy.vj_param_1_up': 'Aumentarlo (ej. 1.5): Salta tamaños rápidamente. Súper rápido, pero puede saltearse el tamaño exacto del rostro en la foto.',
        'academy.vj_param_1_down': 'Disminuirlo (ej. 1.05): Escanea meticulosamente todos los tamaños posibles. Detectará más, pero será computacionalmente lento.',
        'academy.vj_param_2_desc': 'Como el algoritmo detecta múltiples "rectángulos" sobre una misma cara real, este valor exige cuántos rectángulos superpuestos se necesitan para confirmar definitivamente un rostro.',
        'academy.vj_param_2_up': 'Aumentarlo (ej. 6-10): Filtra estrictamente. Adiós a los falsos positivos, pero corres el riesgo de perder caras reales borrosas.',
        'academy.vj_param_2_down': 'Disminuirlo (ej. 1-2): Permisivo. Detectarás hasta caras ocultas, pero también texturas de pared o manchas que parecen rostros.',
        'academy.hog_how_text': 'En vez de mirar los colores, HOG mira la "estructura". Divide la imagen en pequeñas celdas y calcula la dirección hacia donde cambia más rápido la luz (el gradiente, es decir, los bordes). Un rostro humano tiene un patrón de bordes muy específico (contorno de la cabeza, cuencas de los ojos). Estos patrones se introducen a un <strong>Clasificador SVM Lineal</strong> entrenado previamente con miles de rostros para decidir si el patrón actual es humano o no.',
        'academy.hog_when_1': 'El punto dulce entre velocidad y fiabilidad (Balanceado).',
        'academy.hog_when_2': 'Robusto a cambios de iluminación (porque solo mira cambios de contraste, no colores).',
        'academy.hog_when_3': 'Excelente para imágenes de calidad media en adelante.',
        'academy.hog_con_1': 'Lento en imágenes gigantes si no se reduce su tamaño.',
        'academy.hog_con_2': 'Le cuesta identificar rostros extremadamente pequeños o muy ladeados.',
        'academy.hog_con_3': 'No percibe bien detalles finos si la imagen está pixelada.',
        'academy.hog_param_1_desc': 'HOG fue entrenado para buscar rostros de un tamaño fijo (ej. 80x80 px). Si en tu foto la cara mide 40x40, el modelo no la verá. El "Upsample" estira o amplía artificialmente toda la imagen original antes de que HOG la analice, haciendo grandes las caras pequeñas.',
        'academy.hog_param_1_up': 'Aumentarlo (ej. 2 o 3): Encuentra rostros lejanos en fotos panorámicas. El costo de RAM y tiempo de CPU se dispara exponencialmente.',
        'academy.hog_param_1_down': 'Disminuirlo (ej. 0): Usa la imagen tal cual. Máxima velocidad, pero no verá personas en el fondo de la foto.',
        'academy.cnn_how_text': 'Usa Aprendizaje Profundo puro. Pasa la imagen a través de capas convolucionales que aprenden jerárquicamente: primero detectan líneas, luego formas como ojos, y al final rostros completos. Se entrenó usando un método llamado <strong>Max-Margin Object Detection (MMOD)</strong>, que requiere muchísimos menos datos de entrenamiento que otras redes para lograr resultados superiores, optimizando la pérdida global de la imagen completa en lugar de ventanas individuales.',
        'academy.cnn_when_1': 'Cuando la <strong>precisión lo es todo</strong>.',
        'academy.cnn_when_2': 'Rostros ocluidos, de perfil extremo, en la sombra, o invertidos.',
        'academy.cnn_when_3': 'Disponibilidad de Aceleración por Hardware (GPU).',
        'academy.cnn_con_1': 'Extremadamente pesado computacionalmente. En CPU toma varios segundos por imagen.',
        'academy.cnn_con_2': 'Consume una cantidad altísima de memoria RAM durante la inferencia.',
        'academy.cnn_param_1_desc': 'Como las CNN procesan cada píxel densamente, pasarle una imagen de 4K directamente agotaría la RAM y tomaría minutos. Este parámetro encoge la imagen a un ancho manejable antes de dársela a la red neuronal.',
        'academy.cnn_param_1_up': 'Aumentarlo (ej. 1600px): Conservas todo el detalle de caras lejanas, precisión quirúrgica, a costo de un impacto severo en la memoria.',
        'academy.cnn_param_1_down': 'Disminuirlo (ej. 400px): Velocidad aceptable en CPU, pero todo detalle pequeño se pierde por la compresión.',
        'academy.cnn_param_2_desc': 'Igual que en HOG, pero combinado con Resize Width. Primero se reduce la imagen, y luego se aplica el upsample si se indica. Ayuda a que la CNN vea rostros que quedaron miniaturizados por el resize inicial.',
        'academy.dbscan_how_text': 'Para agrupar caras de una misma persona, la app primero transforma cada rostro en un "vector de 128 dimensiones" (embedding). El algoritmo <strong>Density-Based Spatial Clustering of Applications with Noise</strong> imagina estos vectores flotando en un espacio 3D (128D, en realidad). Empieza a agrupar los puntos que están amontonados cerca (alta densidad). Los puntos que quedan aislados y solos se descartan asumiendo que son <strong>Ruido</strong> (caras que aparecen una sola vez o errores de detección).',
        'academy.dbscan_when_1': 'Clasificación no supervisada (no sabes cuántas personas diferentes hay en tus fotos, ni quiénes son).',
        'academy.dbscan_when_2': 'Extraer a los protagonistas de un evento (aparecerán repetidas veces formando clusters).',
        'academy.dbscan_con_1': 'Personas que cambian radicalmente de aspecto (lentes, de perfil extremo a frontal) pueden terminar en clusters distintos.',
        'academy.dbscan_con_2': 'Personas muy parecidas entre sí (gemelos) podrían fusionarse.',
        'academy.dbscan_param_1_desc': 'Es la "distancia máxima" permitida entre dos puntos para considerarlos del mismo grupo. Básicamente: ¿qué tan diferentes pueden ser dos caras para que yo siga asumiendo que son la misma persona?',
        'academy.dbscan_param_1_up': 'Aumentarlo (ej. 0.8): Muy tolerante. Une muchísimas fotos, pero terminarás con clusters híbridos mezclando distintas personas.',
        'academy.dbscan_param_1_down': 'Disminuirlo (ej. 0.3): Súper estricto. Separará a la misma persona si en una foto sonríe y en otra está seria. Genera muchos mini-clusters y mucho ruido.',
        'academy.dbscan_param_2_desc': 'El núcleo duro. ¿Cuántas apariciones repetidas de la misma persona necesito ver para decidir que merece su propia carpeta (cluster) y no es solo ruido ocasional?',
        'academy.dbscan_param_2_up': 'Aumentarlo (ej. 5): Formará clusters muy sólidos solo con personas que aparecen en muchas fotos. Limpia el ruido, pero descarta a invitados que salieron en 3 o 4 fotos.',
        'academy.dbscan_param_2_down': 'Disminuirlo (ej. 2): Cualquiera que aparezca al menos 2 veces tendrá su carpeta. Útil en set de datos pequeños, pero genera muchas carpetas irrelevantes.',
        'academy.emotions_how_text': 'Para clasificar emociones, la aplicación utiliza una red neuronal convolucional (CNN) súper ligera llamada <strong>Mini-Xception</strong>. Esta arquitectura usa un truco llamado "Convoluciones Separables en Profundidad" (Depthwise Separable Convolutions), lo que le permite aprender los sutiles dobleces de la cara, arrugas y formas de la boca usando solo 60,000 parámetros (una red típica usaría millones). Toma la imagen del rostro ya recortada, la pasa a escala de grises, y devuelve una distribución de probabilidades para 7 emociones universales.',
        'academy.emotions_when_1': 'Análisis de sentimiento en clientes (retail, satisfacción).',
        'academy.emotions_when_2': 'Clasificación rápida post-detección, ya que el modelo es tan ligero que puede correr en tiempo real incluso en CPUs básicas.',
        'academy.emotions_con_1': 'Altamente dependiente de una buena detección previa: si el recorte del rostro incluye mucho fondo o está mal centrado, la predicción falla.',
        'academy.emotions_con_2': 'Limitado a 7 emociones básicas; no detecta microexpresiones complejas (como "aburrimiento" o "confusión").',
        'academy.considerations': 'Consideraciones',
        'academy.res_color': 'Resolución y Color',
        'academy.emotions_param_desc': 'Aunque no hay hiperparámetros ajustables en la consola para esta red, es vital entender que el modelo fue entrenado con imágenes de <strong>48x48 píxeles en escala de grises</strong> (Dataset FER-2013). Internamente, la app convierte tu rostro detectado a este formato. Si la foto original es de bajísima resolución o el rostro detectado es diminuto, al estirarlo a 48x48 se pixelará y el modelo clasificará mal la emoción.',
        
        // GLOSARIO
        'glossary.title': 'Glosario Técnico',
        'glossary.bbox_title': 'Bounding Box (Caja Delimitadora)',
        'glossary.bbox_text': 'El rectángulo matemático (definido por coordenadas X, Y, Ancho y Alto) que el algoritmo dibuja alrededor de un objeto detectado para enmarcarlo en la imagen.',
        'glossary.grayscale_title': 'Escala de Grises (Grayscale)',
        'glossary.grayscale_text': 'Proceso de eliminar los canales de color (RGB) de una imagen. Analizar 1 solo canal en lugar de 3 reduce el tiempo de procesamiento en un 66% sin perder la estructura del rostro.',
        'glossary.haar_title': 'Características de Haar',
        'glossary.haar_text': 'Plantillas matemáticas que buscan contrastes simples (luz/sombra) en la imagen. Por ejemplo, el puente de la nariz suele ser más claro que las cuencas de los ojos.',
        'glossary.integral_title': 'Imagen Integral',
        'glossary.integral_text': 'Un truco matemático que permite calcular la suma de los píxeles de cualquier rectángulo en solo 4 operaciones. Es lo que hace a Viola-Jones tan rápido.',
        'glossary.gradient_title': 'Gradiente de Imagen',
        'glossary.gradient_text': 'La dirección hacia donde cambia más rápido la luz. HOG dibuja "flechas" apuntando de lo oscuro a lo claro, creando un esqueleto de bordes del rostro.',
        'glossary.separable_title': 'Convoluciones Separables',
        'glossary.separable_text': 'Técnica de Deep Learning que separa el análisis de formas del análisis de canales de color, reduciendo drásticamente la potencia de cálculo necesaria.',
        'glossary.clustering_title': 'Clustering (Agrupamiento)',
        'glossary.clustering_text': 'Técnica de Machine Learning no supervisado donde la IA junta elementos que "se parecen" matemáticamente en un espacio de muchas dimensiones.',
        'glossary.outliers_title': 'Ruido / Outliers',
        'glossary.outliers_text': 'Puntos de datos (rostros) que están demasiado lejos de cualquier grupo. En esta app, suelen ser falsos positivos o personas que aparecen una sola vez.',
        'glossary.precision_recall_title': 'Precisión vs Exhaustividad',
        'glossary.precision_recall_text': 'La Precisión mide qué tan confiable es una detección. La Exhaustividad (Recall) mide cuántas caras totales del total real logró encontrar la IA.',
        'glossary.overfitting_title': 'Sobreajuste (Overfitting)',
        'glossary.overfitting_text': 'Cuando un modelo "memoriza" las fotos de entrenamiento en lugar de aprender patrones generales, fallando al ver imágenes nuevas del mundo real.',
        'glossary.embedding_title': 'Embedding',
        'glossary.embedding_text': 'Una representación matemática (un vector de 128 dimensiones) que resume las características únicas de un rostro, permitiendo compararlos numéricamente.',
        'glossary.svm_title': 'Clasificador SVM',
        'glossary.svm_text': 'Support Vector Machine. Un algoritmo clásico que traza una línea divisoria en un espacio multidimensional para separar categorías ("cara" vs "no cara").',
        'glossary.cnn_title': 'Red Convolucional (CNN)',
        'glossary.cnn_text': 'Red neuronal que usa filtros para escanear la imagen por partes, aprendiendo patrones jerárquicos (líneas -> formas -> rostros completos).',
        'glossary.mmod_title': 'MMOD',
        'glossary.mmod_text': 'Max-Margin Object Detection. Técnica para CNNs que optimiza la detección evaluando la imagen completa a la vez, mejorando la precisión en rostros difíciles.',
        'glossary.inference_title': 'Inferencia vs Entrenamiento',
        'glossary.inference_text': 'El Entrenamiento es el aprendizaje inicial del modelo. La Inferencia es el proceso de usar ese conocimiento para procesar tus fotos en tiempo real.',
    },
    en: {
        'hero.kicker': 'Facial analysis platform',
        'hero.title': 'AI-assisted face detection, clustering, and analysis.',
        'hero.subtitle': 'Computer vision testing environment: a journey through the evolution of AI, integrating detection, clustering, and sentiment analysis tools for the study of modern facial recognition.',
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
        'vfs.parameterHint': 'If the results show false positives or are not as expected, adjust the parameters in the laboratory to optimize the accuracy of the selected engine.',
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
        
        // ACADEMY
        'academy.title': 'AI Knowledge Base',
        'academy.desc': 'Understanding what happens under the hood allows you to make better analytical decisions. Explore the world of computer vision, from core concepts to the inner workings of each engine.',
        'academy.eco_title': 'The AI Ecosystem and Classification',
        'academy.eco_text': '"Artificial Intelligence" is an umbrella term. Inside it, we find <strong>Machine Learning</strong> (algorithms that learn from data without being explicitly programmed) and, deeper still, <strong>Deep Learning</strong> (complex neural networks inspired by the human brain). Models are further divided into <strong>Supervised</strong> (learning from labeled examples, e.g., "this is a face") and <strong>Unsupervised</strong> (finding patterns on their own in messy data).',
        'academy.vj_badge': 'Classic Supervised ML',
        'academy.hog_badge': 'Classic Supervised ML',
        'academy.cnn_badge': 'Supervised Deep Learning',
        'academy.dbscan_badge': 'Unsupervised ML',
        'academy.motors_title': 'Analysis Engines',
        'academy.motors_text': 'The 5 models used in this platform are not simple variations of the same code, but belong to different technological generations of computer vision. Select an engine below to discover its inner workings, when it is your best choice, and how its parameters change the balance between precision and performance.',
        'academy.vj_desc': 'Fast Detection',
        'academy.hog_desc': 'Structural Gradients',
        'academy.cnn_desc': 'MMOD Deep Learning',
        'academy.dbscan_desc': 'Density Clustering',
        'academy.emotions_desc': 'Emotion Analysis',
        'academy.how_it_works': 'How does it work internally?',
        'academy.vj_how_text': 'It revolutionized computer vision. It does not look for "eyes" or "noses" directly, but scans the image using <strong>Haar-like Features</strong> (contrast blocks, e.g., the eye area is darker than the cheeks). It uses a structure called "Integral Image" to perform pixel sums instantly. Finally, it passes the image through an <strong>Attentional Cascade</strong>: successive stages that quickly discard non-face areas, focusing computation only on strong candidates.',
        'academy.when_to_use': 'When to use it?',
        'academy.vj_when_1': 'Ideal for real-time processing (webcams, videos).',
        'academy.vj_when_2': 'Hardware with limited resources.',
        'academy.vj_when_3': 'Fully frontal and well-lit faces.',
        'academy.disadvantages': 'Disadvantages',
        'academy.vj_con_1': 'Poor performance with profile or tilted faces.',
        'academy.vj_con_2': 'Very sensitive to crossed shadows.',
        'academy.vj_con_3': 'High false positive rate (detects non-faces) if not properly tuned.',
        'academy.key_params': 'Key parameters',
        'academy.vj_param_1_desc': 'The detector scans the image searching for 30x30 faces, then expands the "magnifying glass" by a percentage (e.g., 10%) and searches again. This value dictates that percentage.',
        'academy.vj_param_1_up': 'Increase it (e.g., 1.5): Skips sizes quickly. Super fast, but might skip the exact face size in the photo.',
        'academy.vj_param_1_down': 'Decrease it (e.g., 1.05): Scans meticulously through all possible sizes. Detects more, but is computationally slow.',
        'academy.vj_param_2_desc': 'Since the algorithm detects multiple "rectangles" over the same real face, this value requires how many overlapping rectangles are needed to definitively confirm a face.',
        'academy.vj_param_2_up': 'Increase it (e.g., 6-10): Filters strictly. Goodbye false positives, but you risk missing blurry real faces.',
        'academy.vj_param_2_down': 'Decrease it (e.g., 1-2): Permissive. Detects even hidden faces, but also wall textures or spots that look like faces.',
        'academy.hog_how_text': 'Instead of looking at colors, HOG looks at "structure". It divides the image into small cells and calculates the direction in which light changes fastest (the gradient, i.e., edges). A human face has a very specific edge pattern (head contour, eye sockets). These patterns are fed into a <strong>Linear SVM Classifier</strong> previously trained with thousands of faces to decide if the current pattern is human or not.',
        'academy.hog_when_1': 'The sweet spot between speed and reliability (Balanced).',
        'academy.hog_when_2': 'Robust to lighting changes (as it only looks at contrast changes, not colors).',
        'academy.hog_when_3': 'Excellent for medium to high quality images.',
        'academy.hog_con_1': 'Slow on giant images if not resized.',
        'academy.hog_con_2': 'Struggles to identify extremely small or highly tilted faces.',
        'academy.hog_con_3': 'Does not perceive fine details well if the image is pixelated.',
        'academy.hog_param_1_desc': 'HOG was trained to look for faces of a fixed size (e.g., 80x80 px). If the face in your photo is 40x40, the model will not see it. "Upsample" artificially stretches or enlarges the entire original image before HOG analyzes it, making small faces larger.',
        'academy.hog_param_1_up': 'Increase it (e.g., 2 or 3): Finds distant faces in panoramic photos. RAM and CPU time costs explode exponentially.',
        'academy.hog_param_1_down': 'Decrease it (e.g., 0): Uses the image as is. Maximum speed, but will not see people in the background.',
        'academy.cnn_how_text': 'Uses pure Deep Learning. It passes the image through convolutional layers that learn hierarchically: first detecting lines, then shapes like eyes, and finally full faces. It was trained using a method called <strong>Max-Margin Object Detection (MMOD)</strong>, which requires far less training data than other networks to achieve superior results, optimizing the global loss of the entire image instead of individual windows.',
        'academy.cnn_when_1': 'When <strong>accuracy is everything</strong>.',
        'academy.cnn_when_2': 'Occluded, extreme profile, shadowed, or inverted faces.',
        'academy.cnn_when_3': 'Hardware Acceleration (GPU) availability.',
        'academy.cnn_con_1': 'Extremely computationally heavy. Takes several seconds per image on CPU.',
        'academy.cnn_con_2': 'Consumes a very high amount of RAM during inference.',
        'academy.cnn_param_1_desc': 'As CNNs process each pixel densely, passing a 4K image directly would exhaust RAM and take minutes. This parameter shrinks the image to a manageable width before feeding it to the neural network.',
        'academy.cnn_param_1_up': 'Increase it (e.g., 1600px): Preserves all detail for distant faces, surgical precision, at the cost of a severe impact on memory.',
        'academy.cnn_param_1_down': 'Decrease it (e.g., 400px): Acceptable speed on CPU, but small details are lost due to compression.',
        'academy.cnn_param_2_desc': 'Same as in HOG, but combined with Resize Width. The image is first reduced, and then upsampling is applied if indicated. Helps the CNN see faces that were miniaturized by the initial resize.',
        'academy.dbscan_how_text': 'To group faces of the same person, the app first transforms each face into a "128-dimensional vector" (embedding). The <strong>Density-Based Spatial Clustering of Applications with Noise</strong> algorithm imagines these vectors floating in a 3D space (128D, actually). It starts grouping points that are crowded together (high density). Isolated points are discarded assuming they are <strong>Noise</strong> (faces that appear only once or detection errors).',
        'academy.dbscan_when_1': 'Unsupervised classification (you do not know how many different people are in your photos, nor who they are).',
        'academy.dbscan_when_2': 'Extract the main subjects of an event (they will appear repeatedly forming clusters).',
        'academy.dbscan_con_1': 'People who radically change appearance (glasses, extreme profile to frontal) might end up in different clusters.',
        'academy.dbscan_con_2': 'Very similar looking people (twins) might merge.',
        'academy.dbscan_param_1_desc': 'It is the "maximum distance" allowed between two points to consider them from the same group. Basically: how different can two faces be for me to still assume they are the same person?',
        'academy.dbscan_param_1_up': 'Increase it (e.g., 0.8): Very tolerant. Joins many photos, but you will end up with hybrid clusters mixing different people.',
        'academy.dbscan_param_1_down': 'Decrease it (e.g., 0.3): Super strict. Will separate the same person if they smile in one photo and are serious in another. Generates many mini-clusters and lots of noise.',
        'academy.dbscan_param_2_desc': 'The core. How many repeated appearances of the same person do I need to see to decide they deserve their own folder (cluster) and are not just occasional noise?',
        'academy.dbscan_param_2_up': 'Increase it (e.g., 5): Will form very solid clusters only with people who appear in many photos. Cleans noise, but discards guests who appeared in 3 or 4 photos.',
        'academy.dbscan_param_2_down': 'Decrease it (e.g., 2): Anyone appearing at least twice will have their folder. Useful in small datasets, but generates many irrelevant folders.',
        'academy.emotions_how_text': 'To classify emotions, the application uses a super lightweight convolutional neural network (CNN) called <strong>Mini-Xception</strong>. This architecture uses a trick called "Depthwise Separable Convolutions", allowing it to learn subtle face folds, wrinkles, and mouth shapes using only 60,000 parameters (a typical network would use millions). It takes the already cropped face image, converts it to grayscale, and returns a probability distribution for 7 universal emotions.',
        'academy.emotions_when_1': 'Customer sentiment analysis (retail, satisfaction).',
        'academy.emotions_when_2': 'Fast post-detection classification, as the model is so light it can run in real-time even on basic CPUs.',
        'academy.emotions_con_1': 'Highly dependent on good prior detection: if the face crop includes too much background or is poorly centered, the prediction fails.',
        'academy.emotions_con_2': 'Limited to 7 basic emotions; does not detect complex microexpressions (like "boredom" or "confusion").',
        'academy.considerations': 'Considerations',
        'academy.res_color': 'Resolution and Color',
        'academy.emotions_param_desc': 'While there are no adjustable hyperparameters in the console for this network, it is vital to understand that the model was trained with <strong>48x48 pixel grayscale images</strong> (FER-2013 Dataset). Internally, the app converts your detected face to this format. If the original photo is very low resolution or the detected face is tiny, stretching it to 48x48 will cause pixelation and the model will misclassify the emotion.',
        
        // GLOSSARY
        'glossary.title': 'Technical Glossary',
        'glossary.bbox_title': 'Bounding Box',
        'glossary.bbox_text': 'The mathematical rectangle (defined by X, Y, Width, and Height coordinates) that the algorithm draws around a detected object to frame it in the image.',
        'glossary.grayscale_title': 'Grayscale',
        'glossary.grayscale_text': 'Process of removing color channels (RGB) from an image. Analyzing only 1 channel instead of 3 reduces processing time by 66% without losing face structure.',
        'glossary.haar_title': 'Haar-like Features',
        'glossary.haar_text': 'Mathematical templates that search for simple contrasts (light/shadow) in the image. For example, the bridge of the nose is usually lighter than the eye sockets.',
        'glossary.integral_title': 'Integral Image',
        'glossary.integral_text': 'A mathematical trick that allows calculating the sum of pixels of any rectangle in just 4 operations. This is what makes Viola-Jones so fast.',
        'glossary.gradient_title': 'Image Gradient',
        'glossary.gradient_text': 'The direction where light changes fastest. HOG draws "arrows" pointing from dark to light, creating a skeleton of face edges.',
        'glossary.separable_title': 'Separable Convolutions',
        'glossary.separable_text': 'Deep Learning technique that separates shape analysis from color channel analysis, drastically reducing the required computing power.',
        'glossary.clustering_title': 'Clustering',
        'glossary.clustering_text': 'Unsupervised Machine Learning technique where AI gathers elements that "look alike" mathematically in a high-dimensional space.',
        'glossary.outliers_title': 'Noise / Outliers',
        'glossary.outliers_text': 'Data points (faces) that are too far from any group. In this app, they are usually false positives or people appearing only once.',
        'glossary.precision_recall_title': 'Precision vs. Recall',
        'glossary.precision_recall_text': 'Precision measures how reliable a detection is. Recall measures how many total faces from the actual total the AI managed to find.',
        'glossary.overfitting_title': 'Overfitting',
        'glossary.overfitting_text': 'When a model "memorizes" training photos instead of learning general patterns, failing when seeing new real-world images.',
        'glossary.embedding_title': 'Embedding',
        'glossary.embedding_text': 'A mathematical representation (a 128-dimensional vector) that summarizes the unique characteristics of a face, allowing them to be compared numerically.',
        'glossary.svm_title': 'SVM Classifier',
        'glossary.svm_text': 'Support Vector Machine. A classic algorithm that draws a dividing line in a multidimensional space to separate categories ("face" vs. "not face").',
        'glossary.cnn_title': 'Convolutional Neural Network (CNN)',
        'glossary.cnn_text': 'Neural network that uses filters to scan the image in parts, learning hierarchical patterns (lines -> shapes -> full faces).',
        'glossary.mmod_title': 'MMOD',
        'glossary.mmod_text': 'Max-Margin Object Detection. A technique for CNNs that optimizes detection by evaluating the full image at once, improving accuracy on difficult faces.',
        'glossary.inference_title': 'Inference vs. Training',
        'glossary.inference_text': 'Training is the initial learning of the model. Inference is the process of using that knowledge to process your photos in real-time.',
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
