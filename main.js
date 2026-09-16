let video = document.getElementById('videoInput');
let canvasOutput = document.getElementById('canvasOutput');
let startBtn = document.getElementById('startBtn');
let calibrateBtn = document.getElementById('calibrateBtn');
let statusLabel = document.getElementById('status');
let boxCountLabel = document.getElementById('boxCount');

let streaming = false;
let src, dst, hsv, mask;
let cap;

// Tamaño base de una caja en píxeles cuadrados
let singleBoxArea = 5000; 

// Rango de color amarillo en HSV
const YELLOW_LOWER = [20, 100, 100];
const YELLOW_UPPER = [40, 255, 255];

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
    calibrateSingleBox();
});

function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("Tu navegador no soporta getUserMedia.");
        return;
    }

    // Forzar atributos en JS por si el HTML falla en iOS
    video.setAttribute('autoplay', '');
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
        .then(function(stream) {
            video.srcObject = stream;
            
            let playPromise = video.play();
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    alert("Error al intentar reproducir el video: " + error.message);
                });
            }

            startBtn.textContent = 'Detener Cámara';
            calibrateBtn.disabled = false;
            streaming = true;
            
            // Usar un bucle para esperar a que el video tenga dimensiones reales
            let checkDimensions = setInterval(() => {
                if (video.videoWidth > 0 && video.videoHeight > 0) {
                    clearInterval(checkDimensions);
                    
                    canvasOutput.width = video.videoWidth;
                    canvasOutput.height = video.videoHeight;
                    
                    try {
                        src = new cv.Mat(video.videoHeight, video.videoWidth, cv.CV_8UC4);
                        dst = new cv.Mat(video.videoHeight, video.videoWidth, cv.CV_8UC4);
                        hsv = new cv.Mat(video.videoHeight, video.videoWidth, cv.CV_8UC3);
                        mask = new cv.Mat(video.videoHeight, video.videoWidth, cv.CV_8UC1);
                        
                        cap = new cv.VideoCapture(video);
                        
                        requestAnimationFrame(processVideo);
                    } catch (initErr) {
                        alert("Error inicializando matrices de OpenCV: " + initErr);
                    }
                }
            }, 100); // Comprobar cada 100ms
        })
        .catch(function(err) {
            alert("Error al acceder a la cámara: " + err.name + " - " + err.message);
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
    
    if (src) src.delete();
    if (dst) dst.delete();
    if (hsv) hsv.delete();
    if (mask) mask.delete();
}

let currentTotalYellowArea = 0;
let processErrorShown = false; // Para no mostrar infinitas alertas

function processVideo() {
    if (!streaming) return;

    try {
        if (video.videoWidth === 0 || video.videoHeight === 0) {
            requestAnimationFrame(processVideo);
            return;
        }

        // iOS suele cambiar la resolución de la cámara después de arrancar.
        // Si las dimensiones cambian, necesitamos recrear las matrices de OpenCV y el VideoCapture.
        if (video.videoWidth !== src.cols || video.videoHeight !== src.rows) {
            video.width = video.videoWidth;
            video.height = video.videoHeight;
            canvasOutput.width = video.videoWidth;
            canvasOutput.height = video.videoHeight;
            
            src.delete(); dst.delete(); hsv.delete(); mask.delete();
            
            src = new cv.Mat(video.videoHeight, video.videoWidth, cv.CV_8UC4);
            dst = new cv.Mat(video.videoHeight, video.videoWidth, cv.CV_8UC4);
            hsv = new cv.Mat(video.videoHeight, video.videoWidth, cv.CV_8UC3);
            mask = new cv.Mat(video.videoHeight, video.videoWidth, cv.CV_8UC1);
            
            // ¡CRÍTICO! OpenCV guarda el tamaño interno. Hay que recrear cap también.
            cap = new cv.VideoCapture(video);
        }

        cap.read(src);
        
        // Si la imagen está vacía, saltar al siguiente frame
        if (src.empty()) {
            requestAnimationFrame(processVideo);
            return;
        }

        src.copyTo(dst);
        cv.cvtColor(src, hsv, cv.COLOR_RGBA2RGB);
        cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV);

        let low = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), YELLOW_LOWER);
        let high = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), YELLOW_UPPER);

        cv.inRange(hsv, low, high, mask);

        let contours = new cv.MatVector();
        let hierarchy = new cv.Mat();
        cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

        let totalArea = 0;
        
        for (let i = 0; i < contours.size(); ++i) {
            let cnt = contours.get(i);
            let area = cv.contourArea(cnt);
            
            if (area > 500) { 
                totalArea += area;
                cv.drawContours(dst, contours, i, new cv.Scalar(0, 255, 0, 255), 2, cv.LINE_8, hierarchy, 0);
            }
            cnt.delete();
        }
        
        currentTotalYellowArea = totalArea;

        if (totalArea > 0) {
            let count = Math.round(totalArea / singleBoxArea);
            if (count === 0 && totalArea > 1000) count = 1;
            boxCountLabel.textContent = count;
        } else {
            boxCountLabel.textContent = "0";
        }

        cv.imshow('canvasOutput', dst);

        low.delete(); high.delete();
        contours.delete(); hierarchy.delete();

        requestAnimationFrame(processVideo);
    } catch (err) {
        if (!processErrorShown) {
            alert("Error procesando frame de OpenCV: " + err);
            processErrorShown = true;
        }
        requestAnimationFrame(processVideo);
    }
}

function calibrateSingleBox() {
    if (currentTotalYellowArea > 1000) {
        singleBoxArea = currentTotalYellowArea;
        alert("¡Calibrado! Área de 1 caja = " + singleBoxArea);
    } else {
        alert("No se detecta suficiente color amarillo.");
    }
}
