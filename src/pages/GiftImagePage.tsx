import { useEffect, useMemo, useRef, useState } from "react";
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
  composeGiftImage,
  getGiftFrameBaseUrl,
  getGiftFramePreviewLayout,
  GIFT_TEMPLATE_SRC,
  exportCanvasBlob,
  getGiftFrameOverlayUrl,
  getGiftLayoutRects,
  scaleRectFromAnchor,
  toPercentRect,
  type LayoutRect,
} from "../services/imageComposer";
import { loadCutoutSettings, loadGiftSettings } from "../services/storageService";
import type { ObjectOffset } from "../types/app";
import { CANVAS_SIZE } from "../utils/constants";
import { validateImageFile } from "../utils/file";

type ActiveLayer = "main" | "gift";

const DEFAULT_MAIN_SCALE = 100;
const DEFAULT_GIFT_SCALE = 100;
const CANVAS_RECT: LayoutRect = { x: 0, y: 0, width: CANVAS_SIZE, height: CANVAS_SIZE };

export function GiftImagePage() {
  const settings = loadGiftSettings();
  const cutoutSettings = loadCutoutSettings();
  const { showToast } = useToast();
  const previewRef = useRef<HTMLDivElement | null>(null);
  const mainLayerRef = useRef<HTMLImageElement | null>(null);
  const giftLayerRef = useRef<HTMLImageElement | null>(null);
  const dragPointerIdRef = useRef<number | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; mainOffset: ObjectOffset; giftOffset: ObjectOffset } | null>(null);
  const dragFrameRef = useRef<number | null>(null);
  const pendingMainOffsetRef = useRef<ObjectOffset | null>(null);
  const pendingGiftOffsetRef = useRef<ObjectOffset | null>(null);
  const resultUrlRef = useRef<string | null>(null);
  const composeRequestRef = useRef(0);
  const [mainFile, setMainFile] = useState<File | null>(null);
  const [giftFile, setGiftFile] = useState<File | null>(null);
  const [mainUrl, setMainUrl] = useState<string | null>(null);
  const [giftUrl, setGiftUrl] = useState<string | null>(null);
  const [mainCutout, setMainCutout] = useState(false);
  const [giftCutout, setGiftCutout] = useState(settings.autoCutoutGift);
  const [mainBlob, setMainBlob] = useState<Blob | null>(null);
  const [giftBlob, setGiftBlob] = useState<Blob | null>(null);
  const [mainCutoutBlob, setMainCutoutBlob] = useState<Blob | null>(null);
  const [giftCutoutBlob, setGiftCutoutBlob] = useState<Blob | null>(null);
  const [mainOffset, setMainOffset] = useState<ObjectOffset>({ x: 0, y: 0 });
  const [giftOffset, setGiftOffset] = useState<ObjectOffset>({ x: 0, y: 0 });
  const [mainScale, setMainScale] = useState(DEFAULT_MAIN_SCALE);
  const [giftScale, setGiftScale] = useState(DEFAULT_GIFT_SCALE);
  const [activeLayer, setActiveLayer] = useState<ActiveLayer>("main");
  const [editorTarget, setEditorTarget] = useState<ActiveLayer | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [mainCutoutError, setMainCutoutError] = useState<string | null>(null);
  const [giftCutoutError, setGiftCutoutError] = useState<string | null>(null);
  const [composeError, setComposeError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [baseRects, setBaseRects] = useState<{ main: LayoutRect; gift: LayoutRect } | null>(null);
  const [giftFrameBaseUrl, setGiftFrameBaseUrl] = useState<string | null>(null);
  const [giftFrameOverlayUrl, setGiftFrameOverlayUrl] = useState<string | null>(null);
  const mainEditableUrl = useObjectUrl(mainBlob);
  const giftEditableUrl = useObjectUrl(giftBlob);

  const mainPreviewRect = useMemo(() => {
    if (!baseRects) return null;
    return toPercentRect(scaleRectFromAnchor(baseRects.main, mainScale, CANVAS_RECT));
  }, [baseRects, mainScale]);

  const giftPreviewLayout = useMemo(() => {
    if (!baseRects) return null;
    return getGiftFramePreviewLayout(baseRects.gift, giftScale, giftOffset);
  }, [baseRects, giftScale, giftOffset]);

  const applyMainLayerPosition = (nextOffset: ObjectOffset) => {
    if (!mainLayerRef.current || !mainPreviewRect) return;
    mainLayerRef.current.style.left = `${mainPreviewRect.left + (nextOffset.x / CANVAS_SIZE) * 100}%`;
    mainLayerRef.current.style.top = `${mainPreviewRect.top + (nextOffset.y / CANVAS_SIZE) * 100}%`;
  };

  const applyGiftLayerPosition = (nextOffset: ObjectOffset) => {
    if (!giftLayerRef.current || !baseRects) return;
    const nextLayout = getGiftFramePreviewLayout(baseRects.gift, giftScale, nextOffset);
    giftLayerRef.current.style.left = `${nextLayout.imageRect.left}%`;
    giftLayerRef.current.style.top = `${nextLayout.imageRect.top}%`;
  };

  useEffect(() => {
    resultUrlRef.current = resultUrl;
  }, [resultUrl]);

  useEffect(() => {
    return () => {
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      if (mainUrl) URL.revokeObjectURL(mainUrl);
      if (giftUrl) URL.revokeObjectURL(giftUrl);
    };
  }, [resultUrl, mainUrl, giftUrl]);

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
    if (!dragging) {
      applyMainLayerPosition(mainOffset);
      applyGiftLayerPosition(giftOffset);
    }
  }, [mainOffset, giftOffset, mainPreviewRect, giftPreviewLayout, dragging]);

  useEffect(() => {
    if (!hasGenerated || !mainFile) return;

    if (!mainCutout) {
      setMainBlob(mainFile);
      return;
    }

    if (mainCutoutBlob) {
      setMainBlob(mainCutoutBlob);
    }
  }, [hasGenerated, mainFile, mainCutout, mainCutoutBlob]);

  useEffect(() => {
    if (!hasGenerated || !giftFile) return;

    if (!giftCutout) {
      setGiftBlob(giftFile);
      return;
    }

    if (giftCutoutBlob) {
      setGiftBlob(giftCutoutBlob);
    }
  }, [hasGenerated, giftFile, giftCutout, giftCutoutBlob]);

  async function composeCurrent(nextMain = mainBlob, nextGift = giftBlob) {
    if (!nextMain || !nextGift) return;

    const requestId = composeRequestRef.current + 1;
    composeRequestRef.current = requestId;
    setProcessing(true);
    setComposeError(null);
    try {
      const result = await composeGiftImage(nextMain, nextGift, {
        backgroundColor: "#ffffff",
        backgroundImageSrc: GIFT_TEMPLATE_SRC,
        mainShadow: mainCutout,
        giftShadow: true,
        mainOffset,
        giftOffset,
        mainScale: mainScale / 100,
        giftScale: giftScale / 100,
        mainFullBleed: true,
      });

      if (composeRequestRef.current !== requestId) {
        URL.revokeObjectURL(result.objectUrl);
        return;
      }

      if (resultUrl) URL.revokeObjectURL(resultUrl);
      setResultBlob(result.blob);
      setResultUrl(result.objectUrl);
    } catch (error) {
      if (composeRequestRef.current !== requestId) {
        return;
      }
      console.error(error);
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      setResultBlob(null);
      setResultUrl(null);
      setComposeError(error instanceof Error ? error.message : "사은품 이미지 생성에 실패했습니다.");
    } finally {
      if (composeRequestRef.current === requestId) {
        setProcessing(false);
      }
    }
  }

  useEffect(() => {
    if (!mainBlob || !giftBlob || dragging) return;
    const timeoutId = window.setTimeout(() => {
      void composeCurrent(mainBlob, giftBlob);
    }, 120);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [mainBlob, giftBlob, mainOffset, giftOffset, mainScale, giftScale, mainCutout, giftCutout, dragging]);

  const generateGiftImage = async () => {
    if (!mainFile || !giftFile) {
      showToast("본품 이미지와 사은품 이미지를 모두 업로드해 주세요.", "info");
      return;
    }

    setPreparing(true);
    setMainCutoutError(null);
    setGiftCutoutError(null);
    setComposeError(null);
    try {
      const [preparedMain, preparedGift] = await Promise.all([
        mainCutout
          ? removeImageBackground(mainFile, {
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
          : Promise.resolve(mainFile),
        giftCutout
          ? removeImageBackground(giftFile, {
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
          : Promise.resolve(giftFile),
      ]);

      if (mainCutout) {
        setMainCutoutBlob(preparedMain);
      }
      if (giftCutout) {
        setGiftCutoutBlob(preparedGift);
      }

      setMainBlob(mainCutout ? preparedMain : mainFile);
      setGiftBlob(giftCutout ? preparedGift : giftFile);
      setHasGenerated(true);
    } catch (error) {
      console.error(error);
      setMainBlob(null);
      setGiftBlob(null);
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
      setResultBlob(null);
      setResultUrl(null);
      const message = error instanceof Error ? error.message : "사은품 이미지 생성 준비에 실패했습니다.";
      setMainCutoutError(message);
    } finally {
      setPreparing(false);
    }
  };

  useEffect(() => {
    if (!mainBlob || !giftBlob) {
      setBaseRects(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const nextRects = await getGiftLayoutRects(mainBlob, giftBlob, {
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
  }, [mainBlob, giftBlob]);

  const handleMainUpload = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    const validation = validateImageFile(file);
    if (validation) {
      showToast(validation, "error");
      return;
    }

    setMainFile(file);
    setMainOffset({ x: 0, y: 0 });
    setMainScale(DEFAULT_MAIN_SCALE);
    setMainBlob(null);
    setMainCutoutBlob(null);
    setResultBlob(null);
    setResultUrl(null);
    setMainCutoutError(null);
    setComposeError(null);
    setHasGenerated(false);
    if (mainUrl) URL.revokeObjectURL(mainUrl);
    setMainUrl(URL.createObjectURL(file));
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
    setGiftOffset({ x: 0, y: 0 });
    setGiftScale(DEFAULT_GIFT_SCALE);
    setGiftBlob(null);
    setGiftCutoutBlob(null);
    setResultBlob(null);
    setResultUrl(null);
    setGiftCutoutError(null);
    setComposeError(null);
    setHasGenerated(false);
    if (giftUrl) URL.revokeObjectURL(giftUrl);
    setGiftUrl(URL.createObjectURL(file));
  };

  const stopDragging = (pointerId?: number) => {
    if (previewRef.current && pointerId !== undefined && previewRef.current.hasPointerCapture(pointerId)) {
      previewRef.current.releasePointerCapture(pointerId);
    }

    if (dragFrameRef.current !== null) {
      cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
    }

    if (pendingMainOffsetRef.current) {
      applyMainLayerPosition(pendingMainOffsetRef.current);
      setMainOffset(pendingMainOffsetRef.current);
      pendingMainOffsetRef.current = null;
    }

    if (pendingGiftOffsetRef.current) {
      applyGiftLayerPosition(pendingGiftOffsetRef.current);
      setGiftOffset(pendingGiftOffsetRef.current);
      pendingGiftOffsetRef.current = null;
    }

    dragPointerIdRef.current = null;
    dragStartRef.current = null;
    setDragging(false);
  };

  const handleDownload = async (format: "png" | "jpg") => {
    if (!resultBlob || !mainFile) return;
    const exported = await exportCanvasBlob(resultBlob, format);
    await downloadSingleResult(exported, mainFile.name, format, false);
  };

  return (
    <div className="page-stack">
      <PageHeader
        title="사은품 이미지 생성"
        description="본품과 사은품을 각각 업로드한 뒤, 결과 화면에서 자연스럽게 위치와 크기를 조정할 수 있습니다."
      />

      <div className="gift-layout">
        <div className="gift-layout__uploads">
          <section className="panel-card">
            {mainUrl ? (
              <div className="upload-card">
                <h3>본품 이미지 업로드</h3>
                <div className="preview-frame preview-frame--square">
                  <img src={mainUrl} alt="업로드한 본품 원본 이미지" />
                </div>
                <div className="action-row">
                  <label className="button button--outline button--full">
                    본품 이미지 다시 선택
                    <input hidden type="file" accept=".jpg,.jpeg,.png,.webp" onChange={(event) => handleMainUpload(event.target.files)} />
                  </label>
                </div>
              </div>
            ) : (
              <FileDropzone
                title="본품 이미지 업로드"
                description="이미지를 드래그하거나 클릭해서 업로드해 주세요"
                helperText="지원 형식: JPG, PNG, WEBP (최대 20MB)"
                accept=".jpg,.jpeg,.png,.webp"
                onFilesSelected={handleMainUpload}
                selectedFileName={mainFile?.name}
              />
            )}
          </section>

          <section className="panel-card">
            {giftUrl ? (
              <div className="upload-card">
                <h3>사은품 이미지 업로드</h3>
                <div className="preview-frame preview-frame--square">
                  <img src={giftUrl} alt="업로드한 사은품 원본 이미지" />
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
                description="이미지를 드래그하거나 클릭해서 업로드해 주세요"
                helperText="지원 형식: JPG, PNG, WEBP (최대 20MB)"
                accept=".jpg,.jpeg,.png,.webp"
                onFilesSelected={handleGiftUpload}
                selectedFileName={giftFile?.name}
              />
            )}
          </section>
        </div>

        <div className="gift-layout__preview">
          <PreviewCard
            title="미리보기"
            emptyMessage={processing ? "결과 이미지를 생성하고 있습니다." : "본품과 사은품을 올리면 결과를 여기에서 확인할 수 있습니다."}
            previewContent={
              mainCutoutError || giftCutoutError || composeError ? (
                <div className="preview-error">
                  <strong>
                    {mainCutoutError
                      ? "본품 자동 누끼 처리에 실패했습니다."
                      : giftCutoutError
                        ? "사은품 자동 누끼 처리에 실패했습니다."
                        : "사은품 이미지 생성에 실패했습니다."}
                  </strong>
                  <p>{mainCutoutError ?? giftCutoutError ?? composeError}</p>
                </div>
              ) : mainEditableUrl && giftEditableUrl && mainPreviewRect && giftPreviewLayout ? (
                <div
                  ref={previewRef}
                  className={`interactive-preview ${dragging ? "interactive-preview--dragging" : ""}`}
                  onPointerDown={(event) => {
                    if (!previewRef.current) return;
                    event.preventDefault();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    dragPointerIdRef.current = event.pointerId;
                    dragStartRef.current = { x: event.clientX, y: event.clientY, mainOffset, giftOffset };
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
                    src={mainEditableUrl}
                    alt="본품 레이어"
                    className="interactive-preview__layer"
                    style={{
                      left: `${mainPreviewRect.left + (mainOffset.x / CANVAS_SIZE) * 100}%`,
                      top: `${mainPreviewRect.top + (mainOffset.y / CANVAS_SIZE) * 100}%`,
                      width: `${mainPreviewRect.width}%`,
                      height: `${mainPreviewRect.height}%`,
                      filter: !dragging && mainCutout ? "drop-shadow(0 24px 34px rgba(20, 33, 58, 0.15))" : "none",
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
                      src={giftEditableUrl}
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
              ) : undefined
            }
          >
            <div className="action-row">
              <button type="button" className="button button--ghost button--stacked" onClick={() => setActiveLayer("main")}>
                <span>본품</span>
                <span>이동</span>
              </button>
              <button type="button" className="button button--ghost button--stacked" onClick={() => setActiveLayer("gift")}>
                <span>사은품</span>
                <span>이동</span>
              </button>
              <button type="button" className="button button--ghost" disabled={!mainBlob} onClick={() => setEditorTarget("main")}>
                본품 누끼 편집
              </button>
              <button type="button" className="button button--ghost" disabled={!giftBlob} onClick={() => setEditorTarget("gift")}>
                사은품 누끼 편집
              </button>
            </div>
            <label className="slider-field">
              <span>본품 크기 {mainScale}%</span>
              <input type="range" min="70" max="220" value={mainScale} onChange={(event) => setMainScale(Number(event.target.value))} />
            </label>
            <label className="slider-field">
              <span>사은품 크기 {giftScale}%</span>
              <input type="range" min="70" max="220" value={giftScale} onChange={(event) => setGiftScale(Number(event.target.value))} />
            </label>
            <div className="action-row">
              <button type="button" className="button button--ghost" onClick={() => setMainOffset({ x: 0, y: 0 })}>
                본품 위치 초기화
              </button>
              <button type="button" className="button button--ghost" onClick={() => setGiftOffset({ x: 0, y: 0 })}>
                사은품 위치 초기화
              </button>
            </div>
            <ActionButtons
              onJpg={() => void handleDownload("jpg")}
              onPng={() => void handleDownload("png")}
              disableJpg={!resultBlob || processing}
              disablePng={!resultBlob || processing}
            />
          </PreviewCard>
        </div>

        <div className="gift-layout__support">
          <section className="panel-card">
            <h3>옵션 설정</h3>
            <div className="option-row option-row--wrap">
              <ToggleField label="본품 이미지 자동 누끼" checked={mainCutout} onChange={setMainCutout} />
              <ToggleField label="사은품 이미지 자동 누끼" checked={giftCutout} onChange={setGiftCutout} />
            </div>
            <div className="option-note">
              <p>연출컷은 자동 누끼를 해제한 뒤에 생성 요청해 주세요.</p>
              <p>누끼 오류가 있으면 각 이미지를 먼저 편집한 뒤 배치하는 편이 안전합니다.</p>
            </div>
            <div className="action-row">
              <button
                type="button"
                className="button button--primary button--full"
                disabled={!mainFile || !giftFile || preparing || processing}
                onClick={() => void generateGiftImage()}
              >
                {preparing || processing ? "생성 중..." : "사은품 이미지 생성"}
              </button>
            </div>
          </section>

          <InfoBanner message="왼쪽은 원본 확인 영역이고, 오른쪽 미리보기에서 실제 배치 위치와 크기를 자연스럽게 조정할 수 있습니다." />
        </div>
      </div>

      <CutoutEditor
        sourceBlob={editorTarget === "main" ? mainBlob : giftBlob}
        restoreSourceBlob={editorTarget === "main" ? mainFile : giftFile}
        title={editorTarget === "main" ? "본품 누끼 편집" : "사은품 누끼 편집"}
        open={editorTarget !== null}
        onClose={() => setEditorTarget(null)}
        onApply={(blob) => {
          if (editorTarget === "main") {
            if (mainCutout) {
              setMainCutoutBlob(blob);
            }
            setMainBlob(blob);
          } else {
            if (giftCutout) {
              setGiftCutoutBlob(blob);
            }
            setGiftBlob(blob);
          }
        }}
      />
    </div>
  );
}
