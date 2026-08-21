import { useEffect, useMemo, useRef, useState } from "react";
import { createImageBitmapFromBlob, canvasToBlob } from "../../utils/image";

type BrushMode = "erase" | "restore";

type CutoutEditorProps = {
  sourceBlob: Blob | null;
  restoreSourceBlob?: Blob | null;
  title: string;
  open: boolean;
  onClose: () => void;
  onApply: (blob: Blob) => void;
};

export function CutoutEditor({ sourceBlob, restoreSourceBlob, title, open, onClose, onApply }: CutoutEditorProps) {
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const editCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const initialEditCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const restoreSourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const restoreMaskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const drawFrameRef = useRef<number | null>(null);
  const pendingPointRef = useRef<{ x: number; y: number } | null>(null);
  const [brushMode, setBrushMode] = useState<BrushMode>("erase");
  const [brushSize, setBrushSize] = useState(24);
  const [drawing, setDrawing] = useState(false);

  const helperLabel = useMemo(
    () => (brushMode === "erase" ? "지우기 브러시" : "복원 브러시"),
    [brushMode],
  );

  const renderPreviewCanvas = () => {
    const previewCanvas = previewCanvasRef.current;
    const editCanvas = editCanvasRef.current;
    if (!previewCanvas || !editCanvas) {
      return;
    }

    const context = previewCanvas.getContext("2d");
    if (!context) {
      return;
    }

    context.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    context.drawImage(editCanvas, 0, 0, previewCanvas.width, previewCanvas.height);
  };

  useEffect(() => {
    if (!open || !sourceBlob || !previewCanvasRef.current) {
      return;
    }

    let cancelled = false;

    void (async () => {
      const bitmap = await createImageBitmapFromBlob(sourceBlob);
      const restoreBitmap = await createImageBitmapFromBlob(restoreSourceBlob ?? sourceBlob);
      if (cancelled || !previewCanvasRef.current) {
        return;
      }

      const previewCanvas = previewCanvasRef.current;
      const maxSize = 520;
      const ratio = Math.min(maxSize / bitmap.width, maxSize / bitmap.height, 1);
      previewCanvas.width = Math.round(bitmap.width * ratio);
      previewCanvas.height = Math.round(bitmap.height * ratio);

      const editCanvas = document.createElement("canvas");
      editCanvas.width = bitmap.width;
      editCanvas.height = bitmap.height;
      const editContext = editCanvas.getContext("2d");
      if (!editContext) {
        return;
      }
      editContext.clearRect(0, 0, editCanvas.width, editCanvas.height);
      editContext.drawImage(bitmap, 0, 0, editCanvas.width, editCanvas.height);
      editCanvasRef.current = editCanvas;

      const initialEditCanvas = document.createElement("canvas");
      initialEditCanvas.width = bitmap.width;
      initialEditCanvas.height = bitmap.height;
      const initialContext = initialEditCanvas.getContext("2d");
      if (!initialContext) {
        return;
      }
      initialContext.drawImage(editCanvas, 0, 0);
      initialEditCanvasRef.current = initialEditCanvas;

      const restoreSourceCanvas = document.createElement("canvas");
      restoreSourceCanvas.width = bitmap.width;
      restoreSourceCanvas.height = bitmap.height;
      const restoreSourceContext = restoreSourceCanvas.getContext("2d");
      if (!restoreSourceContext) {
        return;
      }
      restoreSourceContext.drawImage(restoreBitmap, 0, 0, restoreSourceCanvas.width, restoreSourceCanvas.height);
      restoreSourceCanvasRef.current = restoreSourceCanvas;

      const restoreMaskCanvas = document.createElement("canvas");
      restoreMaskCanvas.width = bitmap.width;
      restoreMaskCanvas.height = bitmap.height;
      restoreMaskCanvasRef.current = restoreMaskCanvas;

      renderPreviewCanvas();
    })();

    return () => {
      cancelled = true;
    };
  }, [open, sourceBlob, restoreSourceBlob]);

  const getCanvasPoint = (clientX: number, clientY: number) => {
    const previewCanvas = previewCanvasRef.current;
    const editCanvas = editCanvasRef.current;
    if (!previewCanvas || !editCanvas) {
      return null;
    }

    const rect = previewCanvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * editCanvas.width,
      y: ((clientY - rect.top) / rect.height) * editCanvas.height,
    };
  };

  const paintPoint = (x: number, y: number) => {
    const editCanvas = editCanvasRef.current;
    const restoreSourceCanvas = restoreSourceCanvasRef.current;
    const restoreMaskCanvas = restoreMaskCanvasRef.current;
    if (!editCanvas || !restoreSourceCanvas || !restoreMaskCanvas) {
      return;
    }

    const context = editCanvas.getContext("2d");
    const restoreContext = restoreMaskCanvas.getContext("2d");
    if (!context || !restoreContext) {
      return;
    }

    const radius = brushSize / 2;

    if (brushMode === "erase") {
      context.save();
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.closePath();
      context.globalCompositeOperation = "destination-out";
      context.fill();
      context.restore();
    } else {
      restoreContext.clearRect(0, 0, restoreMaskCanvas.width, restoreMaskCanvas.height);
      restoreContext.save();
      restoreContext.beginPath();
      restoreContext.arc(x, y, radius, 0, Math.PI * 2);
      restoreContext.closePath();
      restoreContext.fillStyle = "#000";
      restoreContext.fill();
      restoreContext.globalCompositeOperation = "source-in";
      restoreContext.drawImage(restoreSourceCanvas, 0, 0);
      restoreContext.restore();
      context.drawImage(restoreMaskCanvas, 0, 0);
    }
  };

  const paintSegment = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const editCanvas = editCanvasRef.current;
    const restoreSourceCanvas = restoreSourceCanvasRef.current;
    const restoreMaskCanvas = restoreMaskCanvasRef.current;
    if (!editCanvas || !restoreSourceCanvas || !restoreMaskCanvas) {
      return;
    }

    const context = editCanvas.getContext("2d");
    const restoreContext = restoreMaskCanvas.getContext("2d");
    if (!context || !restoreContext) {
      return;
    }

    if (brushMode === "erase") {
      context.save();
      context.beginPath();
      context.lineCap = "round";
      context.lineJoin = "round";
      context.lineWidth = brushSize;
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
      context.globalCompositeOperation = "destination-out";
      context.stroke();
      context.restore();
    } else {
      restoreContext.clearRect(0, 0, restoreMaskCanvas.width, restoreMaskCanvas.height);
      restoreContext.save();
      restoreContext.beginPath();
      restoreContext.lineCap = "round";
      restoreContext.lineJoin = "round";
      restoreContext.lineWidth = brushSize;
      restoreContext.moveTo(from.x, from.y);
      restoreContext.lineTo(to.x, to.y);
      restoreContext.strokeStyle = "#000";
      restoreContext.stroke();
      restoreContext.globalCompositeOperation = "source-in";
      restoreContext.drawImage(restoreSourceCanvas, 0, 0);
      restoreContext.restore();
      context.drawImage(restoreMaskCanvas, 0, 0);
    }
  };

  const paintAt = (clientX: number, clientY: number) => {
    const nextPoint = getCanvasPoint(clientX, clientY);
    if (!nextPoint) {
      return;
    }

    const previousPoint = lastPointRef.current;
    if (!previousPoint) {
      paintPoint(nextPoint.x, nextPoint.y);
      lastPointRef.current = nextPoint;
      renderPreviewCanvas();
      return;
    }

    paintSegment(previousPoint, nextPoint);
    lastPointRef.current = nextPoint;
    renderPreviewCanvas();
  };

  const stopDrawing = (pointerId?: number) => {
    const previewCanvas = previewCanvasRef.current;
    if (previewCanvas && pointerId !== undefined && previewCanvas.hasPointerCapture(pointerId)) {
      previewCanvas.releasePointerCapture(pointerId);
    }

    if (drawFrameRef.current !== null) {
      cancelAnimationFrame(drawFrameRef.current);
      drawFrameRef.current = null;
    }

    activePointerIdRef.current = null;
    lastPointRef.current = null;
    pendingPointRef.current = null;
    setDrawing(false);
  };

  const resetEditor = () => {
    const editCanvas = editCanvasRef.current;
    const initialEditCanvas = initialEditCanvasRef.current;
    if (!editCanvas || !initialEditCanvas) {
      return;
    }

    const context = editCanvas.getContext("2d");
    if (!context) {
      return;
    }

    context.clearRect(0, 0, editCanvas.width, editCanvas.height);
    context.drawImage(initialEditCanvas, 0, 0);
    renderPreviewCanvas();
  };

  const applyEditor = async () => {
    if (!editCanvasRef.current || !sourceBlob) {
      return;
    }

    const editedBlob = await canvasToBlob(editCanvasRef.current, "image/png");
    onApply(editedBlob);
    onClose();
  };

  if (!open) {
    return null;
  }

  return (
    <div className="editor-overlay">
      <div className="editor-modal">
        <div className="panel-card__header">
          <h3>{title}</h3>
          <button type="button" className="button button--ghost" onClick={onClose}>
            닫기
          </button>
        </div>
        <div className="editor-toolbar">
          <div className="segmented-control">
            <button
              type="button"
              className={brushMode === "erase" ? "is-active" : ""}
              onClick={() => setBrushMode("erase")}
            >
              지우기
            </button>
            <button
              type="button"
              className={brushMode === "restore" ? "is-active" : ""}
              onClick={() => setBrushMode("restore")}
            >
              복원
            </button>
          </div>
          <label className="slider-field">
            <span>{helperLabel} {brushSize}px</span>
            <input
              type="range"
              min="8"
              max="80"
              value={brushSize}
              onChange={(event) => setBrushSize(Number(event.target.value))}
            />
          </label>
          <button type="button" className="button button--ghost" onClick={resetEditor}>
            초기화
          </button>
        </div>
        <div className="editor-canvas-wrap checkerboard">
          <canvas
            ref={previewCanvasRef}
            className="editor-canvas"
            onPointerDown={(event) => {
              event.preventDefault();
              activePointerIdRef.current = event.pointerId;
              lastPointRef.current = null;
              event.currentTarget.setPointerCapture(event.pointerId);
              setDrawing(true);
              paintAt(event.clientX, event.clientY);
            }}
            onPointerMove={(event) => {
              if (!drawing || activePointerIdRef.current !== event.pointerId) return;
              event.preventDefault();
              pendingPointRef.current = { x: event.clientX, y: event.clientY };
              if (drawFrameRef.current === null) {
                drawFrameRef.current = requestAnimationFrame(() => {
                  drawFrameRef.current = null;
                  const pendingPoint = pendingPointRef.current;
                  if (pendingPoint) {
                    paintAt(pendingPoint.x, pendingPoint.y);
                  }
                });
              }
            }}
            onPointerUp={(event) => stopDrawing(event.pointerId)}
            onPointerCancel={(event) => stopDrawing(event.pointerId)}
          />
        </div>
        <div className="action-row">
          <button type="button" className="button button--outline" onClick={onClose}>
            취소
          </button>
          <button type="button" className="button button--primary" onClick={() => void applyEditor()}>
            적용
          </button>
        </div>
      </div>
    </div>
  );
}
