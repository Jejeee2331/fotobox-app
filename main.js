const basePath = import.meta.env.BASE_URL;
const video = document.getElementById('camera-feed');
const captureBtn = document.getElementById('capture-btn');
const flipBtn = document.getElementById('flip-btn');
const resetBtn = document.getElementById('reset-btn');
const generateBtn = document.getElementById('generate-btn');
const gallery = document.getElementById('gallery');
const photoCountSpan = document.getElementById('photo-count');
const loadingOverlay = document.getElementById('loading-overlay');
const resultModal = document.getElementById('result-modal');
const finalCanvas = document.getElementById('final-canvas');
const closeModalBtn = document.getElementById('close-modal-btn');
const downloadBtn = document.getElementById('download-btn');

// Photo Preview Modal DOM
const previewModal = document.getElementById('preview-modal');
const previewImg = document.getElementById('preview-img');
const deletePreviewBtn = document.getElementById('delete-preview-btn');
const closePreviewBtn = document.getElementById('close-preview-btn');
let activePreviewIndex = null;

// Template Preview Modal DOM
const templatePreviewModal = document.getElementById('template-preview-modal');
const templatePreviewImg = document.getElementById('template-preview-img');
const closeTemplatePreviewBtn = document.getElementById('close-template-preview-btn');

// Template Selector DOM
const templateOptions = document.querySelectorAll('.template-option:not(#upload-template-label)');
const templatePreviewIcons = document.querySelectorAll('.template-preview-icon');
const maxPhotosLabel = document.querySelector('.count-badge');
const customTemplateLabel = document.getElementById('upload-template-label');
const templateUploadInput = document.getElementById('template-upload-input');

let maxPhotos = 5;
let currentTemplateName = 'Template';
let photos = [];
let stream = null;
let templateImage = null;
let currentFacingMode = 'user'; // 'user' (front) or 'environment' (back)

// Template Preview Events
templatePreviewIcons.forEach(icon => {
    icon.addEventListener('click', (e) => {
        e.stopPropagation(); // Mencegah trigger event select template
        
        // Cari elemen parent (template-option) untuk mengambil data-template
        const btn = icon.closest('.template-option');
        const templateName = btn.dataset.template;
        
        templatePreviewImg.src = `${basePath}Assets/${templateName}.png`;
        templatePreviewModal.classList.remove('hidden');
    });
});

closeTemplatePreviewBtn.addEventListener('click', () => {
    templatePreviewModal.classList.add('hidden');
});

// Template Selector Events
templateOptions.forEach(btn => {
    btn.addEventListener('click', () => {
        // Update active state
        templateOptions.forEach(b => b.classList.remove('active'));
        if (customTemplateLabel) customTemplateLabel.classList.remove('active');
        btn.classList.add('active');

        const newTemplate = btn.dataset.template;
        const newSlots = parseInt(btn.dataset.slots);

        // Only reload if template actually changed
        if (newTemplate !== currentTemplateName) {
            currentTemplateName = newTemplate;
            maxPhotos = newSlots;

            // Trim photos if exceeding new max
            if (photos.length > maxPhotos) {
                photos = photos.slice(0, maxPhotos);
            }

            loadTemplate(currentTemplateName);
            updateGallery();
        }
    });
});

if (templateUploadInput) {
    templateUploadInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                // Update active state
                templateOptions.forEach(b => b.classList.remove('active'));
                customTemplateLabel.classList.add('active');

                currentTemplateName = 'Custom';
                
                templateImage = new Image();
                templateImage.src = event.target.result;
                templateImage.onload = () => {
                    console.log("Custom template loaded");
                    finalCanvas.width = templateImage.width;
                    finalCanvas.height = templateImage.height;
                    
                    // Count slots based on greenscreen
                    const { boxes: validBoxes } = findTemplateSlots(templateImage);
                    const slots = validBoxes.length;
                    
                    if (slots === 0) {
                        alert("Peringatan: Tidak ada warna HIJAU (greenscreen) yang terdeteksi di gambar ini! \n\nPastikan Anda mewarnai tempat fotonya dengan warna hijau terang. Sistem akan mengatur ke 1 foto sebagai default.");
                        maxPhotos = 1;
                    } else {
                        maxPhotos = slots;
                    }
                    
                    if (photos.length > maxPhotos) {
                        photos = photos.slice(0, maxPhotos);
                    }
                    updateGallery();
                };
            };
            reader.readAsDataURL(file);
        }
    });
}

// Initialize Camera
async function initCamera() {
    // Stop existing camera stream tracks if active
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }

    try {
        // Use 'exact' for environment (back camera) to force it on mobile
        const constraints = {
            video: currentFacingMode === 'environment'
                ? { facingMode: { exact: 'environment' } }
                : { facingMode: 'user' },
            audio: false
        };
        
        try {
            stream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (constraintErr) {
            console.warn("Facing mode constraint failed, fallback to basic video...", constraintErr);
            stream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: false
            });
        }

        video.srcObject = stream;
        await video.play().catch(e => console.log("Auto-play error:", e));

        // Apply mirror effect only for front camera
        if (currentFacingMode === 'user') {
            video.classList.add('mirrored');
        } else {
            video.classList.remove('mirrored');
        }
    } catch (err) {
        console.error("Error accessing camera:", err);
        alert("Kamera tidak dapat diakses (" + err.name + "). Pastikan izin kamera sudah diizinkan di browser dan tidak ada aplikasi lain yang menggunakan kamera.");
    }
}

// Flip Camera Event
flipBtn.addEventListener('click', async () => {
    // Add rotate animation effect
    flipBtn.style.transform = 'rotate(180deg)';
    setTimeout(() => { flipBtn.style.transform = 'none'; }, 300);

    currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
    await initCamera();
});

// Load Template by name
function loadTemplate(name) {
    name = name || currentTemplateName;
    templateImage = new Image();
    templateImage.src = `${basePath}Assets/${name}.png`;
    templateImage.onload = () => {
        console.log(`Template "${name}" loaded`, templateImage.width, templateImage.height);
        // Resize final canvas based on template size
        finalCanvas.width = templateImage.width;
        finalCanvas.height = templateImage.height;
    };
    templateImage.onerror = () => {
        console.error(`Error loading template: ${name}`);
        alert(`Template "${name}" not found. Ensure it is at Assets/${name}.png`);
    }
}

// Capture Photo
captureBtn.addEventListener('click', () => {
    if (photos.length >= maxPhotos) return;

    // Flash effect
    const flash = document.createElement('div');
    flash.style.position = 'absolute';
    flash.style.top = '0'; flash.style.left = '0';
    flash.style.width = '100%'; flash.style.height = '100%';
    flash.style.backgroundColor = 'white';
    flash.style.opacity = '1';
    flash.style.transition = 'opacity 0.5s ease';
    flash.style.zIndex = '5';
    video.parentElement.appendChild(flash);
    setTimeout(() => { flash.style.opacity = '0'; }, 50);
    setTimeout(() => { flash.remove(); }, 550);

    // Create offscreen canvas to grab the frame
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    
    // Mirror the image horizontally only if using front camera
    if (currentFacingMode === 'user') {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    photos.push(dataUrl);
    updateGallery();
});

function updateGallery() {
    gallery.innerHTML = '';
    photos.forEach((src, index) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'thumb-wrapper';
        
        const img = document.createElement('img');
        img.src = src;
        img.className = 'thumbnail';
        img.alt = `Photo ${index + 1}`;
        img.addEventListener('click', () => openPreview(index));

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-thumb-btn';
        deleteBtn.title = 'Delete photo';
        deleteBtn.innerHTML = `
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        `;
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deletePhoto(index);
        });

        wrapper.appendChild(img);
        wrapper.appendChild(deleteBtn);
        gallery.appendChild(wrapper);
    });

    photoCountSpan.textContent = photos.length;
    // Update the max count label dynamically
    maxPhotosLabel.innerHTML = `<span id="photo-count">${photos.length}</span>/${maxPhotos}`;

    // Show/hide controls based on photos count
    if (photos.length >= maxPhotos) {
        captureBtn.parentElement.classList.add('hidden');
    } else {
        captureBtn.parentElement.classList.remove('hidden');
    }

    if (photos.length > 0) {
        resetBtn.classList.remove('hidden');
        generateBtn.classList.remove('hidden');
    } else {
        resetBtn.classList.add('hidden');
        generateBtn.classList.add('hidden');
    }
}

function deletePhoto(index) {
    photos.splice(index, 1);
    updateGallery();
}

function openPreview(index) {
    activePreviewIndex = index;
    previewImg.src = photos[index];
    previewModal.classList.remove('hidden');
}

closePreviewBtn.addEventListener('click', () => {
    previewModal.classList.add('hidden');
    activePreviewIndex = null;
});

deletePreviewBtn.addEventListener('click', () => {
    if (activePreviewIndex !== null) {
        deletePhoto(activePreviewIndex);
        previewModal.classList.add('hidden');
        activePreviewIndex = null;
    }
});

resetBtn.addEventListener('click', () => {
    photos = [];
    updateGallery();
});

// Process Template and Generate Result
generateBtn.addEventListener('click', async () => {
    if (!templateImage || photos.length === 0) return;
    loadingOverlay.classList.remove('hidden');

    try {
        await processPhotobooth();
        resultModal.classList.remove('hidden');
    } catch (err) {
        console.error(err);
        alert("An error occurred while generating the result.");
    } finally {
        loadingOverlay.classList.add('hidden');
    }
});

function findTemplateSlots(img) {
    const width = img.width;
    const height = img.height;
    
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(img, 0, 0, width, height);
    
    const imageData = tempCtx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const totalPixels = width * height;
    
    const isHole = new Uint8Array(totalPixels);
    
    for (let p = 0; p < totalPixels; p++) {
        const i = p * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];
        
        // Detect greenscreen OR transparency
        const isGreen = a > 50 && g > 75 && (g - r) > 20 && (g - b) > 20;
        const isTransparent = a < 30;
        
        if (isGreen || isTransparent) {
            isHole[p] = 1;
            if (isGreen) {
                data[i + 3] = 0; // Remove green so photo shows behind
            }
        }
    }
    
    // Put modified pixels back to temp canvas (transparent holes)
    tempCtx.putImageData(imageData, 0, 0);
    
    // Proper Connected Component Labeling using Breadth-First Search (BFS)
    const visited = new Uint8Array(totalPixels);
    const queue = new Int32Array(totalPixels);
    const rawBoxes = [];
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const startIdx = y * width + x;
            if (isHole[startIdx] && !visited[startIdx]) {
                let minX = x, maxX = x, minY = y, maxY = y;
                let pixelCount = 0;
                
                visited[startIdx] = 1;
                queue[0] = startIdx;
                let head = 0;
                let tail = 1;
                
                while (head < tail) {
                    const curr = queue[head++];
                    const cx = curr % width;
                    const cy = (curr / width) | 0;
                    pixelCount++;
                    
                    if (cx < minX) minX = cx;
                    if (cx > maxX) maxX = cx;
                    if (cy < minY) minY = cy;
                    if (cy > maxY) maxY = cy;
                    
                    // 4-directional flood fill
                    // Up
                    if (cy > 0) {
                        const n = curr - width;
                        if (isHole[n] && !visited[n]) {
                            visited[n] = 1;
                            queue[tail++] = n;
                        }
                    }
                    // Down
                    if (cy < height - 1) {
                        const n = curr + width;
                        if (isHole[n] && !visited[n]) {
                            visited[n] = 1;
                            queue[tail++] = n;
                        }
                    }
                    // Left
                    if (cx > 0) {
                        const n = curr - 1;
                        if (isHole[n] && !visited[n]) {
                            visited[n] = 1;
                            queue[tail++] = n;
                        }
                    }
                    // Right
                    if (cx < width - 1) {
                        const n = curr + 1;
                        if (isHole[n] && !visited[n]) {
                            visited[n] = 1;
                            queue[tail++] = n;
                        }
                    }
                }
                
                const boxW = maxX - minX + 1;
                const boxH = maxY - minY + 1;
                
                // Filter out small noise artifacts (like tiny green leaves/decorations)
                const minDimension = Math.max(20, Math.min(width, height) * 0.03);
                const minPixels = Math.max(200, (minDimension * minDimension) * 0.25);
                
                if (boxW >= minDimension && boxH >= minDimension && pixelCount >= minPixels) {
                    rawBoxes.push({ minX, maxX, minY, maxY, boxW, boxH, pixelCount });
                }
            }
        }
    }
    
    // Sort boxes in natural reading order: top-to-bottom, left-to-right
    rawBoxes.sort((a, b) => {
        const avgH = (a.boxH + b.boxH) / 2;
        if (Math.abs(a.minY - b.minY) > avgH * 0.35) {
            return a.minY - b.minY;
        }
        return a.minX - b.minX;
    });
    
    console.log(`findTemplateSlots: Detected ${rawBoxes.length} frames:`, rawBoxes);
    
    return { boxes: rawBoxes, processedCanvas: tempCanvas };
}

async function processPhotobooth() {
    const width = templateImage.width;
    const height = templateImage.height;
    
    // 1. Find greenscreen frames (Bounding Box extraction) and get transparent canvas
    const { boxes: validBoxes, processedCanvas } = findTemplateSlots(templateImage);
    console.log("Detected frames:", validBoxes);
    
    // 2. Draw final result
    const finalCtx = finalCanvas.getContext('2d');
    finalCtx.clearRect(0, 0, width, height);
    
    // Draw photos into the detected boxes
    for (let i = 0; i < Math.min(photos.length, validBoxes.length); i++) {
        const box = validBoxes[i];
        const boxW = box.maxX - box.minX;
        const boxH = box.maxY - box.minY;
        
        const photoImg = new Image();
        photoImg.src = photos[i];
        await new Promise(resolve => { photoImg.onload = resolve; });
        
        // Draw image covering the box (object-fit: cover logic)
        const imgRatio = photoImg.width / photoImg.height;
        const boxRatio = boxW / boxH;
        
        let drawW, drawH, drawX, drawY;
        
        if (imgRatio > boxRatio) {
            // Image is wider than box
            drawH = boxH;
            drawW = drawH * imgRatio;
            drawX = box.minX - (drawW - boxW) / 2;
            drawY = box.minY;
        } else {
            // Image is taller than box
            drawW = boxW;
            drawH = drawW / imgRatio;
            drawX = box.minX;
            drawY = box.minY - (drawH - boxH) / 2;
        }
        
        // Save context to clip drawing within the box
        finalCtx.save();
        finalCtx.beginPath();
        finalCtx.rect(box.minX, box.minY, boxW, boxH);
        finalCtx.clip();
        
        finalCtx.drawImage(photoImg, drawX, drawY, drawW, drawH);
        
        finalCtx.restore();
    }
    
    // 3. Draw the processed template (with transparent holes) OVER the photos
    finalCtx.drawImage(processedCanvas, 0, 0, width, height);
}

closeModalBtn.addEventListener('click', () => {
    resultModal.classList.add('hidden');
});

downloadBtn.addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = `Fotobox-${Date.now()}.png`;
    link.href = finalCanvas.toDataURL('image/png');
    link.click();
});

// Start
initCamera();
loadTemplate(currentTemplateName);
