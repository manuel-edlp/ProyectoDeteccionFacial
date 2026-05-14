function resetParameters() {
    appState.parameters = loadParametersFromDefaults();
    saveParameters();
    renderLabPanels();
}

function setBadge(mode) {
    const map = {
        idle: { className: 'bg-secondary', label: t('badge.waiting') },
        ready: { className: 'bg-primary', label: t('badge.ready') },
        processing: { className: 'bg-warning', label: t('badge.processing') },
        success: { className: 'bg-success', label: t('badge.success') },
        warning: { className: 'bg-warning', label: t('badge.warning') },
        error: { className: 'bg-danger', label: t('badge.error') },
    };
    const config = map[mode] || map.idle;
    appState.badgeMode = mode;
    DOM.statusBadge.className = `badge ${config.className} pulse-badge`;
    if (mode === 'processing' || mode === 'warning') {
        DOM.statusBadge.classList.add('text-dark');
    }
    DOM.statusBadge.textContent = config.label;
}

function appendStatusLine(level, message, withTimer = false) {
    const timestamp = new Date().toLocaleTimeString(appState.language === 'es' ? 'es-AR' : 'en-US');
    const div = document.createElement('div');
    div.className = 'mb-1';
    const color = level === 'error' ? 'danger' : level === 'warning' ? 'warning' : level === 'success' ? 'success' : 'info';
    div.innerHTML = `<span class="opacity-50">[${timestamp}]</span> <span class="text-${color}">${sanitizeHtml(message)}</span>`;
    if (withTimer) {
        const span = document.createElement('span');
        span.className = 'text-warning ms-2';
        span.innerText = ' [0.0s]';
        div.appendChild(span);
        appState.currentTimerSpan = span;
    } else {
        appState.currentTimerSpan = null;
    }
    DOM.statusLog.appendChild(div);
    while (DOM.statusLog.children.length > 200) {
        DOM.statusLog.removeChild(DOM.statusLog.firstElementChild);
    }
    DOM.statusLog.scrollTop = DOM.statusLog.scrollHeight;
}

function actualizarStatus(level, message, { withTimer = false } = {}) {
    const normalized = level === 'processing' ? 'processing' : level === 'success' ? 'success' : level === 'warning' ? 'warning' : level === 'error' ? 'error' : level === 'ready' ? 'ready' : 'idle';
    setBadge(normalized);
    appendStatusLine(level, message, withTimer);
}

function startTimer() {
    appState.secondsPassed = 0;
    if (appState.timerInterval) clearInterval(appState.timerInterval);
    appState.timerInterval = setInterval(() => {
        appState.secondsPassed += 0.1;
        if (appState.currentTimerSpan) appState.currentTimerSpan.innerText = ` [${appState.secondsPassed.toFixed(1)}s]`;
    }, 100);
}

function stopTimer() {
    if (appState.timerInterval) clearInterval(appState.timerInterval);
    appState.timerInterval = null;
}

function mostrarLoader(active) {
    document.body.style.cursor = active ? 'wait' : 'default';
}

function registerActiveTab() {
    const storageKey = `aicr_tabs_${appState.sessionId}`;
    const current = JSON.parse(localStorage.getItem(storageKey) || '[]').filter(Boolean);
    if (!current.includes(appState.tabId)) current.push(appState.tabId);
    localStorage.setItem(storageKey, JSON.stringify(current));
}

function unregisterActiveTab() {
    const storageKey = `aicr_tabs_${appState.sessionId}`;
    const current = JSON.parse(localStorage.getItem(storageKey) || '[]').filter(Boolean);
    const next = current.filter((id) => id !== appState.tabId);
    if (next.length > 0) localStorage.setItem(storageKey, JSON.stringify(next));
    else localStorage.removeItem(storageKey);
    return next.length;
}

function cleanupSessionOnClose() {
    if (appState.cleanupTriggered) return;
    appState.cleanupTriggered = true;
    const remainingTabs = unregisterActiveTab();
    if (remainingTabs > 0) return;
    const payload = JSON.stringify({ sid: appState.sessionId });
    if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/session/cleanup', new Blob([payload], { type: 'application/json' }));
        return;
    }
    fetch('/api/session/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Session-ID': appState.sessionId },
        body: payload,
        keepalive: true,
    }).catch(() => {});
}

function applyTranslations() {
    document.documentElement.lang = appState.language;
    DOM.languageSelect.value = appState.language;
    document.querySelectorAll('[data-i18n]').forEach((node) => {
        node.innerHTML = t(node.dataset.i18n);
    });
    DOM.previewCount.textContent = t('upload.filesSelected', { count: appState.selectedFiles.length });
    DOM.statusInitialLine.textContent = t('status.initial');
    setBadge(appState.badgeMode || (appState.selectedFiles.length ? 'ready' : 'idle'));
    const allOption = DOM.sourceSelect?.querySelector('option[value="todas"]');
    if (allOption) allOption.textContent = t('sources.all');
    renderPreview();
    renderLabPanels();
    if (typeof renderExamplesBrowser === 'function') {
        renderExamplesBrowser();
    }
}

function renderLabPanels() {
    DOM.labPanels.innerHTML = '';
    PARAMETER_CONFIG.forEach((group) => {
        const isCnnDisabled = group.key === 'cnn' && isHuggingFace();
        const col = document.createElement('div');
        col.className = group.controls.length > 1 ? 'col-12' : 'col-md-6';
        
        let controlsHtml = group.controls.map((control) => {
            const value = appState.parameters[group.key][control.key];
            const helpText = sanitizeHtml(t(control.helpKey));
            return `
                <div class="param-row ${isCnnDisabled ? 'opacity-50' : ''}">
                    <div class="param-label">
                        <span class="param-label-text">
                            <span>${sanitizeHtml(t(control.labelKey))}</span>
                            <span class="param-help" title="${helpText}" aria-label="${helpText}">
                                <i class="fa-regular fa-circle-question" aria-hidden="true"></i>
                            </span>
                        </span>
                        <span class="range-value" id="value-${group.key}-${control.key}">${sanitizeHtml(control.format(value))}</span>
                    </div>
                    <input class="form-range param-range" type="range" 
                        min="${control.min}" max="${control.max}" step="${control.step}" 
                        value="${value}" data-group="${group.key}" data-key="${control.key}"
                        ${isCnnDisabled ? 'disabled' : ''}>
                </div>
            `;
        }).join('');

        if (isCnnDisabled) {
            controlsHtml += `
                <div class="mt-3 p-3 rounded-3 bg-dark bg-opacity-50 border border-warning border-opacity-25">
                    <div class="d-flex gap-2 align-items-center text-white mb-1">
                        <i class="fa-solid fa-triangle-exclamation text-warning small"></i>
                        <span class="small fw-bold text-uppercase">${sanitizeHtml(t('lab.cnn.disabled'))}</span>
                    </div>
                    <p class="small text-white-50 mb-0" style="font-size: 0.75rem;">${sanitizeHtml(t('lab.cnn.disabledHelp'))}</p>
                </div>
            `;
        } else {
            controlsHtml += `<div class="small">${sanitizeHtml(t('lab.applyNextRun'))}</div>`;
        }

        col.innerHTML = `
            <div class="lab-card ${isCnnDisabled ? 'is-disabled' : ''}">
                <h6>${sanitizeHtml(t(group.titleKey))}</h6>
                <p class="small mb-3">${sanitizeHtml(t(group.subtitleKey))}</p>
                ${controlsHtml}
            </div>
        `;
        DOM.labPanels.appendChild(col);
    });

    DOM.labPanels.querySelectorAll('.param-range').forEach((input) => {
        input.addEventListener('input', (event) => {
            const { group, key } = event.target.dataset;
            const value = Number(event.target.value);
            appState.parameters[group][key] = value;
            saveParameters();
            const control = PARAMETER_CONFIG.find((item) => item.key === group)?.controls.find((entry) => entry.key === key);
            const label = document.getElementById(`value-${group}-${key}`);
            if (control && label) label.textContent = control.format(value);
        });
    });
}

function startWorkflowCycle() {
    const chips = document.querySelectorAll('.workflow-chip');
    if (!chips.length) return;

    let currentIndex = 0;
    
    setInterval(() => {
        chips.forEach(chip => chip.classList.remove('is-active'));
        currentIndex = (currentIndex + 1) % chips.length;
        chips[currentIndex].classList.add('is-active');
    }, 3000);
}

window.resetParameters = resetParameters;
window.startWorkflowCycle = startWorkflowCycle;

window.addEventListener('load', () => {
    // Wait a bit for the entrance animation to finish
    setTimeout(startWorkflowCycle, 2000);
});
