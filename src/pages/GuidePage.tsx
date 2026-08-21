import guideFirstImageSrc from "../assets/guide-01.png";
import guideSecondImageSrc from "../assets/guide-02.png";
import { PageHeader } from "../components/common/PageHeader";

const guideImages = [
  {
    id: "guide-01",
    title: "대표이미지 가이드",
    src: guideFirstImageSrc,
  },
  {
    id: "guide-02",
    title: "대표이미지 등록 권장 및 지양 사항 점검",
    src: guideSecondImageSrc,
  },
];

export function GuidePage() {
  return (
    <div className="page-stack">
      <PageHeader
        title="가이드보기"
        description="필수 가이드 이미지를 위에서 아래로 순서대로 확인할 수 있습니다."
      />

      <div className="guide-image-stack">
        {guideImages.map((image) => (
          <section key={image.id} className="guide-image-card">
            <img src={image.src} alt={image.title} className="guide-image-card__image" />
          </section>
        ))}
      </div>
    </div>
  );
}
