import { useEffect, useMemo, useRef, useState } from "react";
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
  composeGiftImage,
  exportCanvasBlob,
  getGiftFrameBaseUrl,
  getGiftFramePreviewLayout,
  GIFT_TEMPLATE_SRC,
  getGiftFrameOverlayUrl,
  getGiftLayoutRects,
  scaleRectFromAnchor,
  toPercentRect,
  type LayoutRect,
} from "../services/imageComposer";
import { loadCutoutSettings, loadGiftSettings } from "../services/storageService";
import type { BatchItemStatus, ObjectOffset, ProcessedImage } from "../types/app";
import { CANVAS_SIZE } from "../utils/constants";
import { createFileId, getDownloadFileName, validateImageFile } from "../utils/file";
import { formatBytes } from "../utils/format";

type ActiveLayer = "main" | "gift";

type BatchGiftItem = {
  id: string;
  file: File;
  status: BatchItemStatus;
  error?: string;
  result?: ProcessedImage;
  editableBlob?: Blob;
  mainOffset: ObjectOffset;
  giftOffset: ObjectOffset;
  mainScale: number;
  giftScale: number;
};

const DEFAULT_MAIN_SCALE = 100;
const DEFAULT_GIFT_SCALE = 100;
const CANVAS_RECT: LayoutRect = { x: 0, y: 0, width: CANVAS_SIZE, height: CANVAS_SIZE };

export function BatchGiftImagePage() {
  const { showToast } = useToast();
  const giftSettings = loadGiftSettings();
  const cutoutSettings = loadCutoutSettings();
  const previewRef = useRef<HTMLDivElement | null>(null);
  const mainLayerRef = useRef<HTMLImageElement | null>(null);
  const giftLayerRef = useRef<HTMLImageElement | null>(null);
  const dragPointerIdRef = useRef<number | null>(null);
  const dragFrameRef = useRef<number | null>(null);
  const pendingMainOffsetRef = useRef<ObjectOffset | null>(null);
  const pendingGiftOffsetRef = useRef<ObjectOffset | null>(null);
  const dragStartRef = useRef<{
    x: number;
    y: number;
    mainOffset: ObjectOffset;
    giftOffset: ObjectOffset;
  } | null>(null);
  const [giftFile, setGiftFile] = useState<File | null>(null);
  const [giftUrl, setGiftUrl] = useState<string | null>(null);
  const [giftBlob, setGiftBlob] = useState<Blob | null>(null);
  const [giftCutout, setGiftCutout] = useState(giftSettings.autoCutoutGift);
  const [mainCutout, setMainCutout] = useState(false);
  const [preserveFileName, setPreserveFileName] = useState(true);
  const [items, setItems] = useState<BatchGiftItem[]>([]);
  const [running, setRunning] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [baseRects, setBaseRects] = useState<{ main: LayoutRect; gift: LayoutRect } | null>(null);
  const [giftFrameBaseUrl, setGiftFrameBaseUrl] = useState<string | null>(null);
  const [giftFrameOverlayUrl, setGiftFrameOverlayUrl] = useState<string | null>(null);
  const [editorTarget, setEditorTarget] = useState<ActiveLayer | null>(null);
  const [activeLayer, setActiveLayer] = useState<ActiveLayer>("main");
  const [dragging, setDragging] = useState(false);

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
  const selectedGiftUrl = useObjectUrl(giftBlob);
  const selectedEditableUrl = useObjectUrl(selectedEditableBlob);

  const mainPreviewRect = useMemo(() => {
    if (!baseRects || !selectedItem) return null;
    return toPercentRect(scaleRectFromAnchor(baseRects.main, selectedItem.mainScale, CANVAS_RECT));
  }, [baseRects, selectedItem]);

  const giftPreviewLayout = useMemo(() => {
    if (!baseRects || !selectedItem) return null;
    return getGiftFramePreviewLayout(baseRects.gift, selectedItem.giftScale, selectedItem.giftOffset);
  }, [baseRects, selectedItem]);

  const applyMainLayerPosition = (nextOffset: ObjectOffset) => {
    if (!mainLayerRef.current || !mainPreviewRect) return;
    mainLayerRef.current.style.left = `${mainPreviewRect.left + (nextOffset.x / CANVAS_SIZE) * 100}%`;
    mainLayerRef.current.style.top = `${mainPreviewRect.top + (nextOffset.y / CANVAS_SIZE) * 100}%`;
  };

  const applyGiftLayerPosition = (nextOffset: ObjectOffset) => {
    if (!giftLayerRef.current || !baseRects || !selectedItem) return;
    const nextLayout = getGiftFramePreviewLayout(baseRects.gift, selectedItem.giftScale, nextOffset);
    giftLayerRef.current.style.left = `${nextLayout.imageRect.left}%`;
    giftLayerRef.current.style.top = `${nextLayout.imageRect.top}%`;
  };

  useEffect(() => {
    return () => {
      if (giftUrl) URL.revokeObjectURL(giftUrl);
    };
  }, [giftUrl]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const baseUrl = await getGiftFrameBaseUrl();
        const overlayUrl = await getGiftFrameOverlayUrl();
        if (!cancelled) {
          setGiftFrameBaseUrl(baseUrl);
          setGiftFrameOverlayUrl(overlayUrl);
        }
      } catch (error) {
        console.error(error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedItem || !giftBlob) {
      setBaseRects(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const nextRects = await getGiftLayoutRects(selectedItem.editableBlob ?? selectedItem.file, giftBlob, {
          mainFullBleed: true,
        });
        if (!cancelled) {
          setBaseRects(nextRects);
        }
      } catch (error) {
        console.error(error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedItem?.id, selectedItem?.editableBlob, giftBlob]);

  useEffect(() => {
    if (!selectedItem || dragging) return;
    applyMainLayerPosition(selectedItem.mainOffset);
    applyGiftLayerPosition(selectedItem.giftOffset);
  }, [selectedItem, mainPreviewRect, giftPreviewLayout, dragging]);

  const updateItem = (id: string, updater: (item: BatchGiftItem) => BatchGiftItem) => {
    setItems((current) => current.map((item) => (item.id === id ? updater(item) : item)));
  };

  const handleGiftUpload = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;

    const validation = validateImageFile(file);
    if (validation) {
      showToast(validation, "error");
      return;
    }

    setGiftFile(file);
    setGiftBlob(null);
    if (giftUrl) URL.revokeObjectURL(giftUrl);
    setGiftUrl(URL.createObjectURL(file));
  };

  const handleMainUpload = (files: FileList | null) => {
    if (!files?.length) return;

    const nextItems: BatchGiftItem[] = [];
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
        mainOffset: { x: 0, y: 0 },
        giftOffset: { x: 0, y: 0 },
        mainScale: DEFAULT_MAIN_SCALE,
        giftScale: DEFAULT_GIFT_SCALE,
      });
    });

    setItems(nextItems);
    setSelectedId(null);
  };

  const buildCutoutOptions = () => ({
    edgeRefinement: cutoutSettings.edgeRefinement,
    preset: cutoutSettings.preset,
    edgeFeather: cutoutSettings.edgeFeather,
    maskInset: cutoutSettings.maskInset,
    haloSuppression: cutoutSettings.haloSuppression / 100,
    translucencyProtection: cutoutSettings.translucencyProtection / 100,
    shadowSuppression: cutoutSettings.shadowSuppression / 100,
    removeSmallArtifacts: cutoutSettings.removeSmallArtifacts,
    removeLogos: cutoutSettings.removeLogos,
  });

  const composeBatchGiftItem = async (
    mainSource: Blob,
    sharedGiftBlob: Blob,
    item: Pick<BatchGiftItem, "mainOffset" | "giftOffset" | "mainScale" | "giftScale">,
  ) =>
    composeGiftImage(mainSource, sharedGiftBlob, {
      backgroundColor: "#ffffff",
      backgroundImageSrc: GIFT_TEMPLATE_SRC,
      mainShadow: mainCutout,
      giftShadow: true,
      mainOffset: item.mainOffset,
      giftOffset: item.giftOffset,
      mainScale: item.mainScale / 100,
      giftScale: item.giftScale / 100,
      mainFullBleed: true,
    });

  const processEntries = async (targets: BatchGiftItem[]) => {
    if (!targets.length || !giftFile) {
      showToast("사은품 이미지와 본품 이미지를 먼저 준비해 주세요.", "info");
      return;
    }

    setRunning(true);

    try {
      const preparedGift = giftCutout
        ? await removeImageBackground(giftFile, buildCutoutOptions())
        : giftFile;

      setGiftBlob(preparedGift);

      await runWithConcurrency(targets, 2, async (target) => {
        updateItem(target.id, (current) => ({ ...current, status: "처리중", error: undefined }));

        try {
          const preparedMain = mainCutout
            ? await removeImageBackground(target.file, buildCutoutOptions())
            : target.file;

          const composed = await composeBatchGiftItem(preparedMain, preparedGift, target);

          updateItem(target.id, (current) => ({
            ...current,
            status: "완료",
            editableBlob: preparedMain,
            result: {
              blob: composed.blob,
              objectUrl: composed.objectUrl,
              width: composed.width,
              height: composed.height,
            },
          }));
        } catch (error) {
          const message = error instanceof Error ? error.message : "처리에 실패했습니다.";
          updateItem(target.id, (current) => ({ ...current, status: "실패", error: message }));
        }
      });
    } finally {
      setRunning(false);
    }
  };

  const startAll = async () => {
    await processEntries(items);
  };

  const retryFailed = async () => {
    await processEntries(failedItems.map((item) => ({ ...item, status: "대기" })));
  };

  const saveSelectedEdit = async (overrides?: Partial<BatchGiftItem>, nextGiftBlob?: Blob) => {
    if (!selectedItem) return;

    const mergedItem: BatchGiftItem = {
      ...selectedItem,
      ...overrides,
      mainOffset: overrides?.mainOffset ?? selectedItem.mainOffset,
      giftOffset: overrides?.giftOffset ?? selectedItem.giftOffset,
      mainScale: overrides?.mainScale ?? selectedItem.mainScale,
      giftScale: overrides?.giftScale ?? selectedItem.giftScale,
      editableBlob: overrides?.editableBlob ?? selectedItem.editableBlob,
    };

    const sharedGiftBlob = nextGiftBlob ?? giftBlob;
    if (!mergedItem.editableBlob || !sharedGiftBlob) return;

    const composed = await composeBatchGiftItem(mergedItem.editableBlob, sharedGiftBlob, mergedItem);
    updateItem(selectedItem.id, () => ({
      ...mergedItem,
      result: {
        blob: composed.blob,
        objectUrl: composed.objectUrl,
        width: composed.width,
        height: composed.height,
      },
    }));
  };

  const stopDragging = (pointerId?: number) => {
    if (previewRef.current && pointerId !== undefined && previewRef.current.hasPointerCapture(pointerId)) {
      previewRef.current.releasePointerCapture(pointerId);
    }

    if (dragFrameRef.current !== null) {
      cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
    }

    const nextMainOffset = pendingMainOffsetRef.current ?? selectedItem?.mainOffset;
    const nextGiftOffset = pendingGiftOffsetRef.current ?? selectedItem?.giftOffset;
    pendingMainOffsetRef.current = null;
    pendingGiftOffsetRef.current = null;
    dragPointerIdRef.current = null;
    dragStartRef.current = null;
    setDragging(false);

    if (!selectedItem || !nextMainOffset || !nextGiftOffset) return;

    void saveSelectedEdit({
      mainOffset: nextMainOffset,
      giftOffset: nextGiftOffset,
    });
  };

  const handleDownloadZip = async () => {
    const readyItems = items.filter((item) => item.status === "완료" && item.result);
    if (!readyItems.length) {
      showToast("다운로드할 결과가 없습니다.", "info");
      return;
    }

    const files = await Promise.all(
      readyItems.map(async (item) => {
        const blob = await exportCanvasBlob(item.result!.blob, "jpg");
        return {
          fileName: getDownloadFileName(item.file.name, "jpg", preserveFileName),
          blob,
        };
      }),
    );

    await downloadBatchZip(files, "사은품이미지_결과.zip");
  };

  const handleDownloadSelected = async () => {
    if (!selectedItem?.result) {
      showToast("다운로드할 결과가 없습니다.", "info");
      return;
    }

    const blob = await exportCanvasBlob(selectedItem.result.blob, "jpg");
    await downloadSingleResult(blob, selectedItem.file.name, "jpg", preserveFileName);
  };

  return (
    <div className="page-stack">
      <PageHeader
        title="사은품 이미지 일괄변경"
        description="사은품 이미지를 한 번만 고정 업로드하고, 여러 본품 이미지를 한꺼번에 사은품 가이드와 합성할 수 있습니다."
      />

      <div className="grid-two grid-two--wide">
        <section className="panel-card">
          {giftUrl ? (
            <div className="upload-card">
              <div className="upload-card__copy">
                <h3>사은품 이미지 업로드</h3>
                <p>일괄변경에 공통으로 들어갈 사은품 이미지를 먼저 올려주세요.</p>
              </div>
              <div className="preview-frame preview-frame--square preview-frame--compact preview-frame--cover">
                <img src={giftUrl} alt="고정 사은품 원본 이미지" />
              </div>
              <div className="action-row">
                <label className="button button--outline button--full">
                  사은품 이미지 다시 선택
                  <input hidden type="file" accept=".jpg,.jpeg,.png,.webp" onChange={(event) => handleGiftUpload(event.target.files)} />
                </label>
              </div>
            </div>
          ) : (
            <FileDropzone
              title="사은품 이미지 업로드"
              description="일괄변경에 공통으로 들어갈 사은품 이미지를 먼저 올려주세요."
              helperText="지원 형식: JPG, PNG, WEBP"
              accept=".jpg,.jpeg,.png,.webp"
              rectangular
              onFilesSelected={handleGiftUpload}
            />
          )}
        </section>

        <section className="panel-card">
          <div className="panel-card__header panel-card__header--stack">
            <h3>본품 파일 업로드</h3>
            <div className="progress-meta">
              <span>전체 진행률</span>
              <strong>{progress}% 진행</strong>
            </div>
            <div className="progress-bar">
              <span style={{ width: `${progress}%` }} />
            </div>
          </div>

          <FileDropzone
            description="본품 이미지를 여러 개 드래그하거나 클릭해서 선택해 주세요"
            helperText="지원 형식: JPG, PNG, WEBP"
            accept=".jpg,.jpeg,.png,.webp"
            multiple
            rectangular
            onFilesSelected={handleMainUpload}
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
              <ToggleField label="본품 자동 누끼" checked={mainCutout} onChange={setMainCutout} />
              <ToggleField label="사은품 자동 누끼" checked={giftCutout} onChange={setGiftCutout} />
              <ToggleField label="파일명 유지" checked={preserveFileName} onChange={setPreserveFileName} />
            </div>
          </div>
        </section>
      </div>

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
                className={`preview-tile preview-tile--selectable ${selectedId === item.id ? "preview-tile--active" : ""}`}
                onClick={() => setSelectedId(item.id)}
              >
                <img src={item.result?.objectUrl} alt={item.file.name} />
                <strong>{item.file.name}</strong>
                <span>{selectedId === item.id ? "선택됨" : "클릭해서 수정"}</span>
              </button>
            ))
          ) : (
            <p className="empty-state">일괄 생성 결과가 여기에 표시됩니다.</p>
          )}
        </div>
      </section>

      {selectedItem && selectedEditableUrl && giftBlob && selectedGiftUrl && mainPreviewRect && giftPreviewLayout ? (
        <section className="panel-card">
          <div className="panel-card__header">
            <h3>선택 이미지 수정</h3>
            <span className="ghost-chip">{selectedItem.file.name}</span>
          </div>
          <div className="grid-two">
            <div className="form-stack">
              <div className="preview-frame preview-frame--square preview-frame--compact">
                {selectedSourceUrl ? <img src={selectedSourceUrl} alt={selectedItem.file.name} /> : null}
              </div>
              <div className="preview-frame preview-frame--square preview-frame--compact">
                <img src={selectedGiftUrl} alt="공통 사은품 이미지" />
              </div>
            </div>
            <div>
              <div className="preview-frame preview-frame--square preview-frame--compact">
                <div
                  ref={previewRef}
                  className={`interactive-preview ${dragging ? "interactive-preview--dragging" : ""}`}
                  onPointerDown={(event) => {
                    if (!previewRef.current) return;
                    event.preventDefault();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    dragPointerIdRef.current = event.pointerId;
                    dragStartRef.current = {
                      x: event.clientX,
                      y: event.clientY,
                      mainOffset: selectedItem.mainOffset,
                      giftOffset: selectedItem.giftOffset,
                    };
                    setDragging(true);
                  }}
                  onPointerMove={(event) => {
                    if (!dragging || dragPointerIdRef.current !== event.pointerId || !previewRef.current || !dragStartRef.current) return;
                    event.preventDefault();
                    const rect = previewRef.current.getBoundingClientRect();
                    const nextOffset = {
                      x: ((event.clientX - dragStartRef.current.x) * CANVAS_SIZE) / rect.width,
                      y: ((event.clientY - dragStartRef.current.y) * CANVAS_SIZE) / rect.height,
                    };

                    if (activeLayer === "main") {
                      pendingMainOffsetRef.current = {
                        x: dragStartRef.current.mainOffset.x + nextOffset.x,
                        y: dragStartRef.current.mainOffset.y + nextOffset.y,
                      };
                    } else {
                      pendingGiftOffsetRef.current = {
                        x: dragStartRef.current.giftOffset.x + nextOffset.x,
                        y: dragStartRef.current.giftOffset.y + nextOffset.y,
                      };
                    }

                    if (dragFrameRef.current === null) {
                      dragFrameRef.current = requestAnimationFrame(() => {
                        dragFrameRef.current = null;
                        if (pendingMainOffsetRef.current) {
                          applyMainLayerPosition(pendingMainOffsetRef.current);
                        }
                        if (pendingGiftOffsetRef.current) {
                          applyGiftLayerPosition(pendingGiftOffsetRef.current);
                        }
                      });
                    }
                  }}
                  onPointerUp={(event) => stopDragging(event.pointerId)}
                  onPointerCancel={(event) => stopDragging(event.pointerId)}
                >
                  <img src={GIFT_TEMPLATE_SRC} alt="사은품 이미지 미리보기 배경" className="interactive-preview__base" />
                  <img
                    ref={mainLayerRef}
                    src={selectedEditableUrl}
                    alt="본품 레이어"
                    className="interactive-preview__layer"
                    style={{
                      left: `${mainPreviewRect.left + (selectedItem.mainOffset.x / CANVAS_SIZE) * 100}%`,
                      top: `${mainPreviewRect.top + (selectedItem.mainOffset.y / CANVAS_SIZE) * 100}%`,
                      width: `${mainPreviewRect.width}%`,
                      height: `${mainPreviewRect.height}%`,
                      filter: dragging ? "none" : "drop-shadow(0 24px 34px rgba(20, 33, 58, 0.15))",
                    }}
                  />
                  {giftFrameBaseUrl ? (
                    <img
                      src={giftFrameBaseUrl}
                      alt="사은품 프레임 배경"
                      className="interactive-preview__overlay"
                      style={{
                        left: `${giftPreviewLayout.baseRect.left}%`,
                        top: `${giftPreviewLayout.baseRect.top}%`,
                        width: `${giftPreviewLayout.baseRect.width}%`,
                        height: `${giftPreviewLayout.baseRect.height}%`,
                        zIndex: 2,
                      }}
                    />
                  ) : null}
                  <div
                    className="interactive-preview__gift-clip"
                    style={{
                      left: `${giftPreviewLayout.clipRect.left}%`,
                      top: `${giftPreviewLayout.clipRect.top}%`,
                      width: `${giftPreviewLayout.clipRect.width}%`,
                      height: `${giftPreviewLayout.clipRect.height}%`,
                      borderRadius: `${giftPreviewLayout.clipRadiusPercent}%`,
                    }}
                  >
                    <img
                      ref={giftLayerRef}
                      src={selectedGiftUrl}
                      alt="사은품 레이어"
                      className="interactive-preview__layer"
                      style={{
                        left: `${giftPreviewLayout.imageRect.left}%`,
                        top: `${giftPreviewLayout.imageRect.top}%`,
                        width: `${giftPreviewLayout.imageRect.width}%`,
                        height: `${giftPreviewLayout.imageRect.height}%`,
                        filter: dragging ? "none" : "drop-shadow(0 16px 24px rgba(20, 33, 58, 0.12))",
                      }}
                    />
                  </div>
                  {giftFrameOverlayUrl ? (
                    <img
                      src={giftFrameOverlayUrl}
                      alt="사은품 프레임 오버레이"
                      className="interactive-preview__overlay"
                      style={{
                        left: `${giftPreviewLayout.overlayRect.left}%`,
                        top: `${giftPreviewLayout.overlayRect.top}%`,
                        width: `${giftPreviewLayout.overlayRect.width}%`,
                        height: `${giftPreviewLayout.overlayRect.height}%`,
                        zIndex: 5,
                      }}
                    />
                  ) : null}
                  <div className="layout-guide layout-guide--main layout-guide--canvas">
                    <span className="layout-guide__label">실제 출력 영역 1100 x 1100</span>
                  </div>
                </div>
              </div>
              <div className="action-row">
                <button type="button" className="button button--ghost button--stacked" onClick={() => setActiveLayer("main")}>
                  <span>본품</span>
                  <span>이동</span>
                </button>
                <button type="button" className="button button--ghost button--stacked" onClick={() => setActiveLayer("gift")}>
                  <span>사은품</span>
                  <span>이동</span>
                </button>
                <button type="button" className="button button--ghost" onClick={() => setEditorTarget("main")}>
                  본품 누끼 편집
                </button>
                <button type="button" className="button button--ghost" onClick={() => setEditorTarget("gift")}>
                  사은품 누끼 편집
                </button>
                <button type="button" className="button button--outline" onClick={() => void handleDownloadSelected()}>
                  선택 이미지 JPG 다운로드
                </button>
              </div>
              <label className="slider-field">
                <span>본품 크기 {selectedItem.mainScale}%</span>
                <input
                  type="range"
                  min="70"
                  max="220"
                  value={selectedItem.mainScale}
                  onChange={(event) =>
                    updateItem(selectedItem.id, (item) => ({ ...item, mainScale: Number(event.target.value) }))
                  }
                  onMouseUp={() => void saveSelectedEdit()}
                  onTouchEnd={() => void saveSelectedEdit()}
                />
              </label>
              <label className="slider-field">
                <span>사은품 크기 {selectedItem.giftScale}%</span>
                <input
                  type="range"
                  min="70"
                  max="220"
                  value={selectedItem.giftScale}
                  onChange={(event) =>
                    updateItem(selectedItem.id, (item) => ({ ...item, giftScale: Number(event.target.value) }))
                  }
                  onMouseUp={() => void saveSelectedEdit()}
                  onTouchEnd={() => void saveSelectedEdit()}
                />
              </label>
            </div>
          </div>
        </section>
      ) : null}

      <div className="action-row action-row--triple">
        <button type="button" className="button button--outline" disabled={!failedItems.length || running} onClick={() => void retryFailed()}>
          실패 파일 재시도
        </button>
        <button type="button" className="button button--outline" disabled={!completedCount} onClick={() => void handleDownloadZip()}>
          ZIP 다운로드
        </button>
        <button
          type="button"
          className="button button--primary"
          disabled={!giftFile || !items.length || running}
          onClick={() => void startAll()}
        >
          {running ? "생성 중..." : "전체 처리 시작"}
        </button>
      </div>

      <InfoBanner message="공통 사은품 이미지를 한 번만 올리고, 여러 본품에 같은 사은품 가이드를 반복 적용할 수 있습니다." />

      <CutoutEditor
        sourceBlob={editorTarget === "main" ? selectedEditableBlob : giftBlob}
        restoreSourceBlob={editorTarget === "main" ? selectedItem?.file ?? null : giftFile}
        title={editorTarget === "main" ? "본품 누끼 편집" : "공통 사은품 누끼 편집"}
        open={editorTarget !== null}
        onClose={() => setEditorTarget(null)}
        onApply={(blob) => {
          if (editorTarget === "main" && selectedItem) {
            void saveSelectedEdit({ editableBlob: blob });
            return;
          }

          setGiftBlob(blob);
          if (selectedItem) {
            void saveSelectedEdit(undefined, blob);
          }
        }}
      />
    </div>
  );
}
