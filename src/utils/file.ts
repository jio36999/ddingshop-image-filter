import { ACCEPTED_FILE_TYPES, MAX_FILE_SIZE_MB } from "./constants";

export function validateImageFile(file: File) {
  if (!ACCEPTED_FILE_TYPES.includes(file.type)) {
    return `지원하지 않는 파일 형식입니다. JPG, PNG, WEBP 파일만 업로드할 수 있습니다.`;
  }

  if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
    return `파일 크기는 최대 ${MAX_FILE_SIZE_MB}MB까지 업로드할 수 있습니다.`;
  }

  return null;
}

export function createFileId(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

export function getDownloadFileName(fileName: string, format: "png" | "jpg", preserveName = true) {
  const normalized = fileName.replace(/\.[^/.]+$/, "");
  return preserveName ? `${normalized}.${format}` : `${normalized}_result.${format}`;
}
