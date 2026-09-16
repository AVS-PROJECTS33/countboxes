const video = document.getElementById('videoInput');
const canvas = document.getElementById('canvasOutput');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const startBtn = document.getElementById('startBtn');
const calibrateBtn = document.getElementById('calibrateBtn');
const resetBtn = document.getElementById('resetBtn');
const statusLabel = document.getElementById('status');
const boxCountLabel = document.getElementById('boxCount');

let streaming = false;
let animationId = null;

// Memoria del máximo de cajas detectadas
let maxBoxesDetected = 0;

// Tamaño base de una caja en píxeles (valor por defecto)
let singleBoxPixels = 1500; 
let currentYellowPixels = 0;

// Variables para escalado (procesamos a menor resolución para que el móvil no se trabe)
const PROC_WIDTH = 320;
let procHeight = 240;
const offscreenCanvas = document.createElement('canvas');
const offscreenCtx = offscreenCanvas.getContext('2d', { willReadFrequently: true });

startBtn.addEventListener('click', () => {
    if (!streaming) {
        startCamera();
    } else {
        stopCamera();
    }
});

calibrateBtn.addEventListener('click', () => {
    if (currentYellowPixels > 100) {
        singleBoxPixels = currentYellowPixels;
        alert("¡Calibrado! Área de 1 caja = " + singleBoxPixels + " píxeles.");
    } else {
        alert("Apunta bien a un bloque amarillo antes de calibrar (muy poco color detectado).");
    }
});

resetBtn.addEventListener('click', () => {
    maxBoxesDetected = 0;
    boxCountLabel.textContent = "0";
});

async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("Tu navegador no soporta el acceso a la cámara.");
        return;
    }

    video.setAttribute('autoplay', '');
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'environment' }, 
            audio: false 
        });
        
        video.srcObject = stream;
        
        const playPromise = video.play();
        if (playPromise !== undefined) {
            playPromise.catch(error => {
                console.warn("Auto-play error", error);
            });
        }

        startBtn.textContent = 'Detener Cámara';
        calibrateBtn.disabled = false;
        resetBtn.disabled = false;
        streaming = true;
        statusLabel.textContent = 'Cámara Activa';
        statusLabel.className = 'status ready';

        // Esperar a tener dimensiones
        let checkDimensions = setInterval(() => {
            if (video.videoWidth > 0 && video.videoHeight > 0) {
                clearInterval(checkDimensions);
                
                // Configurar canvas principal
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                
                // Configurar canvas de procesamiento (baja resolución)
                procHeight = Math.floor(video.videoHeight * (PROC_WIDTH / video.videoWidth));
                offscreenCanvas.width = PROC_WIDTH;
                offscreenCanvas.height = procHeight;
                
                // Iniciar escaneo
                scanPixels();
            }
        }, 100);

    } catch (err) {
        alert("Error de cámara: " + err.message);
        statusLabel.textContent = 'Error';
        statusLabel.className = 'status loading';
    }
}

function stopCamera() {
    if (video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
    }
    streaming = false;
    startBtn.textContent = 'Iniciar Cámara';
    calibrateBtn.disabled = true;
    resetBtn.disabled = true;
    if (animationId) {
        cancelAnimationFrame(animationId);
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    boxCountLabel.textContent = '0';
    statusLabel.textContent = 'Listo para iniciar';
    statusLabel.className = 'status ready';
}

// Función matemática para sacar el tono (Hue) y saber si es amarillo brillante
function isYellow(r, g, b) {
    let max = Math.max(r, g, b), min = Math.min(r, g, b);
    let s = max === 0 ? 0 : (max - min) / max;
    let v = max;
    
    // Ignorar oscuros y grises/blancos
    if (s < 0.35 || v < 110) return false; 
    
    // Calcular Hue
    let d = max - min;
    let h;
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = h * 60;
    
    // El amarillo del Box Guesser ronda los 40-75 grados de Hue
    return (h >= 35 && h <= 75);
}

function scanPixels() {
    if (!streaming || video.paused || video.ended) return;

    // Actualizar tamaños si rotó el teléfono
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        procHeight = Math.floor(video.videoHeight * (PROC_WIDTH / video.videoWidth));
        offscreenCanvas.width = PROC_WIDTH;
        offscreenCanvas.height = procHeight;
    }

    // 1. Dibujar el video en el canvas pequeño para procesar rápido
    offscreenCtx.drawImage(video, 0, 0, PROC_WIDTH, procHeight);
    
    // 2. Extraer los píxeles
    let imageData;
    try {
        imageData = offscreenCtx.getImageData(0, 0, PROC_WIDTH, procHeight);
    } catch(e) {
        // En iOS Safari a veces getImageData falla si el frame no está listo
        animationId = requestAnimationFrame(scanPixels);
        return;
    }
    
    let data = imageData.data;
    
    let yellowPixelCount = 0;
    
    // 3. Limpiar el canvas grande visual
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Factor de escala visual
    const scaleX = canvas.width / PROC_WIDTH;
    const scaleY = canvas.height / procHeight;

    // Empezamos a pintar cuadritos verdes para dar feedback visual
    ctx.fillStyle = 'rgba(16, 185, 129, 0.6)'; // Verde translúcido

    // 4. Analizar cada píxel
    for (let i = 0; i < data.length; i += 4) {
        let r = data[i];
        let g = data[i+1];
        let b = data[i+2];
        
        if (isYellow(r, g, b)) {
            yellowPixelCount++;
            
            // Para feedback visual, no pintamos TODOS los píxeles (sería lento), 
            // pintamos rectángulos más grandes cada ciertos píxeles detectados
            if (yellowPixelCount % 4 === 0) {
                let pixelIndex = i / 4;
                let x = pixelIndex % PROC_WIDTH;
                let y = Math.floor(pixelIndex / PROC_WIDTH);
                
                // Dibujar en el canvas original
                ctx.fillRect(x * scaleX, y * scaleY, scaleX * 2, scaleY * 2);
            }
        }
    }

    currentYellowPixels = yellowPixelCount;

    // 5. Calcular cajas
    if (yellowPixelCount > 0) {
        let count = Math.round(yellowPixelCount / singleBoxPixels);
        // Si hay una mancha pero no llega a 1 caja entera, contamos 1
        if (count === 0 && yellowPixelCount > (singleBoxPixels * 0.3)) count = 1;
        
        // Actualizamos el máximo histórico
        if (count > maxBoxesDetected) {
            maxBoxesDetected = count;
        }
    }

    // Mostrar siempre el máximo detectado
    boxCountLabel.textContent = maxBoxesDetected;

    animationId = requestAnimationFrame(scanPixels);
}
