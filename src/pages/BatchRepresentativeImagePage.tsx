import { useEffect, useMemo, useRef, useState } from "react";
import representativeTemplateSrc from "../assets/대표이미지.png";
import { CutoutEditor } from "../components/common/CutoutEditor";
import { FileDropzone } from "../components/common/FileDropzone";
import { InfoBanner } from "../components/common/InfoBanner";
import { PageHeader } from "../components/common/PageHeader";
import { ToggleField } from "../components/common/ToggleField";
import { useToast } from "../components/common/ToastProvider";
import { useObjectUrl } from "../hooks/useObjectUrl";
import { removeImageBackground } from "../services/backgroundRemoval";
import { runWithConcurrency } from "../services/batchProcessor";
import { downloadBatchZip, downloadSingleResult } from "../services/download";
import {
  composeRepresentativeImage,
  exportCanvasBlob,
  getRepresentativeLayoutRect,
  type LayoutRect,
} from "../services/imageComposer";
import { loadCutoutSettings } from "../services/storageService";
import type { BatchProcessingItem, ObjectOffset } from "../types/app";
import { CANVAS_SIZE } from "../utils/constants";
import { createFileId, getDownloadFileName, validateImageFile } from "../utils/file";
import { formatBytes } from "../utils/format";

function getPreviewRect(layout: LayoutRect, scalePercent: number) {
  const scale = scalePercent / 100;
  const width = layout.width * scale;
  const height = layout.height * scale;

  return {
    left: ((CANVAS_SIZE - width) / 2 / CANVAS_SIZE) * 100,
    top: ((CANVAS_SIZE - height) / 2 / CANVAS_SIZE) * 100,
    width: (width / CANVAS_SIZE) * 100,
    height: (height / CANVAS_SIZE) * 100,
  };
}

export function BatchRepresentativeImagePage() {
  const { showToast } = useToast();
  const cutoutSettings = loadCutoutSettings();
  const previewRef = useRef<HTMLDivElement | null>(null);
  const layerRef = useRef<HTMLImageElement | null>(null);
  const dragPointerIdRef = useRef<number | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; offset: ObjectOffset } | null>(null);
  const dragFrameRef = useRef<number | null>(null);
  const pendingOffsetRef = useRef<ObjectOffset | null>(null);
  const [items, setItems] = useState<BatchProcessingItem[]>([]);
  const [autoCutout, setAutoCutout] = useState(true);
  const [shadow, setShadow] = useState(true);
  const [preserveFileName, setPreserveFileName] = useState(true);
  const [running, setRunning] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [baseLayout, setBaseLayout] = useState<LayoutRect | null>(null);
  const [previewOffset, setPreviewOffset] = useState<ObjectOffset>({ x: 0, y: 0 });
  const [previewScale, setPreviewScale] = useState(100);

  const completedCount = items.filter((item) => item.status === "완료").length;
  const progress = items.length ? Math.round((completedCount / items.length) * 100) : 0;
  const failedItems = items.filter((item) => item.status === "실패");
  const previewItems = items.filter((item) => item.result).slice(0, 12);
  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId && item.result && item.editableBlob),
    [items, selectedId],
  );
  const selectedEditableBlob = selectedItem?.editableBlob ?? null;
  const selectedSourceUrl = useObjectUrl(selectedItem?.file ?? null);
  const selectedEditableUrl = useObjectUrl(selectedEditableBlob);

  const previewRect = useMemo(() => {
    if (!baseLayout || !selectedItem) return null;
    return getPreviewRect(baseLayout, previewScale);
  }, [baseLayout, selectedItem, previewScale]);

  const applyLayerPosition = (nextOffset: ObjectOffset) => {
    if (!layerRef.current || !previewRect) return;
    layerRef.current.style.left = `${previewRect.left + (nextOffset.x / CANVAS_SIZE) * 100}%`;
    layerRef.current.style.top = `${previewRect.top + (nextOffset.y / CANVAS_SIZE) * 100}%`;
  };

  useEffect(() => {
    if (!selectedItem) {
      setPreviewOffset({ x: 0, y: 0 });
      setPreviewScale(100);
      return;
    }

    setPreviewOffset(selectedItem.offset ?? { x: 0, y: 0 });
    setPreviewScale(selectedItem.scale ?? 100);
  }, [selectedItem?.id, selectedItem?.offset?.x, selectedItem?.offset?.y, selectedItem?.scale]);

  useEffect(() => {
    if (!dragging) {
      applyLayerPosition(previewOffset);
    }
  }, [previewOffset, previewRect, dragging]);

  const handleFilesSelected = (files: FileList | null) => {
    if (!files?.length) return;

    const nextItems: BatchProcessingItem[] = [];
    Array.from(files).forEach((file) => {
      const validation = validateImageFile(file);
      if (validation) {
        showToast(`${file.name}: ${validation}`, "error");
        return;
      }

      nextItems.push({
        id: createFileId(file),
        file,
        status: "대기",
        offset: { x: 0, y: 0 },
        scale: 100,
      });
    });

    setItems(nextItems);
    setSelectedId(null);
  };

  const updateItem = (id: string, updater: (item: BatchProcessingItem) => BatchProcessingItem) => {
    setItems((current) => current.map((item) => (item.id === id ? updater(item) : item)));
  };

  const composeBatchItem = async (
    source: Blob,
    options: { offset?: ObjectOffset; scale?: number; withShadow?: boolean },
  ) =>
    composeRepresentativeImage(source, {
      backgroundColor: "#ffffff",
      addShadow: options.withShadow ?? shadow,
      objectOffset: options.offset ?? { x: 0, y: 0 },
      objectScale: (options.scale ?? 100) / 100,
    });

  const processEntries = async (targets: BatchProcessingItem[]) => {
    if (!targets.length) {
      showToast("처리할 파일을 먼저 업로드해 주세요.", "info");
      return;
    }

    setRunning(true);
    await runWithConcurrency(targets, 2, async (target) => {
      updateItem(target.id, (item) => ({ ...item, status: "처리중", error: undefined }));
      try {
        const prepared = autoCutout
          ? await removeImageBackground(target.file, {
              edgeRefinement: cutoutSettings.edgeRefinement,
              preset: cutoutSettings.preset,
              edgeFeather: cutoutSettings.edgeFeather,
              maskInset: cutoutSettings.maskInset,
              haloSuppression: cutoutSettings.haloSuppression / 100,
              translucencyProtection: cutoutSettings.translucencyProtection / 100,
              shadowSuppression: cutoutSettings.shadowSuppression / 100,
              removeSmallArtifacts: cutoutSettings.removeSmallArtifacts,
              removeLogos: cutoutSettings.removeLogos,
            })
          : target.file;
        const offset = { x: 0, y: 0 };
        const scale = 100;
        const composed = await composeBatchItem(prepared, { offset, scale, withShadow: shadow });
        updateItem(target.id, (item) => ({
          ...item,
          status: "완료",
          editableBlob: prepared,
          offset,
          scale,
          result: {
            blob: composed.blob,
            objectUrl: composed.objectUrl,
            width: composed.width,
            height: composed.height,
          },
        }));
      } catch (error) {
        const message = error instanceof Error ? error.message : "처리에 실패했습니다.";
        updateItem(target.id, (item) => ({ ...item, status: "실패", error: message }));
      }
    });
    setRunning(false);
  };

  const startAll = async () => {
    await processEntries(items);
  };

  const retryFailed = async () => {
    await processEntries(failedItems.map((item) => ({ ...item, status: "대기" })));
  };

  const downloadZip = async () => {
    const readyItems = items.filter((item) => item.status === "완료" && item.result);
    if (!readyItems.length) {
      showToast("다운로드할 결과가 없습니다.", "info");
      return;
    }

    const files = await Promise.all(
      readyItems.map(async (item) => {
        const format = "jpg" as const;
        const exported = await exportCanvasBlob(item.result!.blob, format);
        return {
          fileName: getDownloadFileName(item.file.name, format, preserveFileName),
          blob: exported,
        };
      }),
    );

    await downloadBatchZip(files);
  };

  const downloadSelected = async () => {
    if (!selectedItem?.result) {
      showToast("다운로드할 결과가 없습니다.", "info");
      return;
    }

    const blob = await exportCanvasBlob(selectedItem.result.blob, "jpg");
    await downloadSingleResult(blob, selectedItem.file.name, "jpg", preserveFileName);
  };

  const saveSelectedEdit = async (nextOffset?: ObjectOffset, nextScale?: number, nextBlob?: Blob) => {
    if (!selectedItem?.editableBlob) return;

    const offset = nextOffset ?? selectedItem.offset ?? { x: 0, y: 0 };
    const scale = nextScale ?? selectedItem.scale ?? 100;
    const editableBlob = nextBlob ?? selectedItem.editableBlob;
    const composed = await composeBatchItem(editableBlob, { offset, scale, withShadow: shadow });

    updateItem(selectedItem.id, (item) => ({
      ...item,
      editableBlob,
      offset,
      scale,
      result: {
        blob: composed.blob,
        objectUrl: composed.objectUrl,
        width: composed.width,
        height: composed.height,
      },
    }));
  };

  useEffect(() => {
    if (!selectedEditableBlob) {
      setBaseLayout(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const layout = await getRepresentativeLayoutRect(selectedEditableBlob);
        if (!cancelled) {
          setBaseLayout(layout);
        }
      } catch (error) {
        console.error(error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedItem?.id, selectedEditableBlob]);

  const stopDragging = async (pointerId?: number) => {
    if (previewRef.current && pointerId !== undefined && previewRef.current.hasPointerCapture(pointerId)) {
      previewRef.current.releasePointerCapture(pointerId);
    }

    if (dragFrameRef.current !== null) {
      cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
    }

    if (pendingOffsetRef.current) {
      applyLayerPosition(pendingOffsetRef.current);
      setPreviewOffset(pendingOffsetRef.current);
    }

    dragPointerIdRef.current = null;
    dragStartRef.current = null;
    setDragging(false);

    if (selectedItem?.editableBlob) {
      const nextOffset = pendingOffsetRef.current ?? previewOffset;
      pendingOffsetRef.current = null;
      await saveSelectedEdit(nextOffset, previewScale, selectedItem.editableBlob);
    }
  };

  return (
    <div className="page-stack">
      <PageHeader
        title="대표이미지 일괄변경"
        description="여러 상품 이미지를 한 번에 업로드하고 처리한 뒤, 결과 목록에서 필요한 항목만 골라 개별 수정까지 이어서 할 수 있습니다."
      />

      <div className="grid-two grid-two--wide">
        <section className="panel-card">
          <div className="panel-card__header panel-card__header--stack">
            <h3>파일 업로드</h3>
            <div className="progress-meta">
              <span>전체 진행률</span>
              <strong>{progress}% 진행</strong>
            </div>
            <div className="progress-bar">
              <span style={{ width: `${progress}%` }} />
            </div>
          </div>

          <FileDropzone
            description="여러 개의 파일을 드래그하거나 클릭해서 선택해 주세요"
            helperText="지원 형식: JPG, PNG, WEBP"
            accept=".jpg,.jpeg,.png,.webp"
            multiple
            rectangular
            onFilesSelected={handleFilesSelected}
          />

          <div className="file-table">
            <div className="file-table__head">
              <span>파일명</span>
              <span>크기</span>
              <span>상태</span>
            </div>
            {items.map((item) => (
              <div key={item.id} className="file-table__row">
                <span>{item.file.name}</span>
                <span>{formatBytes(item.file.size)}</span>
                <span className={`status status--${item.status}`}>{item.status}</span>
              </div>
            ))}
          </div>

          <div className="option-card">
            <h4>옵션 설정</h4>
            <div className="option-row option-row--wrap">
              <ToggleField label="자동 누끼" checked={autoCutout} onChange={setAutoCutout} />
              <ToggleField label="그림자 적용" checked={shadow} onChange={setShadow} />
              <ToggleField label="파일명 유지" checked={preserveFileName} onChange={setPreserveFileName} />
            </div>
          </div>
        </section>

        <section className="panel-card">
          <div className="panel-card__header">
            <h3>결과 미리보기</h3>
            <span className="ghost-chip">
              {completedCount} / {items.length} 처리 완료
            </span>
          </div>
          <div className="preview-grid">
            {previewItems.length ? (
              previewItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`preview-tile preview-tile--selectable preview-tile--square-output ${selectedId === item.id ? "preview-tile--active" : ""}`}
                  onClick={() => setSelectedId(item.id)}
                >
                  <img src={item.result?.objectUrl} alt={item.file.name} />
                  <strong>{item.file.name}</strong>
                  <span>{selectedId === item.id ? "선택됨" : "클릭해서 수정"}</span>
                </button>
              ))
            ) : (
              <p className="empty-state">처리 완료된 이미지가 여기에 표시됩니다.</p>
            )}
          </div>
        </section>
      </div>

      {selectedItem ? (
        <section className="panel-card">
          <div className="panel-card__header">
            <h3>선택 이미지 수정</h3>
            <span className="ghost-chip">{selectedItem.file.name}</span>
          </div>
          <div className="grid-two">
            <div className="preview-frame preview-frame--square preview-frame--compact">
              {selectedSourceUrl ? <img src={selectedSourceUrl} alt={selectedItem.file.name} /> : null}
            </div>
            <div>
              <div className="preview-frame preview-frame--square preview-frame--compact">
                <div
                  ref={previewRef}
                  className={`interactive-preview ${dragging ? "interactive-preview--dragging" : ""}`}
                  onPointerDown={(event) => {
                    if (!previewRef.current || !selectedEditableUrl) return;
                    event.preventDefault();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    dragPointerIdRef.current = event.pointerId;
                    dragStartRef.current = { x: event.clientX, y: event.clientY, offset: previewOffset };
                    setDragging(true);
                  }}
                  onPointerMove={(event) => {
                    if (!dragging || dragPointerIdRef.current !== event.pointerId || !previewRef.current || !dragStartRef.current) return;
                    event.preventDefault();
                    const rect = previewRef.current.getBoundingClientRect();
                    pendingOffsetRef.current = {
                      x: dragStartRef.current.offset.x + ((event.clientX - dragStartRef.current.x) * CANVAS_SIZE) / rect.width,
                      y: dragStartRef.current.offset.y + ((event.clientY - dragStartRef.current.y) * CANVAS_SIZE) / rect.height,
                    };

                    if (dragFrameRef.current === null) {
                      dragFrameRef.current = requestAnimationFrame(() => {
                        dragFrameRef.current = null;
                        if (pendingOffsetRef.current) {
                          applyLayerPosition(pendingOffsetRef.current);
                        }
                      });
                    }
                  }}
                  onPointerUp={(event) => void stopDragging(event.pointerId)}
                  onPointerCancel={(event) => void stopDragging(event.pointerId)}
                >
                  <img src={representativeTemplateSrc} alt={`${selectedItem.file.name} 수정 미리보기 배경`} className="interactive-preview__base" />
                  {selectedEditableUrl && previewRect ? (
                    <img
                      ref={layerRef}
                      src={selectedEditableUrl}
                      alt={`${selectedItem.file.name} 상품 레이어`}
                      className="interactive-preview__layer"
                      style={{
                        left: `${previewRect.left + (previewOffset.x / CANVAS_SIZE) * 100}%`,
                        top: `${previewRect.top + (previewOffset.y / CANVAS_SIZE) * 100}%`,
                        width: `${previewRect.width}%`,
                        height: `${previewRect.height}%`,
                        filter: !dragging && shadow ? "drop-shadow(0 24px 34px rgba(20, 33, 58, 0.15))" : "none",
                      }}
                    />
                  ) : null}
                  <div className="layout-guide layout-guide--main layout-guide--canvas" />
                </div>
              </div>
              <div className="action-row">
                <button type="button" className="button button--ghost" onClick={() => setEditorOpen(true)}>
                  누끼 편집
                </button>
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => {
                    setPreviewOffset({ x: 0, y: 0 });
                    void saveSelectedEdit({ x: 0, y: 0 }, previewScale, selectedItem.editableBlob);
                  }}
                >
                  위치 초기화
                </button>
                <button type="button" className="button button--outline" onClick={() => void downloadSelected()}>
                  선택 이미지 JPG 다운로드
                </button>
              </div>
              <label className="slider-field">
                <span>상품 이미지 크기 {previewScale}%</span>
                <input
                  type="range"
                  min="70"
                  max="140"
                  value={previewScale}
                  onChange={(event) => setPreviewScale(Number(event.target.value))}
                  onMouseUp={() => void saveSelectedEdit(previewOffset, previewScale, selectedItem.editableBlob)}
                  onTouchEnd={() => void saveSelectedEdit(previewOffset, previewScale, selectedItem.editableBlob)}
                />
              </label>
            </div>
          </div>
        </section>
      ) : null}

      <div className="action-row action-row--triple">
        <button type="button" className="button button--outline" disabled={!failedItems.length} onClick={() => void retryFailed()}>
          실패 파일 재시도
        </button>
        <button type="button" className="button button--outline" disabled={!completedCount} onClick={() => void downloadZip()}>
          ZIP 다운로드
        </button>
        <button type="button" className="button button--primary" disabled={!items.length || running} onClick={() => void startAll()}>
          전체 처리 시작
        </button>
      </div>

      <InfoBanner message="일괄 처리 완료 뒤 결과 썸네일을 클릭하면 대표이미지 생성과 같은 방식으로 개별 위치와 크기를 다시 조정할 수 있습니다." />

      <CutoutEditor
        sourceBlob={selectedEditableBlob}
        restoreSourceBlob={selectedItem?.file ?? null}
        title="일괄 결과 누끼 편집"
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        onApply={(blob) => {
          if (!selectedItem) return;
          void saveSelectedEdit(previewOffset, previewScale, blob);
        }}
      />
    </div>
  );
}
