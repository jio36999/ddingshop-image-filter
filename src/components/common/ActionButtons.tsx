type ActionButtonsProps = {
  onJpg?: () => void;
  onPng?: () => void;
  disableJpg?: boolean;
  disablePng?: boolean;
  jpgLabel?: string;
  pngLabel?: string;
};

export function ActionButtons({
  onJpg,
  onPng,
  disableJpg,
  disablePng,
  jpgLabel = "JPG 다운로드",
  pngLabel = "PNG 저장",
}: ActionButtonsProps) {
  return (
    <div className="action-row">
      <button type="button" className="button button--outline" onClick={onJpg} disabled={disableJpg}>
        {jpgLabel}
      </button>
      <button type="button" className="button button--primary" onClick={onPng} disabled={disablePng}>
        {pngLabel}
      </button>
    </div>
  );
}
