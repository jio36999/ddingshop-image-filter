type PreviewCardProps = {
  title: string;
  badge?: string;
  imageUrl?: string | null;
  emptyMessage?: string;
  children?: React.ReactNode;
  previewContent?: React.ReactNode;
};

export function PreviewCard({
  title,
  badge,
  imageUrl,
  emptyMessage,
  children,
  previewContent,
}: PreviewCardProps) {
  return (
    <section className="panel-card">
      <div className="panel-card__header">
        <h3>{title}</h3>
        {badge ? <span className="ghost-chip">{badge}</span> : null}
      </div>
      <div className="preview-frame preview-frame--square">
        {previewContent ??
          (imageUrl ? (
            <img src={imageUrl} alt={title} />
          ) : (
            <p className="empty-state">{emptyMessage ?? "결과가 여기에 표시됩니다."}</p>
          ))}
      </div>
      {children}
    </section>
  );
}
