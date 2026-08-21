type InfoBannerProps = {
  message: string;
};

export function InfoBanner({ message }: InfoBannerProps) {
  return (
    <div className="info-banner">
      <div className="info-banner__icon">i</div>
      <p>{message}</p>
    </div>
  );
}
