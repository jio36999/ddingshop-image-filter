import type { CanvasSize } from "../types/image";

export async function createImageBitmapFromBlob(blob: Blob) {
  return createImageBitmap(blob, { imageOrientation: "from-image" });
}

export async function loadImageBitmap(fileOrBlob: Blob) {
  return createImageBitmapFromBlob(fileOrBlob);
}

export function createCanvas(size: CanvasSize) {
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  return canvas;
}

export function calculateContainSize(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
) {
  const ratio = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const width = sourceWidth * ratio;
  const height = sourceHeight * ratio;
  return {
    width,
    height,
    x: (targetWidth - width) / 2,
    y: (targetHeight - height) / 2,
  };
}

export function cropAlphaBounds(imageData: ImageData) {
  const { width, height, data } = imageData;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let maxAlpha = 0;

  for (let index = 3; index < data.length; index += 4) {
    maxAlpha = Math.max(maxAlpha, data[index]);
  }

  const alphaThreshold = Math.max(16, Math.min(72, Math.round(maxAlpha * 0.18)));

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha >= alphaThreshold) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX === -1 || maxY === -1) {
    return { x: 0, y: 0, width, height };
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

export function imageDataToCanvas(imageData: ImageData) {
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("캔버스 컨텍스트를 생성할 수 없습니다.");
  }

  context.putImageData(imageData, 0, 0);
  return canvas;
}

export async function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("이미지 변환에 실패했습니다."));
        return;
      }
      resolve(blob);
    }, type, quality);
  });
}
