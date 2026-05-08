async function actualizarExplorador() {
    try {
        const payload = await apiFetchJson('/api/explorar');
        DOM.arbolCarpetas.innerHTML = '';
        let hasContent = false;

        Object.entries(payload).forEach(([parent, children]) => {
            if (!children || children.length === 0) return;
            hasContent = true;
            DOM.arbolCarpetas.insertAdjacentHTML('beforeend', `
                <div class="d-flex justify-content-between align-items-center mt-3 mb-1 border-bottom border-secondary">
                    <span class="fw-bold small text-info text-uppercase" style="font-size:0.7rem;">${sanitizeHtml(humanizeRoot(parent))}</span>
                    <i class="fa-solid fa-trash-can text-danger small cursor-pointer opacity-50 hover-100" onclick="eliminarCapa('${parent}')" title="Delete"></i>
                </div>
            `);

            children.forEach((child) => {
                const fullPath = `${parent}/${child.nombre}`;
                const elementId = `folder-${fullPath.replace(/[\/ .]/g, '-')}`;
                const folderName = parent === 'emociones_clasificadas' ? humanizeEmotion(child.nombre) : child.nombre;
                DOM.arbolCarpetas.insertAdjacentHTML('beforeend', `
                    <div id="${elementId}" class="d-flex justify-content-between align-items-center mb-1 hover-row p-1 rounded folder-item cursor-pointer" onclick="seleccionarCarpeta('${fullPath}', '${elementId}')">
                        <span class="text-white small text-truncate me-2 d-flex align-items-center" style="max-width:75%;">
                            <i class="fa-regular fa-folder me-2 text-warning folder-icon"></i>
                            <span class="folder-name">${sanitizeHtml(folderName)}</span>
                        </span>
                        <div class="d-flex align-items-center gap-2">
                            <span class="badge rounded-pill bg-dark border border-secondary text-info small-badge">${child.conteo}</span>
                            <i class="fa-solid fa-pen text-secondary small grid-hover-edit cursor-pointer" onclick="event.stopPropagation(); renombrarCapa('${fullPath}', '${sanitizeHtml(child.nombre)}')" title="Rename"></i>
                            <i class="fa-solid fa-trash-can text-danger small opacity-50 hover-100" onclick="event.stopPropagation(); eliminarCapa('${fullPath}')" title="Delete"></i>
                        </div>
                    </div>
                `);
            });
        });

        if (hasContent) setBadge('success');
        else if (appState.selectedFiles.length > 0) setBadge('ready');
        else setBadge('idle');
    } catch (error) {
        setBadge('error');
        appendStatusLine('error', t('status.connectionError'));
    }
}

async function seleccionarCarpeta(rutaCompleta, elementId) {
    DOM.visorTitulo.innerHTML = `<i class="fa-solid fa-eye me-1 text-info"></i> ${sanitizeHtml(t('vfs.exploring', { path: rutaCompleta }))}`;
    document.querySelectorAll('.folder-item').forEach((node) => node.classList.remove('active'));
    if (elementId) document.getElementById(elementId)?.classList.add('active');

    if (appState.cacheDeCarpetas.has(rutaCompleta)) {
        renderizarGaleria(appState.cacheDeCarpetas.get(rutaCompleta));
        return;
    }

    try {
        const payload = await apiFetchJson(`/api/listar_imagenes/${rutaCompleta}`);
        appState.cacheDeCarpetas.set(rutaCompleta, payload);
        renderizarGaleria(payload);
    } catch (error) {
        DOM.visorImagenes.innerHTML = `<div class="text-danger p-3">${sanitizeHtml(t('vfs.loadError', { message: error.message }))}</div>`;
    }
}

function renderizarGaleria(data) {
    DOM.visorImagenes.innerHTML = '';
    if (!data.archivos || data.archivos.length === 0) {
        DOM.visorImagenes.innerHTML = `<div class="text-muted p-3">${sanitizeHtml(t('vfs.emptyFolder'))}</div>`;
        return;
    }

    const cleanPath = data.ruta_base.startsWith('/') ? data.ruta_base.slice(1) : data.ruta_base;
    appState.currentLightboxImages = data.archivos.map((file) => ({
        url: `/outputs/${appState.sessionId}/${cleanPath}/${file}?t=${Date.now()}`,
        name: file,
    }));

    data.archivos.forEach((file, index) => {
        const image = document.createElement('img');
        image.src = appState.currentLightboxImages[index].url;
        image.alt = file;
        image.className = 'img-thumbnail bg-dark border-secondary shadow-sm';
        image.style.width = '100px';
        image.style.height = '100px';
        image.style.objectFit = 'cover';
        image.style.cursor = 'pointer';
        image.onclick = () => abrirVisor(index);
        DOM.visorImagenes.appendChild(image);
    });
}

async function eliminarCapa(ruta) {
    const result = await Swal.fire({
        title: t('alerts.deleteTitle'),
        text: t('alerts.deleteText', { path: ruta }),
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: t('common.confirm'),
        cancelButtonText: t('common.cancel'),
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#334155',
        background: '#0d1117',
        color: '#fff',
    });
    if (!result.isConfirmed) return;

    try {
        await apiFetchJson('/api/eliminar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ruta }),
        });
        appState.cacheDeCarpetas.clear();
        DOM.visorImagenes.innerHTML = '';
        DOM.visorTitulo.innerHTML = `<i class="fa-solid fa-eye me-1"></i> ${sanitizeHtml(t('vfs.folderDeleted'))}`;
        actualizarStatus('success', t('status.folderDeleted', { path: ruta }));
        await Promise.all([actualizarExplorador(), actualizarMetricas(false)]);
    } catch (error) {
        actualizarStatus('error', error.message);
    }
}

async function renombrarCapa(rutaActual, nombreAntiguo) {
    const result = await Swal.fire({
        title: t('alerts.renameTitle'),
        input: 'text',
        inputValue: nombreAntiguo,
        inputPlaceholder: t('alerts.renamePlaceholder'),
        showCancelButton: true,
        confirmButtonText: t('common.confirm'),
        cancelButtonText: t('common.cancel'),
        confirmButtonColor: '#4ade80',
        cancelButtonColor: '#334155',
        background: '#0d1117',
        color: '#fff',
        inputValidator: (value) => {
            if (!value) return t('alerts.renameRequired');
            if (!/^[a-zA-Z0-9_ -]+$/.test(value)) return t('alerts.renameInvalid');
            if (value.length > 40) return t('alerts.renameLong');
            return undefined;
        },
    });

    const nuevoNombre = result.value?.trim();
    if (!nuevoNombre || nuevoNombre === nombreAntiguo) return;

    try {
        await apiFetchJson('/api/renombrar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ruta_actual: rutaActual, nuevo_nombre: nuevoNombre }),
        });
        appState.cacheDeCarpetas.clear();
        DOM.visorImagenes.innerHTML = '';
        DOM.visorTitulo.innerHTML = `<i class="fa-solid fa-eye me-1"></i> ${sanitizeHtml(t('vfs.selectFolder'))}`;
        actualizarStatus('success', t('status.folderRenamed'));
        await actualizarExplorador();
    } catch (error) {
        await Swal.fire({
            icon: 'error',
            title: t('alerts.errorTitle'),
            text: error.message,
            background: '#0d1117',
            color: '#fff',
        });
    }
}

window.actualizarExplorador = actualizarExplorador;
window.seleccionarCarpeta = seleccionarCarpeta;
window.eliminarCapa = eliminarCapa;
window.renombrarCapa = renombrarCapa;
