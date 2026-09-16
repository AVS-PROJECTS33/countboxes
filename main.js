const video = document.getElementById('videoInput');
const canvas = document.getElementById('canvasOutput');
const ctx = canvas.getContext('2d');
const startBtn = document.getElementById('startBtn');
const statusLabel = document.getElementById('status');
const boxCountLabel = document.getElementById('boxCount');

let streaming = false;
let model = null;
let animationId = null;

// Inicializar la IA al cargar la página
async function initAI() {
    try {
        statusLabel.textContent = 'Cargando motor IA...';
        // cocoSsd está disponible globalmente gracias a la etiqueta script
        model = await cocoSsd.load();
        
        statusLabel.textContent = 'IA Lista';
        statusLabel.className = 'status ready';
        startBtn.disabled = false;
    } catch (err) {
        console.error(err);
        statusLabel.textContent = 'Error cargando IA';
        statusLabel.className = 'status loading';
    }
}

initAI();

startBtn.addEventListener('click', () => {
    if (!streaming) {
        startCamera();
    } else {
        stopCamera();
    }
});

async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("Tu navegador no soporta el acceso a la cámara.");
        return;
    }

    // Atributos forzados para iOS
    video.setAttribute('autoplay', '');
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'environment' }, 
            audio: false 
        });
        
        video.srcObject = stream;
        
        // El play() puede devolver una promesa
        const playPromise = video.play();
        if (playPromise !== undefined) {
            playPromise.catch(error => {
                alert("Error al auto-reproducir video: " + error.message);
            });
        }

        startBtn.textContent = 'Detener Cámara';
        streaming = true;

        // Esperar a que el video empiece a enviar datos
        video.onloadeddata = () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            // Iniciar el bucle de IA
            detectFrame();
        };

    } catch (err) {
        alert("Error de cámara: " + err.message);
        console.error(err);
    }
}

function stopCamera() {
    if (video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
    }
    streaming = false;
    startBtn.textContent = 'Iniciar Cámara';
    if (animationId) {
        cancelAnimationFrame(animationId);
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    boxCountLabel.textContent = '0';
}

async function detectFrame() {
    if (!streaming || video.paused || video.ended) return;

    // Ajustar tamaño del canvas por si el móvil rotó
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
    }

    try {
        // Ejecutar el modelo sobre el frame actual del video
        const predictions = await model.detect(video);
        
        // Limpiar el canvas anterior
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Dibujar resultados y contarlos
        let count = 0;
        
        predictions.forEach(prediction => {
            // prediction.bbox = [x, y, width, height]
            const [x, y, width, height] = prediction.bbox;
            
            // Solo contamos si hay cierta confianza
            if (prediction.score > 0.5) {
                count++;
                
                // Dibujar caja
                ctx.strokeStyle = '#3b82f6';
                ctx.lineWidth = 4;
                ctx.strokeRect(x, y, width, height);

                // Dibujar fondo de texto
                ctx.fillStyle = '#3b82f6';
                ctx.fillRect(x, y - 25, width, 25);

                // Dibujar texto
                ctx.fillStyle = '#ffffff';
                ctx.font = '18px Outfit';
                const text = `${prediction.class} (${Math.round(prediction.score * 100)}%)`;
                ctx.fillText(text, x + 5, y - 6);
            }
        });

        // Actualizar el contador en la UI
        boxCountLabel.textContent = count;

    } catch (error) {
        console.error("Error en detección:", error);
    }

    // Pedir el siguiente frame
    animationId = requestAnimationFrame(detectFrame);
}
