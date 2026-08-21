import JSZip from "jszip";
import { getDownloadFileName } from "../utils/file";

export function triggerBlobDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadSingleResult(
  blob: Blob,
  fileName: string,
  format: "png" | "jpg",
  preserveName = true,
) {
  const targetName = getDownloadFileName(fileName, format, preserveName);
  triggerBlobDownload(blob, targetName);
}

export async function downloadBatchZip(
  items: Array<{ fileName: string; blob: Blob }>,
  archiveName = "대표이미지_결과.zip",
) {
  const zip = new JSZip();
  items.forEach((item) => {
    zip.file(item.fileName, item.blob);
  });

  const content = await zip.generateAsync({ type: "blob" });
  triggerBlobDownload(content, archiveName);
}
