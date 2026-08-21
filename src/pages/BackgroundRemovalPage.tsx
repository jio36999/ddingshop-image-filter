import { useEffect, useState } from "react";
import { ActionButtons } from "../components/common/ActionButtons";
import { FileDropzone } from "../components/common/FileDropzone";
import { InfoBanner } from "../components/common/InfoBanner";
import { PageHeader } from "../components/common/PageHeader";
import { PreviewCard } from "../components/common/PreviewCard";
import { ToggleField } from "../components/common/ToggleField";
import { useToast } from "../components/common/ToastProvider";
import { createWhiteBackgroundPreview, removeImageBackground } from "../services/backgroundRemoval";
import { downloadSingleResult } from "../services/download";
import { exportCanvasBlob } from "../services/imageComposer";
import { CANVAS_SIZE } from "../utils/constants";
import { validateImageFile } from "../utils/file";
import type { RemovalOptions } from "../types/image";

type CutoutPreset = NonNullable<RemovalOptions["preset"]>;

const CUTOUT_EXPERIMENT_DEFAULTS = {
  autoCutout: true,
  edgeRefinement: true,
  preset: "standard" as CutoutPreset,
  edgeFeather: 1,
  maskInset: 0,
  haloSuppression: 58,
  translucencyProtection: 42,
  shadowSuppression: 24,
  removeSmallArtifacts: true,
  removeLogos: true,
  logoRemovalStrength: 44,
  plateRecoveryStrength: 52,
  shadowPreview: true,
  shadowStrength: 35,
};

export function BackgroundRemovalPage() {
  const { showToast } = useToast();
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [whiteBlob, setWhiteBlob] = useState<Blob | null>(null);
  const [whiteUrl, setWhiteUrl] = useState<string | null>(null);
  const [autoCutout, setAutoCutout] = useState(CUTOUT_EXPERIMENT_DEFAULTS.autoCutout);
  const [edgeRefinement, setEdgeRefinement] = useState(CUTOUT_EXPERIMENT_DEFAULTS.edgeRefinement);
  const [cutoutPreset, setCutoutPreset] = useState<CutoutPreset>(CUTOUT_EXPERIMENT_DEFAULTS.preset);
  const [edgeFeather, setEdgeFeather] = useState(CUTOUT_EXPERIMENT_DEFAULTS.edgeFeather);
  const [maskInset, setMaskInset] = useState(CUTOUT_EXPERIMENT_DEFAULTS.maskInset);
  const [haloSuppression, setHaloSuppression] = useState(CUTOUT_EXPERIMENT_DEFAULTS.haloSuppression);
  const [translucencyProtection, setTranslucencyProtection] = useState(CUTOUT_EXPERIMENT_DEFAULTS.translucencyProtection);
  const [shadowSuppression, setShadowSuppression] = useState(CUTOUT_EXPERIMENT_DEFAULTS.shadowSuppression);
  const [removeSmallArtifacts, setRemoveSmallArtifacts] = useState(CUTOUT_EXPERIMENT_DEFAULTS.removeSmallArtifacts);
  const [removeLogos, setRemoveLogos] = useState(CUTOUT_EXPERIMENT_DEFAULTS.removeLogos);
  const [logoRemovalStrength, setLogoRemovalStrength] = useState(CUTOUT_EXPERIMENT_DEFAULTS.logoRemovalStrength);
  const [plateRecoveryStrength, setPlateRecoveryStrength] = useState(CUTOUT_EXPERIMENT_DEFAULTS.plateRecoveryStrength);
  const [shadowPreview, setShadowPreview] = useState(CUTOUT_EXPERIMENT_DEFAULTS.shadowPreview);
  const [shadowStrength, setShadowStrength] = useState(CUTOUT_EXPERIMENT_DEFAULTS.shadowStrength);
  const [whitePreviewMode, setWhitePreviewMode] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [processingError, setProcessingError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      [sourceUrl, resultUrl, whiteUrl].forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
    };
  }, [sourceUrl, resultUrl, whiteUrl]);

  const clearResult = () => {
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    if (whiteUrl) URL.revokeObjectURL(whiteUrl);
    setResultBlob(null);
    setResultUrl(null);
    setWhiteBlob(null);
    setWhiteUrl(null);
    setProcessingError(null);
  };

  const processFile = async () => {
    if (!sourceFile) {
      showToast("먼저 이미지를 업로드해 주세요.", "info");
      return;
    }

    setProcessing(true);
    setProcessingError(null);
    try {
      const cutoutBlob = autoCutout
        ? await removeImageBackground(sourceFile, {
            edgeRefinement,
            experimentalLab: true,
            preset: cutoutPreset,
            edgeFeather,
            maskInset,
            haloSuppression: haloSuppression / 100,
            translucencyProtection: translucencyProtection / 100,
            shadowSuppression: shadowSuppression / 100,
            removeSmallArtifacts,
            removeLogos,
            logoRemovalStrength,
            plateRecoveryStrength,
          })
        : sourceFile;
      const whitePreview = await createWhiteBackgroundPreview(cutoutBlob);
      const cutoutObjectUrl = URL.createObjectURL(cutoutBlob);
      const whiteObjectUrl = URL.createObjectURL(whitePreview);

      if (resultUrl) URL.revokeObjectURL(resultUrl);
      if (whiteUrl) URL.revokeObjectURL(whiteUrl);

      setResultBlob(cutoutBlob);
      setResultUrl(cutoutObjectUrl);
      setWhiteBlob(whitePreview);
      setWhiteUrl(whiteObjectUrl);
    } catch (error) {
      console.error(error);
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      if (whiteUrl) URL.revokeObjectURL(whiteUrl);
      setResultBlob(null);
      setResultUrl(null);
      setWhiteBlob(null);
      setWhiteUrl(null);
      setProcessingError(error instanceof Error ? error.message : "자동 누끼 처리에 실패했습니다.");
    } finally {
      setProcessing(false);
    }
  };

  const handleUpload = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;

    const validation = validateImageFile(file);
    if (validation) {
      showToast(validation, "error");
      return;
    }

    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    setSourceFile(file);
    setSourceUrl(URL.createObjectURL(file));
    clearResult();
  };

  const downloadPng = async () => {
    if (!resultBlob || !sourceFile) return;
    await downloadSingleResult(resultBlob, sourceFile.name, "png");
  };

  const downloadJpg = async () => {
    if (!whiteBlob || !sourceFile) return;
    const exported = await exportCanvasBlob(whiteBlob, "jpg");
    await downloadSingleResult(exported, sourceFile.name, "jpg");
  };

  return (
    <div className="page-stack">
      <PageHeader
        title="누끼컷 생성"
        description="원본 이미지에서 배경을 제거한 투명 PNG 또는 흰 배경 JPG를 직접 생성할 수 있습니다."
      />

      <div className="representative-layout">
        <div className="representative-layout__side">
          <div className="representative-layout__upload">
            <section className="panel-card">
              {sourceUrl ? (
                <div className="upload-card">
                  <h3>원본 이미지 업로드</h3>
                  <div className="preview-frame preview-frame--square">
                    <img src={sourceUrl} alt="업로드한 원본 이미지" />
                  </div>
                  <div className="action-row">
                    <label className="button button--outline button--full">
                      이미지 다시 선택
                      <input hidden type="file" accept=".jpg,.jpeg,.png,.webp" onChange={(event) => handleUpload(event.target.files)} />
                    </label>
                  </div>
                  <div className="action-row">
                    <button type="button" className="button button--primary button--full" disabled={!sourceFile || processing} onClick={() => void processFile()}>
                      {processing ? "생성 중..." : "누끼컷 생성"}
                    </button>
                  </div>
                </div>
              ) : (
                <FileDropzone
                  title="원본 이미지 업로드"
                  description="이미지를 드래그하거나 클릭해서 업로드해 주세요"
                  helperText="지원 형식: JPG, PNG, WEBP (최대 20MB)"
                  accept=".jpg,.jpeg,.png,.webp"
                  rectangular
                  onFilesSelected={handleUpload}
                  selectedFileName={sourceFile?.name}
                />
              )}
            </section>
          </div>

          <section className="panel-card">
            <div className="panel-card__header">
              <h3>누끼 설정</h3>
              <button
                type="button"
                className="button button--ghost"
                onClick={() => {
                  setAutoCutout(CUTOUT_EXPERIMENT_DEFAULTS.autoCutout);
                  setEdgeRefinement(CUTOUT_EXPERIMENT_DEFAULTS.edgeRefinement);
                  setCutoutPreset(CUTOUT_EXPERIMENT_DEFAULTS.preset);
                  setEdgeFeather(CUTOUT_EXPERIMENT_DEFAULTS.edgeFeather);
                  setMaskInset(CUTOUT_EXPERIMENT_DEFAULTS.maskInset);
                  setHaloSuppression(CUTOUT_EXPERIMENT_DEFAULTS.haloSuppression);
                  setTranslucencyProtection(CUTOUT_EXPERIMENT_DEFAULTS.translucencyProtection);
                  setShadowSuppression(CUTOUT_EXPERIMENT_DEFAULTS.shadowSuppression);
                  setRemoveSmallArtifacts(CUTOUT_EXPERIMENT_DEFAULTS.removeSmallArtifacts);
                  setRemoveLogos(CUTOUT_EXPERIMENT_DEFAULTS.removeLogos);
                  setLogoRemovalStrength(CUTOUT_EXPERIMENT_DEFAULTS.logoRemovalStrength);
                  setPlateRecoveryStrength(CUTOUT_EXPERIMENT_DEFAULTS.plateRecoveryStrength);
                  setShadowPreview(CUTOUT_EXPERIMENT_DEFAULTS.shadowPreview);
                  setShadowStrength(CUTOUT_EXPERIMENT_DEFAULTS.shadowStrength);
                }}
              >
                초기화
              </button>
            </div>
            <div className="cutout-settings">
              <ToggleField label="자동 누끼" checked={autoCutout} onChange={setAutoCutout} />
              <ToggleField label="가장자리 보정" checked={edgeRefinement} onChange={setEdgeRefinement} />
              <ToggleField label="작은 노이즈 제거" checked={removeSmallArtifacts} onChange={setRemoveSmallArtifacts} />
              <ToggleField label="로고/주변소품 제거" checked={removeLogos} onChange={setRemoveLogos} />
              <ToggleField label="그림자 미리보기" checked={shadowPreview} onChange={setShadowPreview} />
              <label className="select-field">
                <span>상품 프리셋</span>
                <select value={cutoutPreset} onChange={(event) => setCutoutPreset(event.target.value as CutoutPreset)}>
                  <option value="standard">기본 상품</option>
                  <option value="food">접시/받침 포함형</option>
                  <option value="tray">박스/용기 강화형</option>
                  <option value="bottle">병음료/반투명</option>
                  <option value="package">패키지/라벨형</option>
                  <option value="multi">다중 구성상품</option>
                </select>
              </label>
              <label className="slider-field">
                <span>경계 feather {edgeFeather}px</span>
                <input type="range" min="0" max="4" value={edgeFeather} onChange={(event) => setEdgeFeather(Number(event.target.value))} />
              </label>
              <label className="slider-field">
                <span>마스크 조임 {maskInset}px</span>
                <input type="range" min="-2" max="4" value={maskInset} onChange={(event) => setMaskInset(Number(event.target.value))} />
              </label>
              <label className="slider-field">
                <span>halo 제거 {haloSuppression}%</span>
                <input type="range" min="0" max="100" value={haloSuppression} onChange={(event) => setHaloSuppression(Number(event.target.value))} />
              </label>
              <label className="slider-field">
                <span>반투명 보존 {translucencyProtection}%</span>
                <input type="range" min="0" max="100" value={translucencyProtection} onChange={(event) => setTranslucencyProtection(Number(event.target.value))} />
              </label>
              <label className="slider-field">
                <span>바닥 잔상 억제 {shadowSuppression}%</span>
                <input type="range" min="0" max="100" value={shadowSuppression} onChange={(event) => setShadowSuppression(Number(event.target.value))} />
              </label>
              <label className="slider-field">
                <span>실험: 로고 제거 강도 {logoRemovalStrength}%</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={logoRemovalStrength}
                  onChange={(event) => setLogoRemovalStrength(Number(event.target.value))}
                />
              </label>
              <label className="slider-field">
                <span>실험: 접시/용기 복원 강도 {plateRecoveryStrength}%</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={plateRecoveryStrength}
                  onChange={(event) => setPlateRecoveryStrength(Number(event.target.value))}
                />
              </label>
              <label className="slider-field">
                <span>강도 {shadowStrength}%</span>
                <input type="range" min="0" max="100" value={shadowStrength} onChange={(event) => setShadowStrength(Number(event.target.value))} />
              </label>
            </div>
          </section>

          <InfoBanner message="이 페이지는 누끼 실험용이며, 지금 기본값은 얇은 외곽 까짐을 줄이고 로고 제거와 접시 복원을 균형 있게 맞춘 세팅으로 잡아두었습니다." />
        </div>

        <div className="representative-layout__preview">
          <PreviewCard
            title="누끼컷 결과"
            badge={`${CANVAS_SIZE} x ${CANVAS_SIZE}`}
            previewContent={
              processingError ? (
                <div className="preview-error">
                  <strong>자동 누끼 처리에 실패했습니다.</strong>
                  <p>{processingError}</p>
                </div>
              ) : (
                <div className={`interactive-preview interactive-preview--static ${!whitePreviewMode ? "checkerboard" : ""}`}>
                  {resultUrl || whiteUrl ? (
                    <img
                      src={whitePreviewMode ? whiteUrl ?? undefined : resultUrl ?? undefined}
                      alt="누끼컷 결과"
                      className="interactive-preview__layer interactive-preview__layer--centered"
                      style={
                        shadowPreview
                          ? {
                              filter: `drop-shadow(0 ${Math.max(10, shadowStrength / 2)}px ${14 + shadowStrength / 2}px rgba(20, 33, 58, ${
                                0.08 + shadowStrength / 220
                              }))`,
                            }
                          : undefined
                      }
                    />
                  ) : null}
                  <div className="layout-guide layout-guide--main layout-guide--canvas">
                    <span className="layout-guide__label">실제 출력 영역 {CANVAS_SIZE} x {CANVAS_SIZE}</span>
                  </div>
                  {!resultUrl && !whiteUrl ? (
                    <div className="preview-placeholder">{processing ? "누끼 이미지를 생성하고 있습니다." : `정방형 출력 기준 ${CANVAS_SIZE} x ${CANVAS_SIZE}`}</div>
                  ) : null}
                </div>
              )
            }
          >
            <div className="action-row">
              <div className="segmented-control">
                <button type="button" className={!whitePreviewMode ? "is-active" : ""} onClick={() => setWhitePreviewMode(false)}>
                  투명 배경
                </button>
                <button type="button" className={whitePreviewMode ? "is-active" : ""} onClick={() => setWhitePreviewMode(true)}>
                  흰 배경
                </button>
              </div>
            </div>
            <ActionButtons
              onPng={() => void downloadPng()}
              onJpg={() => void downloadJpg()}
              disablePng={!resultBlob || processing}
              disableJpg={!whiteBlob || processing}
              pngLabel="PNG 다운로드"
              jpgLabel="JPG 다운로드"
            />
          </PreviewCard>
        </div>
      </div>
    </div>
  );
}
