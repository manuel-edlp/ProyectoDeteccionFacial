function abrirVisor(index) {
    appState.currentLightboxIndex = index;
    actualizarVisor();
    DOM.lightbox.style.display = 'flex';
    document.addEventListener('keydown', handleKeydown);
}

function cerrarVisor() {
    DOM.lightbox.style.display = 'none';
    document.removeEventListener('keydown', handleKeydown);
}

function cambiarImagen(direction) {
    if (!appState.currentLightboxImages.length) return;
    appState.currentLightboxIndex += direction;
    if (appState.currentLightboxIndex < 0) appState.currentLightboxIndex = appState.currentLightboxImages.length - 1;
    if (appState.currentLightboxIndex >= appState.currentLightboxImages.length) appState.currentLightboxIndex = 0;
    actualizarVisor();
}

function actualizarVisor() {
    const current = appState.currentLightboxImages[appState.currentLightboxIndex];
    if (!current) return;
    DOM.lightboxImg.src = current.url;
    DOM.lightboxCaption.textContent = `${current.name} (${appState.currentLightboxIndex + 1}/${appState.currentLightboxImages.length})`;
}

function handleKeydown(event) {
    if (event.key === 'ArrowRight') cambiarImagen(1);
    if (event.key === 'ArrowLeft') cambiarImagen(-1);
    if (event.key === 'Escape') cerrarVisor();
}

window.cerrarVisor = cerrarVisor;
window.cambiarImagen = cambiarImagen;
