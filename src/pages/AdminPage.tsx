import { useEffect, useRef, useState } from "react";
import { useToast } from "../components/common/ToastProvider";
import { PageHeader } from "../components/common/PageHeader";
import { InfoBanner } from "../components/common/InfoBanner";
import { ToggleField } from "../components/common/ToggleField";
import {
  deleteGuideFile,
  loadCutoutSettings,
  getGuideFiles,
  loadGiftSettings,
  loadRepresentativeSettings,
  replaceGuideFile,
  saveCutoutSettings,
  saveGiftSettings,
  saveGuideFile,
  saveRepresentativeSettings,
} from "../services/storageService";
import { ACCEPTED_GUIDE_TYPES } from "../utils/constants";
import { formatDate } from "../utils/format";
import type { CutoutSettings, GiftSettings, GuideFileRecord, RepresentativeSettings } from "../types/app";

const ADMIN_ID = "jeonginwoo";
const ADMIN_PASSWORD = "dlsn123";

export function AdminPage() {
  const { showToast } = useToast();
  const [loginId, setLoginId] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [representativeSettings, setRepresentativeSettings] = useState<RepresentativeSettings>(() =>
    loadRepresentativeSettings(),
  );
  const [giftSettings, setGiftSettings] = useState<GiftSettings>(() => loadGiftSettings());
  const [cutoutSettings, setCutoutSettings] = useState<CutoutSettings>(() => loadCutoutSettings());
  const [guideFiles, setGuideFiles] = useState<GuideFileRecord[]>([]);
  const replaceTargetId = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void getGuideFiles().then(setGuideFiles);
  }, []);

  const refreshGuideFiles = async () => {
    const files = await getGuideFiles();
    setGuideFiles(files);
  };

  const handleSaveRepresentative = () => {
    saveRepresentativeSettings(representativeSettings);
    showToast("대표이미지 생성 설정을 저장했습니다.", "success");
  };

  const handleSaveGift = () => {
    saveGiftSettings(giftSettings);
    showToast("사은품 이미지 생성 설정을 저장했습니다.", "success");
  };

  const handleSaveCutout = () => {
    saveCutoutSettings(cutoutSettings);
    showToast("공통 누끼 품질 설정을 저장했습니다.", "success");
  };

  const handleGuideUpload = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (!ACCEPTED_GUIDE_TYPES.includes(file.type)) {
      showToast("PDF, 이미지, DOCX 파일만 업로드할 수 있습니다.", "error");
      return;
    }

    if (replaceTargetId.current) {
      await replaceGuideFile(replaceTargetId.current, file);
      replaceTargetId.current = null;
      showToast("가이드 파일을 교체했습니다.", "success");
    } else {
      await saveGuideFile(file);
      showToast("가이드 파일을 업로드했습니다.", "success");
    }

    await refreshGuideFiles();
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const handleDeleteGuide = async (id: string) => {
    await deleteGuideFile(id);
    await refreshGuideFiles();
    showToast("가이드 파일을 삭제했습니다.", "success");
  };

  const handleLogin = () => {
    if (loginId === ADMIN_ID && loginPassword === ADMIN_PASSWORD) {
      setIsLoggedIn(true);
      setLoginPassword("");
      showToast("관리자 로그인에 성공했습니다.", "success");
      return;
    }

    showToast("아이디 또는 비밀번호가 올바르지 않습니다.", "error");
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setLoginId("");
    setLoginPassword("");
    showToast("로그아웃되었습니다.", "info");
  };

  return (
    <div className="page-stack">
      <PageHeader
        title="관리자 페이지"
        description="관리자는 생성 기능과 가이드 파일을 간단하게 관리할 수 있습니다."
      />

      {!isLoggedIn ? (
        <section className="panel-card admin-login-card">
          <div className="panel-card__header panel-card__header--stack">
            <h3>관리자 로그인</h3>
            <p>관리 기능을 사용하려면 로그인해 주세요.</p>
          </div>
          <div className="form-stack">
            <label className="text-field">
              <span>아이디</span>
              <input
                type="text"
                value={loginId}
                onChange={(event) => setLoginId(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    handleLogin();
                  }
                }}
              />
            </label>
            <label className="text-field">
              <span>비밀번호</span>
              <input
                type="password"
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    handleLogin();
                  }
                }}
              />
            </label>
            <button type="button" className="button button--primary button--full" onClick={handleLogin}>
              로그인
            </button>
          </div>
        </section>
      ) : (
        <>
          <div className="admin-toolbar">
            <p className="storage-notice">현재 관리자 설정은 이 브라우저에 저장됩니다.</p>
            <button type="button" className="button button--outline" onClick={handleLogout}>
              로그아웃
            </button>
          </div>

          <div className="grid-three">
            <section className="panel-card">
              <h3>대표이미지 생성관리</h3>
              <p>대표이미지 생성 기능의 기본 설정을 관리합니다.</p>
              <div className="form-stack">
                <label className="select-field">
                  <span>기본 배경</span>
                  <select value="고정 흰색 배경" disabled>
                    <option>고정 흰색 배경</option>
                  </select>
                </label>
                <label className="select-field">
                  <span>기본 출력 형식</span>
                  <select
                    value={representativeSettings.defaultFormat}
                    onChange={(event) =>
                      setRepresentativeSettings((current) => ({
                        ...current,
                        defaultFormat: event.target.value as RepresentativeSettings["defaultFormat"],
                      }))
                    }
                  >
                    <option>PNG/JPG</option>
                    <option>PNG</option>
                    <option>JPG</option>
                  </select>
                </label>
                <label className="select-field">
                  <span>기본 해상도</span>
                  <select
                    value={representativeSettings.resolution}
                    onChange={(event) =>
                      setRepresentativeSettings((current) => ({
                        ...current,
                        resolution: Number(event.target.value),
                      }))
                    }
                  >
                    <option value={1100}>1100 x 1100</option>
                  </select>
                </label>
                <ToggleField
                  label="자동 누끼 기본값"
                  checked={representativeSettings.autoCutout}
                  onChange={(checked) =>
                    setRepresentativeSettings((current) => ({ ...current, autoCutout: checked }))
                  }
                />
                <ToggleField
                  label="그림자 적용 기본값"
                  checked={representativeSettings.shadow}
                  onChange={(checked) => setRepresentativeSettings((current) => ({ ...current, shadow: checked }))}
                />
                <button type="button" className="button button--outline button--full" onClick={handleSaveRepresentative}>
                  설정 저장
                </button>
              </div>
            </section>

            <section className="panel-card">
              <h3>사은품 이미지 생성관리</h3>
              <p>사은품 이미지 생성 기능의 기본 설정을 관리합니다.</p>
              <div className="form-stack">
                <ToggleField
                  label="본품 이미지 자동 누끼 기본값"
                  checked={giftSettings.autoCutoutMain}
                  onChange={(checked) => setGiftSettings((current) => ({ ...current, autoCutoutMain: checked }))}
                />
                <ToggleField
                  label="사은품 이미지 자동 누끼 기본값"
                  checked={giftSettings.autoCutoutGift}
                  onChange={(checked) => setGiftSettings((current) => ({ ...current, autoCutoutGift: checked }))}
                />
                <ToggleField
                  label="고정 흰색 배경 사용"
                  checked={giftSettings.fixedWhiteBackground}
                  onChange={(checked) => setGiftSettings((current) => ({ ...current, fixedWhiteBackground: checked }))}
                />
                <label className="select-field">
                  <span>기본 결과 형식</span>
                  <select
                    value={giftSettings.defaultFormat}
                    onChange={(event) =>
                      setGiftSettings((current) => ({
                        ...current,
                        defaultFormat: event.target.value as GiftSettings["defaultFormat"],
                      }))
                    }
                  >
                    <option>PNG</option>
                    <option>JPG</option>
                  </select>
                </label>
                <button type="button" className="button button--outline button--full" onClick={handleSaveGift}>
                  설정 저장
                </button>
              </div>
            </section>

            <section className="panel-card">
              <h3>공통 누끼 품질관리</h3>
              <p>대표/사은품/일괄/누끼컷 생성에 공통으로 쓰는 누끼 품질 기본값입니다.</p>
              <div className="form-stack">
                <label className="select-field">
                  <span>상품 프리셋</span>
                  <select
                    value={cutoutSettings.preset}
                    onChange={(event) =>
                      setCutoutSettings((current) => ({
                        ...current,
                        preset: event.target.value as CutoutSettings["preset"],
                      }))
                    }
                  >
                    <option value="standard">기본 상품</option>
                    <option value="food">접시/받침 포함형</option>
                    <option value="tray">박스/용기 강화형</option>
                    <option value="bottle">병음료/반투명</option>
                    <option value="package">패키지/라벨형</option>
                    <option value="multi">다중 구성상품</option>
                  </select>
                </label>
                <ToggleField
                  label="가장자리 보정 사용"
                  checked={cutoutSettings.edgeRefinement}
                  onChange={(checked) => setCutoutSettings((current) => ({ ...current, edgeRefinement: checked }))}
                />
                <ToggleField
                  label="작은 노이즈 제거"
                  checked={cutoutSettings.removeSmallArtifacts}
                  onChange={(checked) => setCutoutSettings((current) => ({ ...current, removeSmallArtifacts: checked }))}
                />
                <ToggleField
                  label="로고/주변소품 제거"
                  checked={cutoutSettings.removeLogos}
                  onChange={(checked) => setCutoutSettings((current) => ({ ...current, removeLogos: checked }))}
                />
                <label className="slider-field">
                  <span>경계 feather {cutoutSettings.edgeFeather}px</span>
                  <input
                    type="range"
                    min="0"
                    max="4"
                    value={cutoutSettings.edgeFeather}
                    onChange={(event) =>
                      setCutoutSettings((current) => ({ ...current, edgeFeather: Number(event.target.value) }))
                    }
                  />
                </label>
                <label className="slider-field">
                  <span>마스크 조임 {cutoutSettings.maskInset}px</span>
                  <input
                    type="range"
                    min="-2"
                    max="4"
                    value={cutoutSettings.maskInset}
                    onChange={(event) =>
                      setCutoutSettings((current) => ({ ...current, maskInset: Number(event.target.value) }))
                    }
                  />
                </label>
                <label className="slider-field">
                  <span>halo 제거 {cutoutSettings.haloSuppression}%</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={cutoutSettings.haloSuppression}
                    onChange={(event) =>
                      setCutoutSettings((current) => ({ ...current, haloSuppression: Number(event.target.value) }))
                    }
                  />
                </label>
                <label className="slider-field">
                  <span>반투명 보존 {cutoutSettings.translucencyProtection}%</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={cutoutSettings.translucencyProtection}
                    onChange={(event) =>
                      setCutoutSettings((current) => ({ ...current, translucencyProtection: Number(event.target.value) }))
                    }
                  />
                </label>
                <label className="slider-field">
                  <span>바닥 잔상 억제 {cutoutSettings.shadowSuppression}%</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={cutoutSettings.shadowSuppression}
                    onChange={(event) =>
                      setCutoutSettings((current) => ({ ...current, shadowSuppression: Number(event.target.value) }))
                    }
                  />
                </label>
                <button type="button" className="button button--outline button--full" onClick={handleSaveCutout}>
                  설정 저장
                </button>
              </div>
            </section>

            <section className="panel-card">
              <div className="panel-card__header">
                <div>
                  <h3>가이드 파일 수정</h3>
                  <p>서비스 내 가이드 파일을 업로드하고 관리합니다.</p>
                </div>
                <button
                  type="button"
                  className="button button--outline"
                  onClick={() => {
                    replaceTargetId.current = null;
                    inputRef.current?.click();
                  }}
                >
                  업로드
                </button>
              </div>

              <div className="guide-file-admin-list">
                {guideFiles.map((file) => (
                  <div key={file.id} className="guide-admin-row">
                    <div>
                      <strong>{file.name}</strong>
                      <span>{formatDate(file.updatedAt)}</span>
                    </div>
                    <div className="guide-admin-row__actions">
                      <button
                        type="button"
                        className="button button--ghost"
                        onClick={() => {
                          replaceTargetId.current = file.id;
                          inputRef.current?.click();
                        }}
                      >
                        교체
                      </button>
                      <button
                        type="button"
                        className="button button--ghost button--danger"
                        onClick={() => void handleDeleteGuide(file.id)}
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                ))}
                {!guideFiles.length ? <p className="empty-state">등록된 가이드 파일이 없습니다.</p> : null}
              </div>
              <small>지원 형식: PDF, 이미지, DOCX (최대 20MB)</small>
              <input
                ref={inputRef}
                hidden
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp,.docx"
                onChange={(event) => void handleGuideUpload(event.target.files)}
              />
            </section>
          </div>

          <InfoBanner message="설정 변경 사항은 저장 즉시 이 브라우저의 서비스에 적용됩니다." />
        </>
      )}
    </div>
  );
}
