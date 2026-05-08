function buildMetricCards(summary) {
    const detection = summary?.detection || {};
    const clustering = summary?.clustering || {};
    const emotions = summary?.emotions || {};
    const session = summary?.session || {};
    const methodsText = detection.methods_used?.length ? detection.methods_used.map(humanizeMethod).join(' • ') : t('common.none');
    const dominantEmotion = emotions?.dominant_emotion ? humanizeEmotion(emotions.dominant_emotion) : t('common.none');
    return [
        { label: t('metrics.card.images'), value: formatNumber(detection.images_processed || 0), meta: t('metrics.card.imagesMeta', { withFaces: formatNumber(detection.images_with_faces || 0) }) },
        { label: t('metrics.card.faces'), value: formatNumber(detection.faces_detected || 0), meta: t('metrics.card.facesMeta', { avg: formatFloat(detection.avg_faces_per_image || 0, 2) }) },
        { label: t('metrics.card.methods'), value: formatNumber(detection.methods_used?.length || 0), meta: t('metrics.card.methodsMeta', { methods: methodsText }) },
        { label: t('metrics.card.clusters'), value: formatNumber(clustering?.clusters_count || 0), meta: t('metrics.card.clustersMeta', { clustered: formatNumber(clustering?.clustered_faces || 0), noise: formatNumber(clustering?.noise_faces || 0) }) },
        { label: t('metrics.card.happiness'), value: `${formatFloat(emotions?.happiness_index || 0, 1)}%`, meta: t('metrics.card.happinessMeta', { emotion: dominantEmotion }) },
        { label: t('metrics.card.time'), value: formatDuration(session.total_processing_time_sec || 0), meta: t('metrics.card.timeMeta', { size: formatBytes(session.storage_bytes || 0) }) },
    ];
}

function renderMetricsCards(summary) {
    DOM.metricsCards.innerHTML = buildMetricCards(summary).map((card) => `
        <div class="col-md-6 col-xl-4">
            <div class="metric-card">
                <div class="metric-card-label">${sanitizeHtml(card.label)}</div>
                <div class="metric-card-value">${sanitizeHtml(card.value)}</div>
                <div class="metric-card-meta">${sanitizeHtml(card.meta)}</div>
            </div>
        </div>
    `).join('');
}

function renderHighlights(summary) {
    const detection = summary?.detection || {};
    const clustering = summary?.clustering || {};
    const emotions = summary?.emotions || {};
    const session = summary?.session || {};
    const clusterParams = clustering?.parameters ? `eps=${clustering.parameters.eps}, min_samples=${clustering.parameters.minSamples}` : t('common.none');
    const items = [
        { label: t('metrics.highlight.imagesWithFaces'), value: formatNumber(detection.images_with_faces || 0) },
        { label: t('metrics.highlight.imagesWithoutFaces'), value: formatNumber(detection.images_without_faces || 0) },
        { label: t('metrics.highlight.maxFaces'), value: formatNumber(detection.max_faces_single_image || 0) },
        { label: t('metrics.highlight.storage'), value: formatBytes(session.storage_bytes || 0) },
        { label: t('metrics.highlight.files'), value: formatNumber(session.files_count || 0) },
        { label: t('metrics.highlight.lastClustering'), value: clustering ? formatTimestamp(clustering.timestamp) : t('common.none') },
        { label: t('metrics.highlight.clusterParams'), value: clusterParams },
        { label: t('metrics.highlight.clusterNoise'), value: formatNumber(clustering?.noise_faces || 0) },
        { label: t('metrics.highlight.lastEmotions'), value: emotions ? formatTimestamp(emotions.timestamp) : t('common.none') },
        { label: t('metrics.highlight.dominantEmotion'), value: emotions?.dominant_emotion ? humanizeEmotion(emotions.dominant_emotion) : t('common.none') },
        { label: t('metrics.highlight.avgConfidence'), value: formatConfidence(emotions?.average_confidence) },
    ];
    const methods = detection.methods_used?.length ? detection.methods_used.map(humanizeMethod) : [];
    DOM.metricHighlights.innerHTML = `
        <div class="metric-list">
            ${items.map((item) => `
                <div class="metric-list-item">
                    <span class="metric-list-label">${sanitizeHtml(item.label)}</span>
                    <span class="metric-list-value">${sanitizeHtml(item.value)}</span>
                </div>
            `).join('')}
        </div>
        <div class="metric-chip-wrap">
            ${(methods.length ? methods : [t('common.none')]).map((method) => `<span class="metric-chip">${sanitizeHtml(method)}</span>`).join('')}
        </div>
    `;
}

function collectRunHistory(state) {
    const detectionRuns = (state?.runs?.detections || []).map((run) => ({ ...run, category: 'detection' }));
    const clusteringRuns = (state?.runs?.clustering || []).map((run) => ({ ...run, category: 'clustering' }));
    const emotionRuns = (state?.runs?.emotions || []).map((run) => ({ ...run, category: 'emotions' }));
    return [...detectionRuns, ...clusteringRuns, ...emotionRuns]
        .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
        .slice(0, 6);
}

function renderRunHistory(state) {
    const runs = collectRunHistory(state);
    if (!runs.length) {
        DOM.runHistory.innerHTML = `<div class="metric-empty-state">${sanitizeHtml(t('metrics.noHistory'))}</div>`;
        return;
    }
    DOM.runHistory.innerHTML = `<div class="history-list">
        ${runs.map((run) => {
            let title = '';
            let meta = '';
            if (run.category === 'detection') {
                title = t('metrics.history.detection', { method: humanizeMethod(run.method) });
                meta = t('metrics.history.meta.detection', { images: formatNumber(run.images_processed || 0), faces: formatNumber(run.faces_detected || 0), time: formatDuration(run.processing_time_sec || 0) });
            } else if (run.category === 'clustering') {
                title = t('metrics.history.clustering');
                meta = t('metrics.history.meta.clustering', { clusters: formatNumber(run.clusters_count || 0), clustered: formatNumber(run.clustered_faces || 0), time: formatDuration(run.processing_time_sec || 0) });
            } else {
                title = t('metrics.history.emotions');
                meta = t('metrics.history.meta.emotions', { faces: formatNumber(run.total_faces_analyzed || 0), happiness: formatFloat(run.happiness_index || 0, 1), time: formatDuration(run.processing_time_sec || 0) });
            }
            return `
                <div class="history-item">
                    <div class="history-item-head">
                        <span>${sanitizeHtml(title)}</span>
                        <span>${sanitizeHtml(formatTimestamp(run.timestamp))}</span>
                    </div>
                    <div class="history-item-meta">${sanitizeHtml(meta)}</div>
                </div>
            `;
        }).join('')}
    </div>`;
}

function destroyChart(chartName) {
    if (appState.charts[chartName]) {
        appState.charts[chartName].destroy();
        appState.charts[chartName] = null;
    }
}

function renderEmotionChart(emotionsSummary) {
    const distribution = emotionsSummary?.distribution || {};
    const labels = Object.keys(distribution);
    const values = labels.map((key) => distribution[key] || 0);
    const hasData = values.some((value) => value > 0);
    destroyChart('emotion');
    DOM.emotionChart.classList.toggle('d-none', !hasData);
    DOM.emotionChartEmpty.classList.toggle('d-none', hasData);
    if (!hasData || typeof Chart === 'undefined') return;
    appState.charts.emotion = new Chart(DOM.emotionChart, {
        type: 'bar',
        data: {
            labels: labels.map(humanizeEmotion),
            datasets: [{ label: t('metrics.emotionChart'), data: values, backgroundColor: ['#ef4444', '#f97316', '#f59e0b', '#22c55e', '#38bdf8', '#6366f1', '#a855f7'], borderRadius: 8 }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            resizeDelay: 150,
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { color: '#cbd5e1' }, grid: { display: false } },
                y: { ticks: { color: '#cbd5e1', precision: 0 }, grid: { color: 'rgba(148, 163, 184, 0.15)' } },
            },
        },
    });
}

function renderMethodChart(detectionSummary) {
    const byMethod = detectionSummary?.by_method || {};
    const labels = Object.keys(byMethod);
    const values = labels.map((key) => byMethod[key]?.faces_detected || 0);
    const hasData = values.some((value) => value > 0);
    destroyChart('method');
    DOM.methodChart.classList.toggle('d-none', !hasData);
    DOM.methodChartEmpty.classList.toggle('d-none', hasData);
    if (!hasData || typeof Chart === 'undefined') return;
    appState.charts.method = new Chart(DOM.methodChart, {
        type: 'doughnut',
        data: {
            labels: labels.map(humanizeMethod),
            datasets: [{ data: values, backgroundColor: ['#38bdf8', '#22c55e', '#f59e0b'], borderWidth: 0 }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            resizeDelay: 150,
            plugins: { legend: { labels: { color: '#cbd5e1' } } },
        },
    });
}

function renderMetrics(state) {
    const summary = state?.summary || { session: {}, detection: {}, clustering: null, emotions: null };
    renderMetricsCards(summary);
    renderHighlights(summary);
    renderRunHistory(state);
    renderEmotionChart(summary.emotions);
    renderMethodChart(summary.detection);
}

async function actualizarMetricas(logStatus = true) {
    try {
        const payload = await apiFetchJson('/api/metricas');
        appState.metricsState = payload.state;
        renderMetrics(payload.state);
        if (logStatus) appendStatusLine('success', t('status.metricsUpdated'));
    } catch (error) {
        renderMetrics({});
    }
}

function extractFilename(dispositionHeader) {
    if (!dispositionHeader) return `aicr_export_${Date.now()}.zip`;
    const match = dispositionHeader.match(/filename="?([^"]+)"?/i);
    return match ? match[1] : `aicr_export_${Date.now()}.zip`;
}

async function exportarDatos() {
    mostrarLoader(true);
    actualizarStatus('processing', t('status.exporting'));
    try {
        const response = await fetch('/api/exportar', { headers: { 'X-Session-ID': appState.sessionId } });
        if (!response.ok) {
            const payload = await response.json();
            throw new Error(resolveApiMessage(payload));
        }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = extractFilename(response.headers.get('Content-Disposition'));
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
        actualizarStatus('success', t('status.exportComplete'));
        await Swal.fire({ icon: 'success', title: t('alerts.infoTitle'), text: t('alerts.exportReady'), background: '#0d1117', color: '#fff' });
    } catch (error) {
        actualizarStatus('error', error.message);
        await Swal.fire({ icon: 'error', title: t('alerts.errorTitle'), text: error.message, background: '#0d1117', color: '#fff' });
    } finally {
        mostrarLoader(false);
    }
}

window.actualizarMetricas = actualizarMetricas;
window.exportarDatos = exportarDatos;
