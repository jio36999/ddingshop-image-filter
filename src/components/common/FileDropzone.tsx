import { useRef, useState } from "react";
import { ImageUp } from "lucide-react";

type FileDropzoneProps = {
  title?: string;
  description: string;
  accept: string;
  multiple?: boolean;
  helperText: string;
  compact?: boolean;
  rectangular?: boolean;
  onFilesSelected: (files: FileList | null) => void;
  selectedFileName?: string;
};

export function FileDropzone({
  title,
  description,
  accept,
  multiple,
  helperText,
  compact = false,
  rectangular = false,
  onFilesSelected,
  selectedFileName,
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div className={`upload-card ${compact ? "panel-card--compact" : ""}`}>
      {title ? <h3>{title}</h3> : null}
      <button
        type="button"
        className={`dropzone ${dragging ? "dropzone--dragging" : ""} ${compact ? "dropzone--compact" : ""} ${rectangular ? "dropzone--rectangular" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          onFilesSelected(event.dataTransfer.files);
        }}
      >
        <ImageUp size={72} strokeWidth={1.5} />
        <strong>{description}</strong>
        <span>{helperText}</span>
        {selectedFileName ? <em>{selectedFileName}</em> : null}
      </button>
      <input
        ref={inputRef}
        hidden
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={(event) => onFilesSelected(event.target.files)}
      />
    </div>
  );
}
