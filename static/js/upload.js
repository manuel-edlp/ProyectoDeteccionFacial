function buildSelectedFileKey(name, blob) {
    const size = blob?.size ?? 0;
    const type = blob?.type || 'application/octet-stream';
    const lastModified = typeof blob?.lastModified === 'number' ? blob.lastModified : 'na';
    return `${name}::${size}::${type}::${lastModified}`;
}

function addSelectedFile(name, blob) {
    const nextKey = buildSelectedFileKey(name, blob);
    const exists = appState.selectedFiles.some((item) => buildSelectedFileKey(item.name, item.blob) === nextKey);
    if (exists) return false;
    appState.selectedFiles.push({ name, blob });
    return true;
}

function renderPreview() {
    DOM.previewList.innerHTML = '';
    if (appState.selectedFiles.length === 0) {
        DOM.previewControls.style.setProperty('display', 'none', 'important');
        DOM.previewList.classList.add('d-none');
        DOM.btnAddMore.style.display = 'none';
        DOM.btnClearAll.style.display = 'none';
        DOM.dropZone.style.display = 'flex';
        setBadge('idle');
        DOM.previewCount.textContent = t('upload.filesSelected', { count: 0 });
        return;
    }

    DOM.previewControls.style.setProperty('display', 'flex', 'important');
    DOM.previewList.classList.remove('d-none');
    DOM.btnAddMore.style.display = 'block';
    DOM.btnClearAll.style.display = 'block';
    DOM.dropZone.style.display = 'none';
    DOM.previewCount.textContent = t('upload.filesSelected', { count: appState.selectedFiles.length });
    setBadge('ready');

    appState.selectedFiles.forEach((item, index) => {
        const url = URL.createObjectURL(item.blob);
        const div = document.createElement('div');
        div.className = 'preview-item text-light small cursor-pointer d-flex align-items-center w-100';
        div.title = item.name;
        div.onclick = () => previsualizarUpload(index);
        div.innerHTML = `
            <img src="${url}" class="me-2 rounded" alt="${sanitizeHtml(item.name)}">
            <span class="text-truncate flex-grow-1" title="${sanitizeHtml(item.name)}">${sanitizeHtml(item.name)}</span>
            <button class="btn btn-sm btn-outline-danger remove-btn ms-2" onclick="event.stopPropagation(); removeFile(${index})" title="Remove">
                <i class="fa-solid fa-xmark"></i>
            </button>
        `;
        DOM.previewList.appendChild(div);
    });

    DOM.previewList.classList.toggle('view-grid', appState.currentPreviewMode === 'grid');
    DOM.previewList.classList.toggle('view-list', appState.currentPreviewMode !== 'grid');
}

function setPreviewMode(mode) {
    appState.currentPreviewMode = mode;
    DOM.previewList.classList.toggle('view-grid', mode === 'grid');
    DOM.previewList.classList.toggle('view-list', mode !== 'grid');
    document.getElementById('btnGrid').classList.toggle('active', mode === 'grid');
    document.getElementById('btnList').classList.toggle('active', mode !== 'grid');
}

function previsualizarUpload(index) {
    appState.currentLightboxImages = appState.selectedFiles.map((file) => ({
        url: URL.createObjectURL(file.blob),
        name: file.name,
    }));
    abrirVisor(index);
}

function removeFile(index) {
    const [removed] = appState.selectedFiles.splice(index, 1);
    if (removed?.name) {
        for (const selectedPath of Array.from(appState.examplesSelectedPaths)) {
            if (buildExampleUploadName(selectedPath) === removed.name) {
                appState.examplesSelectedPaths.delete(selectedPath);
            }
        }
    }
    renderPreview();
    renderExamplesBrowser();
}

function limpiarSeleccion() {
    appState.selectedFiles = [];
    appState.examplesSelectedPaths.clear();
    DOM.fileInput.value = '';
    renderPreview();
    renderExamplesBrowser();
}

async function handleFileSelection(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    mostrarLoader(true);
    actualizarStatus('processing', t('upload.loadingFiles'));

    try {
        for (const file of files) {
            if (file.name.toLowerCase().endsWith('.zip')) {
                const zip = await JSZip.loadAsync(file);
                for (const entry of Object.values(zip.files)) {
                    if (!entry.dir && /\.(jpg|jpeg|png|webp|bmp)$/i.test(entry.name)) {
                        const blob = await entry.async('blob');
                        addSelectedFile(entry.name, blob);
                    }
                }
            } else if (file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|bmp)$/i.test(file.name)) {
                addSelectedFile(file.name, file);
            }
        }
        renderPreview();
        actualizarStatus('ready', t('status.filesLoaded'));
    } finally {
        mostrarLoader(false);
        event.target.value = '';
    }
}

function buildExampleUploadName(relativePath) {
    return relativePath.replace(/[\\/]/g, '_');
}

function renderExamplesBrowser() {
    if (!DOM.examplesExplorer || !DOM.examplesBreadcrumb || !DOM.examplesSelectionInfo) return;

    const { folders = [], files = [], parentPath = null, breadcrumbs = [] } = appState.examplesEntries || {};

    DOM.examplesBreadcrumb.innerHTML = breadcrumbs.map((crumb, index) => `
        <button type="button" class="example-crumb ${index === breadcrumbs.length - 1 ? 'active' : ''}" data-action="open-folder" data-path="${sanitizeHtml(crumb.path || '')}">
            ${sanitizeHtml(crumb.name || t('upload.examplesRoot'))}
        </button>
    `).join('<span class="example-crumb-separator">/</span>');

    const upButton = parentPath !== null ? `
        <button type="button" class="example-entry example-folder example-up" data-action="open-folder" data-path="${sanitizeHtml(parentPath)}">
            <span class="example-entry-icon"><i class="fa-solid fa-arrow-turn-up"></i></span>
            <span class="example-entry-main">
                <span class="example-entry-name">${sanitizeHtml(t('upload.examplesUp'))}</span>
            </span>
        </button>
    ` : '';

    const folderMarkup = folders.map((folder) => `
        <button type="button" class="example-entry example-folder" data-action="open-folder" data-path="${sanitizeHtml(folder.path)}">
            <span class="example-entry-icon"><i class="fa-regular fa-folder-open"></i></span>
            <span class="example-entry-main">
                <span class="example-entry-name">${sanitizeHtml(folder.name)}</span>
                <span class="example-entry-meta">${sanitizeHtml(folder.path)}</span>
            </span>
        </button>
    `).join('');

    const fileMarkup = files.map((file) => {
        const selected = appState.examplesSelectedPaths.has(file.path);
        return `
            <button type="button" class="example-entry example-file ${selected ? 'is-selected' : ''}" data-action="toggle-file" data-path="${sanitizeHtml(file.path)}">
                <img src="${sanitizeHtml(file.url)}" alt="${sanitizeHtml(file.name)}" class="example-thumb">
                <span class="example-entry-main">
                    <span class="example-entry-name">${sanitizeHtml(file.name)}</span>
                    <span class="example-entry-meta">${sanitizeHtml(file.path)}</span>
                </span>
                <span class="example-select-indicator"><i class="fa-solid ${selected ? 'fa-circle-check' : 'fa-circle'}"></i></span>
            </button>
        `;
    }).join('');

    DOM.examplesExplorer.innerHTML = upButton || folderMarkup || fileMarkup
        ? `${upButton}<div class="example-entry-list">${folderMarkup}${fileMarkup}</div>`
        : `<div class="example-empty-state">${sanitizeHtml(t('upload.examplesEmpty'))}</div>`;

    DOM.examplesSelectionInfo.textContent = t('upload.examplesSelected', { count: appState.examplesSelectedPaths.size });
}

async function loadExamplesDirectory(path = '') {
    try {
        const payload = await apiFetchJson(`/api/examples?path=${encodeURIComponent(path)}`);
        appState.examplesCurrentPath = payload.path || '';
        appState.examplesEntries = {
            folders: payload.folders || [],
            files: payload.files || [],
            parentPath: payload.parent_path ?? null,
            breadcrumbs: payload.breadcrumbs || [{ name: t('upload.examplesRoot'), path: '' }],
        };
        renderExamplesBrowser();
    } catch (error) {
        if (DOM.examplesExplorer) {
            DOM.examplesExplorer.innerHTML = `<div class="example-empty-state text-danger">${sanitizeHtml(t('upload.examplesLoadError'))}</div>`;
        }
        if (DOM.examplesSelectionInfo) {
            DOM.examplesSelectionInfo.textContent = error.message;
        }
    }
}

async function fetchExampleAsFile(relativePath) {
    if (appState.exampleFileCache.has(relativePath)) {
        return appState.exampleFileCache.get(relativePath);
    }

    const encodedPath = relativePath.split('/').map((segment) => encodeURIComponent(segment)).join('/');
    const response = await fetch(`/api/examples/file/${encodedPath}`);
    if (!response.ok) {
        throw new Error(t('upload.examplesLoadError'));
    }

    const blob = await response.blob();
    const filename = buildExampleUploadName(relativePath);
    const file = new File([blob], filename, {
        type: blob.type || 'image/jpeg',
        lastModified: 0,
    });
    appState.exampleFileCache.set(relativePath, file);
    return file;
}

async function toggleExampleFile(relativePath) {
    const wasSelected = appState.examplesSelectedPaths.has(relativePath);
    if (wasSelected) {
        appState.examplesSelectedPaths.delete(relativePath);
        renderExamplesBrowser();
        return;
    }

    const file = await fetchExampleAsFile(relativePath);
    appState.examplesSelectedPaths.add(relativePath);
    addSelectedFile(file.name, file);
    renderPreview();
    renderExamplesBrowser();
    actualizarStatus('ready', t('upload.examplesLoaded'));
}

function bindExamplesBrowserEvents() {
    DOM.btnRefreshExamples?.addEventListener('click', () => {
        loadExamplesDirectory(appState.examplesCurrentPath);
    });

    DOM.examplesBreadcrumb?.addEventListener('click', (event) => {
        const trigger = event.target.closest('[data-action="open-folder"]');
        if (!trigger) return;
        loadExamplesDirectory(trigger.dataset.path || '');
    });

    DOM.examplesExplorer?.addEventListener('click', async (event) => {
        const trigger = event.target.closest('[data-action]');
        if (!trigger) return;

        const action = trigger.dataset.action;
        const path = trigger.dataset.path || '';

        if (action === 'open-folder') {
            await loadExamplesDirectory(path);
            return;
        }

        if (action === 'toggle-file') {
            await toggleExampleFile(path);
        }
    });
}

async function initExamplesBrowser() {
    bindExamplesBrowserEvents();
    await loadExamplesDirectory('');
}

window.setPreviewMode = setPreviewMode;
window.limpiarSeleccion = limpiarSeleccion;
window.removeFile = removeFile;
