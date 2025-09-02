/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Modality } from '@google/genai';

// --- DOM Elements ---
const fileUpload = document.getElementById('file-upload') as HTMLInputElement;
const promptInput = document.getElementById('prompt-input') as HTMLInputElement;
const restoreButton = document.getElementById('restore-button') as HTMLButtonElement;
const originalImageContainer = document.getElementById('original-image-container');
const restoredImageContainer = document.getElementById('restored-image-container');
const loader = restoredImageContainer.querySelector('.loader');
const sharpenSlider = document.getElementById('sharpen-slider') as HTMLInputElement;
const sharpenValue = document.getElementById('sharpen-value');


// --- State ---
let uploadedImage: { data: string; mimeType: string } | null = null;
let restoredImage: { data: string; mimeType: string } | null = null;


/**
 * Converts a file to a Base64 string.
 * @param file The file to convert.
 * @returns A promise that resolves with the Base64 string and MIME type.
 */
function fileToGenerativePart(file: File): Promise<{ data: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        return reject(new Error('Failed to read file as data URL.'));
      }
      const base64Data = reader.result.split(',')[1];
      resolve({ data: base64Data, mimeType: file.type });
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

/**
 * Updates the UI to display the uploaded image.
 * @param file The uploaded image file.
 */
async function handleImageUpload(file: File) {
  if (!originalImageContainer || !restoreButton) return;

  try {
    uploadedImage = await fileToGenerativePart(file);
    originalImageContainer.innerHTML = ''; // Clear placeholder
    const img = document.createElement('img');
    img.src = `data:${uploadedImage.mimeType};base64,${uploadedImage.data}`;
    img.alt = 'User uploaded image.';
    originalImageContainer.appendChild(img);
    restoreButton.disabled = false;
  } catch (error)
 {
    console.error('Error handling image upload:', error);
    originalImageContainer.innerHTML = '<p class="error">Could not display image.</p>';
    uploadedImage = null;
    restoreButton.disabled = true;
  }
}

/**
 * Sets the UI to a loading state during API call.
 */
function setLoading(isLoading: boolean) {
  if (!restoreButton || !loader || !restoredImageContainer) return;
  restoreButton.disabled = isLoading;
  restoreButton.textContent = isLoading ? 'Processing...' : 'Restore & Edit';
  loader.toggleAttribute('hidden', !isLoading);
  restoredImageContainer.setAttribute('aria-busy', String(isLoading));
}

/**
 * Adds a "FIXRAL" watermark to an image.
 * @param dataUrl The data URL of the image to watermark.
 * @returns A promise that resolves with the data URL of the watermarked image.
 */
function addWatermark(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return reject(new Error('Could not get canvas context.'));
      }

      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;

      // 1. Draw original image
      ctx.drawImage(image, 0, 0);

      // 2. Prepare watermark style
      const fontSize = Math.max(14, Math.floor(image.naturalWidth / 35));
      ctx.font = `bold ${fontSize}px "Segoe UI", Arial, sans-serif`;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
      ctx.shadowBlur = 5;

      // 3. Calculate position
      const padding = fontSize * 0.75;
      const x = canvas.width - padding;
      const y = canvas.height - padding;

      // 4. Draw watermark
      ctx.fillText('FIXRAL', x, y);

      // 5. Return new image data URL
      const originalMimeType = dataUrl.substring(dataUrl.indexOf(':') + 1, dataUrl.indexOf(';'));
      if (originalMimeType === 'image/jpeg') {
        resolve(canvas.toDataURL('image/jpeg', 0.92));
      } else {
        resolve(canvas.toDataURL('image/png'));
      }
    };
    image.onerror = () => {
      reject(new Error('Failed to load image for watermarking.'));
    };
    image.src = dataUrl;
  });
}


/**
 * Creates and appends download controls to the restored image container.
 */
function addDownloadControls() {
    if (!restoredImageContainer) return;

    const controlsContainer = document.createElement('div');
    controlsContainer.className = 'download-controls';

    const qualityLabel = document.createElement('label');
    qualityLabel.htmlFor = 'quality-slider';
    qualityLabel.textContent = 'JPG Quality:';

    const qualityValue = document.createElement('span');
    qualityValue.id = 'quality-value';
    qualityValue.textContent = '92'; // Default value

    const qualitySlider = document.createElement('input');
    qualitySlider.type = 'range';
    qualitySlider.id = 'quality-slider';
    qualitySlider.min = '1';
    qualitySlider.max = '100';
    qualitySlider.value = '92'; // Default high quality
    qualitySlider.addEventListener('input', () => {
        qualityValue.textContent = qualitySlider.value;
    });

    const downloadButton = document.createElement('button');
    downloadButton.textContent = 'Save as JPG';
    downloadButton.className = 'button';
    downloadButton.addEventListener('click', handleDownload);

    qualityLabel.appendChild(qualityValue);
    controlsContainer.appendChild(qualityLabel);
    controlsContainer.appendChild(qualitySlider);
    controlsContainer.appendChild(downloadButton);

    restoredImageContainer.appendChild(controlsContainer);
}

/**
 * Handles the download of the restored image as a JPG with selected quality.
 */
function handleDownload() {
    if (!restoredImage) {
        alert('No restored image to save.');
        return;
    }

    const qualitySlider = document.getElementById('quality-slider') as HTMLInputElement;
    const quality = parseInt(qualitySlider.value, 10) / 100;

    const image = new Image();
    image.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            alert('Could not process image for saving.');
            return;
        }
        ctx.drawImage(image, 0, 0);

        try {
            const jpgDataUrl = canvas.toDataURL('image/jpeg', quality);
            const link = document.createElement('a');
            link.href = jpgDataUrl;
            link.download = 'restored-image.jpg';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (e) {
            console.error("Error converting to JPG:", e);
            alert("Sorry, there was an error saving the image.");
        }
    };
    image.onerror = () => {
        alert('Failed to load image data for saving.');
    };
    image.src = `data:${restoredImage.mimeType};base64,${restoredImage.data}`;
}


/**
 * Handles the image restoration process.
 */
async function handleRestore() {
  if (!uploadedImage || !restoredImageContainer) {
    alert('Please upload an image first.');
    return;
  }
  
  // Clear previous results (image, download controls, error messages)
  Array.from(restoredImageContainer.children).forEach(child => {
    if (!child.classList.contains('loader')) {
      child.remove();
    }
  });
  restoredImage = null;

  setLoading(true);

  const userPrompt = promptInput.value.trim();
  let finalPrompt = '';

  // Only add sharpening instruction if there's a user prompt.
  if (userPrompt) {
    const sharpening = sharpenSlider.value;
    finalPrompt = `${userPrompt}. Apply sharpening at an intensity of ${sharpening}%.`;
  } else {
    finalPrompt = 'Restore this image, fix any corruption or damage, and improve its overall quality and sharpness.';
  }


  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image-preview',
      contents: {
        parts: [
          {
            inlineData: {
              data: uploadedImage.data,
              mimeType: uploadedImage.mimeType,
            },
          },
          {
            text: finalPrompt,
          },
        ],
      },
      config: {
        responseModalities: [Modality.IMAGE, Modality.TEXT],
      },
    });

    let imageFound = false;
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        const originalDataUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        const watermarkedDataUrl = await addWatermark(originalDataUrl);
        const watermarkedBase64 = watermarkedDataUrl.split(',')[1];
        const watermarkedMimeType = watermarkedDataUrl.substring(watermarkedDataUrl.indexOf(":")+1, watermarkedDataUrl.indexOf(";"));
        
        restoredImage = {
            data: watermarkedBase64,
            mimeType: watermarkedMimeType,
        };
        const img = document.createElement('img');
        img.src = watermarkedDataUrl;
        img.alt = 'AI-restored image.';
        restoredImageContainer.appendChild(img);
        addDownloadControls();
        imageFound = true;
        break; 
      }
    }
    if (!imageFound) {
      const errorP = document.createElement('p');
      errorP.className = 'error';
      errorP.textContent = 'Could not restore the image. Please try again.';
      restoredImageContainer.appendChild(errorP);
    }

  } catch (error) {
    console.error('Error during image restoration:', error);
    const errorP = document.createElement('p');
    errorP.className = 'error';
    errorP.textContent = `An error occurred: ${error.message}`;
    restoredImageContainer.appendChild(errorP);
    restoredImage = null;
  } finally {
    setLoading(false);
  }
}

/**
 * Initializes event listeners.
 */
function main() {
  if (!fileUpload || !restoreButton || !promptInput || !sharpenSlider || !sharpenValue) return;

  fileUpload.addEventListener('change', (event) => {
    const files = (event.target as HTMLInputElement).files;
    if (files && files.length > 0) {
      handleImageUpload(files[0]);
    }
  });

  sharpenSlider.addEventListener('input', () => {
    sharpenValue.textContent = sharpenSlider.value;
  });

  restoreButton.addEventListener('click', handleRestore);
}

main();