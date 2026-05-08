# Usamos una imagen liviana de Python 3.11
FROM python:3.11-slim

# Instalamos dependencias de sistema necesarias
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    git \
    && rm -rf /var/lib/apt/lists/*

# Configuración de usuario para Hugging Face
RUN useradd -m -u 1000 user
USER user
ENV PATH="/home/user/.local/bin:${PATH}"
WORKDIR /app

# Copiamos el archivo de requisitos
COPY --chown=user:user requirements_hf.txt ./requirements.txt

# 2. Instalamos el binario de dlib directamente para evitar CMake y OOM
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir dlib-bin && \
    pip install --no-cache-dir -r requirements.txt && \
    # instalacion face-recognition sin dependencias, evita que pip intente buscar o compilar el dlib original
    pip install --no-cache-dir face-recognition==1.3.0 --no-deps

# Instalaciones de Git adicionales
RUN pip install --no-cache-dir git+https://github.com/oarriaga/paz.git
RUN pip install --no-cache-dir git+https://github.com/ageitgey/face_recognition_models

# Copiamos el resto del código
COPY --chown=user:user . .

ENV FLASK_APP=app.py
EXPOSE 7860

# Arrancamos con Gunicorn
CMD ["gunicorn", "--bind", "0.0.0.0:7860", "app:app", "--timeout", "300", "--workers", "1", "--threads", "4"]