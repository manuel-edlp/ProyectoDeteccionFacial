---
title: AI Clustering Recognition
emoji: 💻
colorFrom: blue
colorTo: green
sdk: docker
app_port: 7860
pinned: false
---

# 🧬 AI Cluster & Recognition (AICR) Hub
### Biometric Identities Grouping & Emotion Analysis System
**Desarrollado por: Ing. Manuel Morullo**

[![Python 3.11+](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/downloads/release/python-3110/)
[![Flask](https://img.shields.io/badge/flask-%23000.svg?style=flat&logo=flask&logoColor=white)](https://flask.palletsprojects.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 📌 Descripción del Proyecto
AICR Hub es una plataforma de visión artificial diseñada para la **detección, clasificación y agrupamiento automático de rostros**. El sistema utiliza descriptores biométricos de alta dimensionalidad (128-d Face Encodings) y algoritmos de clustering no supervisados para organizar grandes volúmenes de imágenes sin etiquetas previas.

## 🚀 Características Principales
* **Detección Multimodal:** Implementación de algoritmos **Viola-Jones**, **HOG** y **CNN (MMod)** para localización de rostros.
* **Identidad Matemática:** Extracción de encodings biométricos mediante Redes Neuronales Profundas.
* **Clustering Inteligente:** Agrupamiento automático de personas utilizando **DBSCAN** (Density-Based Spatial Clustering of Applications with Noise).
* **Análisis de Emociones:** Clasificador basado en **MiniXceptionFER** para detectar estados anímicos (feliz, neutral, triste, etc.).
* **Explorador Web Pro:** Interfaz "Glassmorphism" con navegación optimizada mediante **Cache en Frontend** y carga asíncrona.

---

## 🛠️ Stack Tecnológico
* **Backend:** Python 3.11 + Flask.
* **IA & Computer Vision:** OpenCV, Dlib, Face_Recognition, TensorFlow/Keras.
* **Procesamiento:** Paz (Perception for Autonomous Systems), Scikit-Learn (DBSCAN).
* **Frontend:** Vanilla JS, Bootstrap 5, SweetAlert2, FontAwesome.

---

## ⚙️ Instalación y Configuración

### 1. Clonar el repositorio e inicializar entorno
```bash
git clone [https://github.com/manuel-edlp/AI-Cluster-Recognition.git](https://github.com/manuel-edlp/AI-Cluster-Recognition.git)
cd AI-Cluster-Recognition
py -3.11 -m venv .venv
.venv\Scripts\Activate.ps1
```

### 2. Ejecutar la aplicación
```bash
python app.py
```

### 3. Acceder a la aplicación
```
http://localhost:7860
```