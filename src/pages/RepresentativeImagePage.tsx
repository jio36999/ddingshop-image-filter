import { useEffect, useMemo, useRef, useState } from "react";
import representativeTemplateSrc from "../assets/대표이미지.png";
import { ActionButtons } from "../components/common/ActionButtons";
import { CutoutEditor } from "../components/common/CutoutEditor";
import { FileDropzone } from "../components/common/FileDropzone";
import { InfoBanner } from "../components/common/InfoBanner";
import { PageHeader } from "../components/common/PageHeader";
import { PreviewCard } from "../components/common/PreviewCard";
import { ToggleField } from "../components/common/ToggleField";
import { useToast } from "../components/common/ToastProvider";
import { useObjectUrl } from "../hooks/useObjectUrl";
import { removeImageBackground } from "../services/backgroundRemoval";
import { downloadSingleResult } from "../services/download";
import {
  composeRepresentativeImage,
  exportCanvasBlob,
  getRepresentativeLayoutRect,
  type LayoutRect,
} from "../services/imageComposer";
import { loadCutoutSettings, loadRepresentativeSettings } from "../services/storageService";
import type { ObjectOffset } from "../types/app";
import { CANVAS_SIZE } from "../utils/constants";
import { validateImageFile } from "../utils/file";

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

const REPRESENTATIVE_TARGET_BOX_RATIO = 1;

export function RepresentativeImagePage() {
  const settings = loadRepresentativeSettings();
  const cutoutSettings = loadCutoutSettings();
  const { showToast } = useToast();
  const previewRef = useRef<HTMLDivElement | null>(null);
  const layerRef = useRef<HTMLImageElement | null>(null);
  const dragPointerIdRef = useRef<number | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; offset: ObjectOffset } | null>(null);
  const dragFrameRef = useRef<number | null>(null);
  const pendingOffsetRef = useRef<ObjectOffset | null>(null);
  const resultUrlRef = useRef<string | null>(null);
  const composeRequestRef = useRef(0);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [autoCutout, setAutoCutout] = useState(settings.autoCutout);
  const [shadow, setShadow] = useState(settings.shadow);
  const [processing, setProcessing] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [editableBlob, setEditableBlob] = useState<Blob | null>(null);
  const [cutoutBlob, setCutoutBlob] = useState<Blob | null>(null);
  const [cutoutError, setCutoutError] = useState<string | null>(null);
  const [composeError, setComposeError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [offset, setOffset] = useState<ObjectOffset>({ x: 0, y: 0 });
  const [objectScale, setObjectScale] = useState(100);
  const [dragging, setDragging] = useState(false);
  const [baseLayout, setBaseLayout] = useState<LayoutRect | null>(null);
  const editableUrl = useObjectUrl(editableBlob);

  const previewRect = useMemo(() => {
    if (!baseLayout) return null;
    return getPreviewRect(baseLayout, objectScale);
  }, [baseLayout, objectScale]);

  const applyLayerPosition = (nextOffset: ObjectOffset) => {
    if (!layerRef.current || !previewRect) return;
    layerRef.current.style.left = `${previewRect.left + (nextOffset.x / CANVAS_SIZE) * 100}%`;
    layerRef.current.style.top = `${previewRect.top + (nextOffset.y / CANVAS_SIZE) * 100}%`;
  };

  useEffect(() => {
    resultUrlRef.current = resultUrl;
  }, [resultUrl]);

  useEffect(() => {
    return () => {
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    };
  }, [resultUrl, sourceUrl]);

  useEffect(() => {
    if (!dragging) {
      applyLayerPosition(offset);
    }
  }, [offset, previewRect, dragging]);

  useEffect(() => {
    if (!sourceFile) return;

    if (!autoCutout) {
      setEditableBlob(sourceFile);
      return;
    }

    if (cutoutBlob) {
      setEditableBlob(cutoutBlob);
    }
  }, [sourceFile, autoCutout, cutoutBlob]);

  async function composeCurrent(blob: Blob) {
    const requestId = composeRequestRef.current + 1;
    composeRequestRef.current = requestId;
    setProcessing(true);
    setComposeError(null);
    try {
      const composed = await composeRepresentativeImage(blob, {
        backgroundColor: "#ffffff",
        addShadow: autoCutout ? shadow : false,
        objectOffset: offset,
        objectScale: objectScale / 100,
        targetBoxRatio: REPRESENTATIVE_TARGET_BOX_RATIO,
      });

      if (composeRequestRef.current !== requestId) {
        URL.revokeObjectURL(composed.objectUrl);
        return;
      }

      if (resultUrl) URL.revokeObjectURL(resultUrl);
      setResultBlob(composed.blob);
      setResultUrl(composed.objectUrl);
    } catch (error) {
      if (composeRequestRef.current !== requestId) {
        return;
      }
      console.error(error);
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      setResultBlob(null);
      setResultUrl(null);
      setComposeError(error instanceof Error ? error.message : "대표이미지 생성 중 오류가 발생했습니다.");
    } finally {
      if (composeRequestRef.current === requestId) {
        setProcessing(false);
      }
    }
  }

  const generateRepresentativeImage = async () => {
    if (!sourceFile) {
      showToast("먼저 이미지를 업로드해 주세요.", "info");
      return;
    }

    setPreparing(true);
    setCutoutError(null);
    setComposeError(null);
    try {
      const preparedBlob = autoCutout
        ? await removeImageBackground(sourceFile, {
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
        : sourceFile;
      setCutoutBlob(autoCutout ? preparedBlob : null);
      setEditableBlob(preparedBlob);
    } catch (error) {
      console.error(error);
      setCutoutBlob(null);
      setEditableBlob(null);
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
      setResultBlob(null);
      setResultUrl(null);
      setCutoutError(error instanceof Error ? error.message : "자동 누끼 처리에 실패했습니다.");
    } finally {
      setPreparing(false);
    }
  };

  const handleFilesSelected = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;

    const validation = validateImageFile(file);
    if (validation) {
      showToast(validation, "error");
      return;
    }

    setSourceFile(file);
    setOffset({ x: 0, y: 0 });
    setObjectScale(100);
    setCutoutBlob(null);
    setEditableBlob(null);
    setResultBlob(null);
    setResultUrl(null);
    setCutoutError(null);
    setComposeError(null);
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    setSourceUrl(URL.createObjectURL(file));
  };

  useEffect(() => {
    if (!editableBlob || dragging) return;
    const timeoutId = window.setTimeout(() => {
      void composeCurrent(editableBlob);
    }, 120);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [editableBlob, shadow, offset, objectScale, dragging, autoCutout]);

  useEffect(() => {
    if (!editableBlob) {
      setBaseLayout(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const layout = await getRepresentativeLayoutRect(editableBlob, {
          targetBoxRatio: REPRESENTATIVE_TARGET_BOX_RATIO,
        });
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
  }, [editableBlob]);

  const stopDragging = (pointerId?: number) => {
    if (previewRef.current && pointerId !== undefined && previewRef.current.hasPointerCapture(pointerId)) {
      previewRef.current.releasePointerCapture(pointerId);
    }

    if (dragFrameRef.current !== null) {
      cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
    }

    if (pendingOffsetRef.current) {
      applyLayerPosition(pendingOffsetRef.current);
      setOffset(pendingOffsetRef.current);
      pendingOffsetRef.current = null;
    }

    dragPointerIdRef.current = null;
    dragStartRef.current = null;
    setDragging(false);
  };

  const handleDownload = async (format: "png" | "jpg") => {
    if (!resultBlob || !sourceFile) return;
    const blob = await exportCanvasBlob(resultBlob, format);
    await downloadSingleResult(blob, sourceFile.name, format);
  };

  return (
    <div className="page-stack">
      <PageHeader
        title="대표이미지 생성"
        description="대표이미지 배경 위에 상품 이미지를 배치하고, 미리보기와 실제 다운로드 결과가 같은 기준으로 보이도록 맞춰 작업할 수 있습니다."
      />

      <div className="representative-layout">
        <div className="representative-layout__side">
          <div className="representative-layout__upload">
            <section className="panel-card">
              {sourceUrl ? (
                <div className="upload-card">
                  <h3>상품 이미지 업로드</h3>
                  <div className="preview-frame preview-frame--square">
                    <img src={sourceUrl} alt="업로드한 원본 이미지" />
                  </div>
                  <div className="action-row">
                    <label className="button button--outline button--full">
                      이미지 다시 선택
                      <input hidden type="file" accept=".jpg,.jpeg,.png,.webp" onChange={(event) => handleFilesSelected(event.target.files)} />
                    </label>
                  </div>
                  <div className="action-row">
                    <button type="button" className="button button--primary button--full" disabled={!sourceFile || preparing || processing} onClick={() => void generateRepresentativeImage()}>
                      {preparing || processing ? "생성 중..." : "대표이미지 생성"}
                    </button>
                  </div>
                </div>
              ) : (
                <FileDropzone
                  title="상품 이미지 업로드"
                  description="이미지를 드래그하거나 클릭해서 업로드해 주세요"
                  helperText="지원 형식: JPG, PNG, WEBP (최대 20MB)"
                  accept=".jpg,.jpeg,.png,.webp"
                  rectangular
                  onFilesSelected={handleFilesSelected}
                  selectedFileName={sourceFile?.name}
                />
              )}
            </section>
          </div>

          <div className="representative-layout__support">
            <section className="panel-card">
              <h3>옵션 설정</h3>
              <div className="option-row option-row--wrap">
                <ToggleField label="자동 누끼" checked={autoCutout} onChange={setAutoCutout} />
                <ToggleField label="그림자 적용" checked={shadow} onChange={setShadow} />
              </div>
              <div className="option-note">
                <p>연출컷은 자동 누끼를 해제한 뒤에 생성 요청해 주세요.</p>
                <p>누끼 오류가 있으면 누끼 편집으로 먼저 다듬은 뒤 작업하는 편이 안전합니다.</p>
              </div>
            </section>

            <InfoBanner message="업로드만으로는 처리하지 않고, 생성 버튼을 눌렀을 때만 작업이 시작되도록 바꿔 전체 버벅임을 줄였습니다." />
          </div>
        </div>

        <div className="representative-layout__preview">
          <PreviewCard
            title="미리보기"
            badge="1100 x 1100"
            previewContent={
              cutoutError || composeError ? (
                <div className="preview-error">
                  <strong>{cutoutError ? "자동 누끼 처리에 실패했습니다." : "대표이미지 생성에 실패했습니다."}</strong>
                  <p>{cutoutError ?? composeError}</p>
                </div>
              ) : (
                <div
                  ref={previewRef}
                  className={`interactive-preview ${dragging ? "interactive-preview--dragging" : ""} ${editableUrl ? "" : "interactive-preview--static"}`}
                  onPointerDown={(event) => {
                    if (!editableUrl || !previewRef.current) return;
                    event.preventDefault();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    dragPointerIdRef.current = event.pointerId;
                    dragStartRef.current = { x: event.clientX, y: event.clientY, offset };
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
                  onPointerUp={(event) => stopDragging(event.pointerId)}
                  onPointerCancel={(event) => stopDragging(event.pointerId)}
                >
                  {autoCutout ? <img src={representativeTemplateSrc} alt="대표이미지 미리보기 배경" className="interactive-preview__base" /> : null}
                  {editableUrl && previewRect ? (
                    <img
                      ref={layerRef}
                      src={editableUrl}
                      alt="대표이미지 상품 레이어"
                      className="interactive-preview__layer"
                      style={{
                        left: `${previewRect.left + (offset.x / CANVAS_SIZE) * 100}%`,
                        top: `${previewRect.top + (offset.y / CANVAS_SIZE) * 100}%`,
                        width: `${previewRect.width}%`,
                        height: `${previewRect.height}%`,
                        filter: !dragging && autoCutout && shadow ? "drop-shadow(0 24px 34px rgba(20, 33, 58, 0.15))" : "none",
                      }}
                    />
                  ) : null}
                  <div className="layout-guide layout-guide--main layout-guide--canvas">
                    <span className="layout-guide__label">실제 출력 영역 1100 x 1100</span>
                  </div>
                  {!editableUrl ? <div className="preview-placeholder">대표이미지 배경 1100 x 1100</div> : null}
                </div>
              )
            }
          >
            <div className="action-row">
              <button type="button" className="button button--ghost" disabled={!editableBlob} onClick={() => setEditorOpen(true)}>
                누끼 편집
              </button>
              <button type="button" className="button button--ghost" disabled={!editableBlob} onClick={() => setOffset({ x: 0, y: 0 })}>
                위치 초기화
              </button>
            </div>
            <label className="slider-field">
              <span>상품 이미지 크기 {objectScale}%</span>
              <input type="range" min="70" max="220" value={objectScale} onChange={(event) => setObjectScale(Number(event.target.value))} />
            </label>
            <ActionButtons
              onJpg={() => void handleDownload("jpg")}
              onPng={() => void handleDownload("png")}
              disableJpg={!resultBlob || processing}
              disablePng={!resultBlob || processing}
            />
          </PreviewCard>
        </div>
      </div>

      <CutoutEditor
        sourceBlob={editableBlob}
        restoreSourceBlob={sourceFile}
        title="대표이미지 누끼 편집"
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        onApply={(blob) => {
          if (autoCutout) {
            setCutoutBlob(blob);
          }
          setEditableBlob(blob);
        }}
      />
    </div>
  );
}
