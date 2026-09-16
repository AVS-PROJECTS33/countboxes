let video = document.getElementById('videoInput');
let canvasOutput = document.getElementById('canvasOutput');
let startBtn = document.getElementById('startBtn');
let calibrateBtn = document.getElementById('calibrateBtn');
let statusLabel = document.getElementById('status');
let boxCountLabel = document.getElementById('boxCount');

let streaming = false;
let src, dst, hsv, mask;
let cap;

// Tamaño base de una caja en píxeles cuadrados (valor por defecto, se ajusta con calibración)
let singleBoxArea = 5000; 

// Rango de color amarillo en HSV (OpenCV usa H: 0-180, S: 0-255, V: 0-255)
// El amarillo suele estar alrededor del hue 20-35
const YELLOW_LOWER = [20, 100, 100];
const YELLOW_UPPER = [40, 255, 255];

// Se llama desde el index.html cuando OpenCV carga
window.onOpenCvReady = function() {
    statusLabel.textContent = 'OpenCV Listo';
    statusLabel.className = 'status ready';
    startBtn.disabled = false;
};

startBtn.addEventListener('click', () => {
    if (!streaming) {
        startCamera();
    } else {
        stopCamera();
    }
});

calibrateBtn.addEventListener('click', () => {
    // Tomaremos el área amarilla detectada más grande actual como el tamaño de "1 caja"
    calibrateSingleBox();
});

function startCamera() {
    // Usar cámara trasera si está disponible
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("Tu navegador no soporta el acceso a la cámara (getUserMedia no está disponible).");
        return;
    }

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
        .then(function(stream) {
            video.srcObject = stream;
            
            // Promise para video.play() que a veces falla en iOS
            let playPromise = video.play();
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    alert("Error al intentar reproducir el video: " + error.message);
                });
            }

            startBtn.textContent = 'Detener Cámara';
            calibrateBtn.disabled = false;
            streaming = true;
            
            // onloadedmetadata es más confiable en iOS que oncanplay para streams
            video.onloadedmetadata = () => {
                // Ajustar el canvas al tamaño del video
                canvasOutput.width = video.videoWidth;
                canvasOutput.height = video.videoHeight;
                
                // Inicializar matrices de OpenCV
                src = new cv.Mat(video.videoHeight, video.videoWidth, cv.CV_8UC4);
                dst = new cv.Mat(video.videoHeight, video.videoWidth, cv.CV_8UC4);
                hsv = new cv.Mat(video.videoHeight, video.videoWidth, cv.CV_8UC3);
                mask = new cv.Mat(video.videoHeight, video.videoWidth, cv.CV_8UC1);
                
                cap = new cv.VideoCapture(video);
                
                // Iniciar el bucle de procesamiento
                requestAnimationFrame(processVideo);
            };
        })
        .catch(function(err) {
            alert("Error al acceder a la cámara: " + err.name + " - " + err.message);
            console.error("Error al acceder a la cámara: ", err);
            statusLabel.textContent = 'Error de cámara';
            statusLabel.className = 'status loading';
        });
}

function stopCamera() {
    if (video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
    }
    streaming = false;
    startBtn.textContent = 'Iniciar Cámara';
    calibrateBtn.disabled = true;
    
    // Limpiar matrices
    if (src) src.delete();
    if (dst) dst.delete();
    if (hsv) hsv.delete();
    if (mask) mask.delete();
}

let currentTotalYellowArea = 0;

function processVideo() {
    if (!streaming) return;

    try {
        // Leer cuadro del video
        cap.read(src);
        src.copyTo(dst);

        // Convertir a HSV
        cv.cvtColor(src, hsv, cv.COLOR_RGBA2RGB);
        cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV);

        // Definir los rangos de color
        let low = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), YELLOW_LOWER);
        let high = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), YELLOW_UPPER);

        // Crear la máscara
        cv.inRange(hsv, low, high, mask);

        // Encontrar contornos
        let contours = new cv.MatVector();
        let hierarchy = new cv.Mat();
        cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

        let totalArea = 0;
        
        // Dibujar y sumar áreas de los contornos detectados
        for (let i = 0; i < contours.size(); ++i) {
            let cnt = contours.get(i);
            let area = cv.contourArea(cnt);
            
            // Ignorar manchas pequeñas (ruido)
            if (area > 500) { 
                totalArea += area;
                
                // Dibujar contorno verde
                cv.drawContours(dst, contours, i, new cv.Scalar(0, 255, 0, 255), 2, cv.LINE_8, hierarchy, 0);
            }
            cnt.delete();
        }
        
        currentTotalYellowArea = totalArea;

        // Calcular número de cajas estimado
        if (totalArea > 0) {
            let count = Math.round(totalArea / singleBoxArea);
            // Si el área es muy pequeña en comparación, pero hay algo, al menos 1
            if (count === 0 && totalArea > 1000) count = 1;
            boxCountLabel.textContent = count;
        } else {
            boxCountLabel.textContent = "0";
        }

        // Mostrar el resultado en el canvas
        cv.imshow('canvasOutput', dst);

        // Limpiar memoria temporal
        low.delete(); high.delete();
        contours.delete(); hierarchy.delete();

        // Siguiente frame
        requestAnimationFrame(processVideo);
    } catch (err) {
        console.error(err);
        requestAnimationFrame(processVideo);
    }
}

function calibrateSingleBox() {
    if (currentTotalYellowArea > 1000) {
        singleBoxArea = currentTotalYellowArea;
        alert("¡Calibrado! Se ha guardado el tamaño actual de la mancha amarilla como '1 caja'.");
    } else {
        alert("No se detecta suficiente color amarillo para calibrar. Pon una caja amarilla frente a la cámara.");
    }
}
