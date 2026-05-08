async function enviar(tipo) {
    if (appState.selectedFiles.length === 0) {
        await Swal.fire({
            icon: 'warning',
            title: t('alerts.warningTitle'),
            text: t('api.no_valid_images'),
            background: '#0d1117',
            color: '#fff',
        });
        return;
    }

    const formData = new FormData();
    appState.selectedFiles.forEach((file) => formData.append('imagenes', file.blob, file.name));
    formData.append('options', JSON.stringify(getOptionsForRun(tipo)));

    mostrarLoader(true);
    startTimer();
    actualizarStatus('processing', t('status.processingDetection', { method: humanizeMethod(tipo) }), { withTimer: true });

    try {
        const payload = await apiFetchJson(`/detectar_rostros/${tipo}`, { method: 'POST', body: formData });
        stopTimer();
        appState.cacheDeCarpetas.clear();
        const noFacesDetected = payload.message_key === 'detection_completed_no_faces';
        actualizarStatus(noFacesDetected ? 'warning' : 'success', `${resolveApiMessage(payload)} (${appState.secondsPassed.toFixed(1)}s)`);
        await Promise.all([actualizarExplorador(), actualizarMetricas(false)]);
    } catch (error) {
        stopTimer();
        const warning = error.status === 422 || error.payload?.status === 'warning';
        actualizarStatus(warning ? 'warning' : 'error', error.message);
        await Swal.fire({
            icon: warning ? 'info' : 'error',
            title: warning ? t('alerts.infoTitle') : t('alerts.serverError'),
            text: error.message,
            footer: error.payload?.help_key ? t(`api.${error.payload.help_key}`) : undefined,
            background: '#0d1117',
            color: '#fff',
        });
    } finally {
        mostrarLoader(false);
    }
}

async function ejecutarEspecial(tipo) {
    const source = DOM.sourceSelect.value;
    const body = { fuente: source };
    if (tipo === 'clustering') body.options = getOptionsForRun('clustering');
    const typeLabel = tipo === 'clustering' ? 'clustering' : t('metrics.history.emotions');
    const sourceLabel = source === 'todas' ? t('sources.all') : source;

    mostrarLoader(true);
    startTimer();
    actualizarStatus('processing', t('status.processingSpecial', { type: typeLabel, source: sourceLabel }), { withTimer: true });

    try {
        const payload = await apiFetchJson(`/procesar/${tipo}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        stopTimer();
        appState.cacheDeCarpetas.clear();
        actualizarStatus('success', `${resolveApiMessage(payload)} (${appState.secondsPassed.toFixed(1)}s)`);
        await Promise.all([actualizarExplorador(), actualizarMetricas(false)]);
    } catch (error) {
        stopTimer();
        const warning = error.status === 422 || error.payload?.status === 'warning';
        actualizarStatus(warning ? 'warning' : 'error', error.message);
        await Swal.fire({
            icon: warning ? 'info' : 'error',
            title: warning ? t('alerts.infoTitle') : t('alerts.serverError'),
            text: error.message,
            footer: error.payload?.help_key ? t(`api.${error.payload.help_key}`) : undefined,
            background: '#0d1117',
            color: '#fff',
        });
        await actualizarMetricas(false);
    } finally {
        mostrarLoader(false);
    }
}

function seleccionarMotor(tipo) {
    appState.selectedMotor = tipo;
    
    // Update UI
    document.querySelectorAll('.detector-card').forEach(btn => {
        btn.classList.remove('is-selected');
    });
    
    const selectedBtn = document.getElementById(`btn-${tipo}`);
    if (selectedBtn) {
        selectedBtn.classList.add('is-selected');
    }
}

function iniciarDeteccionSeleccionada() {
    enviar(appState.selectedMotor);
}

window.enviar = enviar;
window.ejecutarEspecial = ejecutarEspecial;
window.seleccionarMotor = seleccionarMotor;
window.iniciarDeteccionSeleccionada = iniciarDeteccionSeleccionada;
