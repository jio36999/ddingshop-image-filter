import { CANVAS_SIZE } from "../utils/constants";
import {
  calculateContainSize,
  canvasToBlob,
  createCanvas,
  cropAlphaBounds,
  imageDataToCanvas,
  loadImageBitmap,
} from "../utils/image";
import type { ComposeOptions, GiftComposeOptions, OutputImagePayload } from "../types/image";
import { getImageDataFromBlob } from "./backgroundRemoval";
import type { ObjectOffset } from "../types/app";
import representativeTemplateSrc from "../assets/대표이미지.png";
import giftGuideTemplateSrc from "../assets/대표이미지_사은품만.png";

export type LayoutRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PercentRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type GiftFramePreviewLayout = {
  baseRect: PercentRect;
  overlayRect: PercentRect;
  clipRect: PercentRect;
  imageRect: PercentRect;
  clipRadiusPercent: number;
};

type RenderedBlobCanvas = {
  sourceCanvas: HTMLCanvasElement;
  bounds: LayoutRect;
  width: number;
  height: number;
};

export const GIFT_TEMPLATE_SRC = giftGuideTemplateSrc;

export const GIFT_FRAME_METRICS = {
  // The full visible guide patch containing the frame, white area, and plus icon.
  overlayBox: {
    x: 664,
    y: 703,
    width: 337,
    height: 309,
  },
  // The blue bordered square in the original guide.
  frameBox: {
    x: 692,
    y: 703,
    width: 309,
    height: 309,
  },
  // The actual white box visible in the guide and used for preview/export alignment.
  whiteBox: {
    x: 700,
    y: 711,
    width: 293,
    height: 293,
  },
  // The single source of truth for gift-image contain layout.
  imageLayoutBox: {
    x: 700,
    y: 711,
    width: 293,
    height: 293,
  },
  // The single source of truth for clipping the gift image.
  clipBox: {
    x: 700,
    y: 711,
    width: 293,
    height: 293,
  },
  radii: {
    frame: 11,
    white: 11,
  },
  plusCircle: {
    x: 696,
    y: 855,
    radius: 32,
  },
};

export const GIFT_FRAME_BOX = GIFT_FRAME_METRICS.frameBox;
export const GIFT_PLUS_CIRCLE = GIFT_FRAME_METRICS.plusCircle;
export const GIFT_SAFE_BOX = GIFT_FRAME_METRICS.clipBox;

const renderedBlobCache = new WeakMap<Blob, Promise<RenderedBlobCanvas>>();
let giftFrameBasePromise: Promise<HTMLCanvasElement> | null = null;
let giftFrameOverlayPromise: Promise<HTMLCanvasElement> | null = null;
let giftFrameBaseUrlPromise: Promise<string> | null = null;
let giftFrameOverlayUrlPromise: Promise<string> | null = null;

async function renderBlobToCanvas(blob: Blob) {
  const cached = renderedBlobCache.get(blob);
  if (cached) {
    return cached;
  }

  const renderPromise = (async () => {
    const imageData = await getImageDataFromBlob(blob);
    const bounds = cropAlphaBounds(imageData);
    const sourceCanvas = imageDataToCanvas(imageData);
    return { sourceCanvas, bounds, width: sourceCanvas.width, height: sourceCanvas.height };
  })();

  renderedBlobCache.set(blob, renderPromise);
  return renderPromise;
}

function getRepresentativeDrawRect(
  frame: { width: number; height: number },
  options: ComposeOptions = {},
): LayoutRect {
  if (options.fullBleed) {
    const scale = Math.max(CANVAS_SIZE / frame.width, CANVAS_SIZE / frame.height) * (options.objectScale ?? 1);
    const width = frame.width * scale;
    const height = frame.height * scale;

    return {
      x: (CANVAS_SIZE - width) / 2 + (options.objectOffset?.x ?? 0),
      y: (CANVAS_SIZE - height) / 2 + (options.objectOffset?.y ?? 0),
      width,
      height,
    };
  }

  const targetRatio = options.targetBoxRatio ?? 0.72;
  const placement = calculateContainSize(
    frame.width,
    frame.height,
    CANVAS_SIZE * targetRatio,
    CANVAS_SIZE * targetRatio,
  );

  const objectScale = options.objectScale ?? 1;
  const width = placement.width * objectScale;
  const height = placement.height * objectScale;

  return {
    x: (CANVAS_SIZE - width) / 2 + (options.objectOffset?.x ?? 0),
    y: (CANVAS_SIZE - height) / 2 + (options.objectOffset?.y ?? 0),
    width,
    height,
  };
}

async function drawTemplateBackground(
  context: CanvasRenderingContext2D,
  backgroundImageSrc: string | undefined,
  fallbackColor: string,
) {
  if (!backgroundImageSrc) {
    context.fillStyle = fallbackColor;
    context.fillRect(0, 0, context.canvas.width, context.canvas.height);
    return;
  }

  const response = await fetch(backgroundImageSrc);
  const templateBlob = await response.blob();
  const templateBitmap = await loadImageBitmap(templateBlob);
  context.drawImage(templateBitmap, 0, 0, context.canvas.width, context.canvas.height);
}

function drawRoundedRectPath(context: CanvasRenderingContext2D, rect: LayoutRect, radius: number) {
  context.beginPath();
  context.roundRect(rect.x, rect.y, rect.width, rect.height, radius);
}

export function toPercentRect(layout: LayoutRect): PercentRect {
  return {
    left: (layout.x / CANVAS_SIZE) * 100,
    top: (layout.y / CANVAS_SIZE) * 100,
    width: (layout.width / CANVAS_SIZE) * 100,
    height: (layout.height / CANVAS_SIZE) * 100,
  };
}

export function scaleRectFromAnchor(baseRect: LayoutRect, scalePercent: number, anchor: LayoutRect): LayoutRect {
  const scale = scalePercent / 100;
  const width = baseRect.width * scale;
  const height = baseRect.height * scale;

  return {
    x: anchor.x + (anchor.width - width) / 2,
    y: anchor.y + (anchor.height - height) / 2,
    width,
    height,
  };
}

export function getGiftFramePreviewLayout(baseGiftRect: LayoutRect, giftScalePercent: number, giftOffset: ObjectOffset): GiftFramePreviewLayout {
  const scaledGiftRect = scaleRectFromAnchor(baseGiftRect, giftScalePercent, GIFT_FRAME_METRICS.imageLayoutBox);
  const clipRect = toPercentRect(GIFT_FRAME_METRICS.clipBox);
  const overlayRect = toPercentRect(GIFT_FRAME_METRICS.overlayBox);

  return {
    baseRect: overlayRect,
    overlayRect,
    clipRect,
    imageRect: {
      left:
        ((scaledGiftRect.x + giftOffset.x - GIFT_FRAME_METRICS.clipBox.x) / GIFT_FRAME_METRICS.clipBox.width) * 100,
      top:
        ((scaledGiftRect.y + giftOffset.y - GIFT_FRAME_METRICS.clipBox.y) / GIFT_FRAME_METRICS.clipBox.height) * 100,
      width: (scaledGiftRect.width / GIFT_FRAME_METRICS.clipBox.width) * 100,
      height: (scaledGiftRect.height / GIFT_FRAME_METRICS.clipBox.height) * 100,
    },
    clipRadiusPercent: (GIFT_FRAME_METRICS.radii.white / CANVAS_SIZE) * 100,
  };
}

async function getGiftFrameOverlayCanvas() {
  if (giftFrameOverlayPromise) {
    return giftFrameOverlayPromise;
  }

  giftFrameOverlayPromise = (async () => {
    const response = await fetch(GIFT_TEMPLATE_SRC);
    const templateBlob = await response.blob();
    const templateBitmap = await loadImageBitmap(templateBlob);
    const canvas = createCanvas({
      width: GIFT_FRAME_METRICS.overlayBox.width,
      height: GIFT_FRAME_METRICS.overlayBox.height,
    });
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("사은품 프레임 오버레이를 생성할 수 없습니다.");
    }

    context.drawImage(
      templateBitmap,
      GIFT_FRAME_METRICS.overlayBox.x,
      GIFT_FRAME_METRICS.overlayBox.y,
      GIFT_FRAME_METRICS.overlayBox.width,
      GIFT_FRAME_METRICS.overlayBox.height,
      0,
      0,
      GIFT_FRAME_METRICS.overlayBox.width,
      GIFT_FRAME_METRICS.overlayBox.height,
    );

    context.save();
    context.globalCompositeOperation = "destination-out";
    drawRoundedRectPath(
      context,
      {
        x: GIFT_FRAME_METRICS.whiteBox.x - GIFT_FRAME_METRICS.overlayBox.x,
        y: GIFT_FRAME_METRICS.whiteBox.y - GIFT_FRAME_METRICS.overlayBox.y,
        width: GIFT_FRAME_METRICS.whiteBox.width,
        height: GIFT_FRAME_METRICS.whiteBox.height,
      },
      GIFT_FRAME_METRICS.radii.white,
    );
    context.fill();
    context.restore();

    // The plus circle overlaps the white box, so redraw that area from the guide
    // after clearing the inner box to keep the circle above the gift image.
    const plusDiameter = GIFT_FRAME_METRICS.plusCircle.radius * 2;
    context.drawImage(
      templateBitmap,
      GIFT_FRAME_METRICS.plusCircle.x - GIFT_FRAME_METRICS.plusCircle.radius,
      GIFT_FRAME_METRICS.plusCircle.y - GIFT_FRAME_METRICS.plusCircle.radius,
      plusDiameter,
      plusDiameter,
      GIFT_FRAME_METRICS.plusCircle.x -
        GIFT_FRAME_METRICS.plusCircle.radius -
        GIFT_FRAME_METRICS.overlayBox.x,
      GIFT_FRAME_METRICS.plusCircle.y -
        GIFT_FRAME_METRICS.plusCircle.radius -
        GIFT_FRAME_METRICS.overlayBox.y,
      plusDiameter,
      plusDiameter,
    );

    return canvas;
  })();

  return giftFrameOverlayPromise;
}

async function getGiftFrameBaseCanvas() {
  if (giftFrameBasePromise) {
    return giftFrameBasePromise;
  }

  giftFrameBasePromise = (async () => {
    const response = await fetch(GIFT_TEMPLATE_SRC);
    const templateBlob = await response.blob();
    const templateBitmap = await loadImageBitmap(templateBlob);
    const canvas = createCanvas({
      width: GIFT_FRAME_METRICS.overlayBox.width,
      height: GIFT_FRAME_METRICS.overlayBox.height,
    });
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("사은품 프레임 배경을 생성할 수 없습니다.");
    }

    context.drawImage(
      templateBitmap,
      GIFT_FRAME_METRICS.overlayBox.x,
      GIFT_FRAME_METRICS.overlayBox.y,
      GIFT_FRAME_METRICS.overlayBox.width,
      GIFT_FRAME_METRICS.overlayBox.height,
      0,
      0,
      GIFT_FRAME_METRICS.overlayBox.width,
      GIFT_FRAME_METRICS.overlayBox.height,
    );

    return canvas;
  })();

  return giftFrameBasePromise;
}

export async function getGiftFrameBaseUrl() {
  if (giftFrameBaseUrlPromise) {
    return giftFrameBaseUrlPromise;
  }

  giftFrameBaseUrlPromise = (async () => {
    const canvas = await getGiftFrameBaseCanvas();
    return canvas.toDataURL("image/png");
  })();

  return giftFrameBaseUrlPromise;
}

export async function getGiftFrameOverlayUrl() {
  if (giftFrameOverlayUrlPromise) {
    return giftFrameOverlayUrlPromise;
  }

  giftFrameOverlayUrlPromise = (async () => {
    const canvas = await getGiftFrameOverlayCanvas();
    return canvas.toDataURL("image/png");
  })();

  return giftFrameOverlayUrlPromise;
}

async function drawGiftFrameBase(context: CanvasRenderingContext2D) {
  const baseCanvas = await getGiftFrameBaseCanvas();
  context.drawImage(
    baseCanvas,
    GIFT_FRAME_METRICS.overlayBox.x,
    GIFT_FRAME_METRICS.overlayBox.y,
    GIFT_FRAME_METRICS.overlayBox.width,
    GIFT_FRAME_METRICS.overlayBox.height,
  );
}

async function drawGiftFrameOverlay(context: CanvasRenderingContext2D) {
  const overlayCanvas = await getGiftFrameOverlayCanvas();
  context.drawImage(
    overlayCanvas,
    GIFT_FRAME_METRICS.overlayBox.x,
    GIFT_FRAME_METRICS.overlayBox.y,
    GIFT_FRAME_METRICS.overlayBox.width,
    GIFT_FRAME_METRICS.overlayBox.height,
  );
}

export async function composeRepresentativeImage(
  blob: Blob,
  options: ComposeOptions = {},
): Promise<OutputImagePayload> {
  const canvas = createCanvas({ width: CANVAS_SIZE, height: CANVAS_SIZE });
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("대표이미지 캔버스를 생성할 수 없습니다.");
  }

  if (options.fullBleed) {
    context.fillStyle = options.backgroundColor ?? "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
  } else {
    await drawTemplateBackground(
      context,
      options.backgroundImageSrc ?? representativeTemplateSrc,
      options.backgroundColor ?? "#ffffff",
    );
  }

  const { sourceCanvas, bounds, width, height } = await renderBlobToCanvas(blob);
  const preserveSourceFrame = options.preserveSourceFrame ?? true;
  const drawRect = getRepresentativeDrawRect(
    preserveSourceFrame ? { width, height } : { width: bounds.width, height: bounds.height },
    options,
  );
  const drawSourceRect = preserveSourceFrame
    ? { x: 0, y: 0, width: sourceCanvas.width, height: sourceCanvas.height }
    : bounds;

  if (options.addShadow && !options.fullBleed) {
    context.save();
    context.shadowColor = `rgba(20, 33, 58, ${options.shadowOpacity ?? 0.16})`;
    context.shadowBlur = 36;
    context.shadowOffsetY = 24;
    context.drawImage(
      sourceCanvas,
      drawSourceRect.x,
      drawSourceRect.y,
      drawSourceRect.width,
      drawSourceRect.height,
      drawRect.x,
      drawRect.y,
      drawRect.width,
      drawRect.height,
    );
    context.restore();
  }

  context.drawImage(
    sourceCanvas,
    drawSourceRect.x,
    drawSourceRect.y,
    drawSourceRect.width,
    drawSourceRect.height,
    drawRect.x,
    drawRect.y,
    drawRect.width,
    drawRect.height,
  );

  const resultBlob = await canvasToBlob(canvas, "image/png");
  return {
    blob: resultBlob,
    objectUrl: URL.createObjectURL(resultBlob),
    width: canvas.width,
    height: canvas.height,
  };
}

export async function getRepresentativeLayoutRect(
  blob: Blob,
  options: ComposeOptions = {},
): Promise<LayoutRect> {
  const { bounds, width, height } = await renderBlobToCanvas(blob);
  return getRepresentativeDrawRect(
    options.preserveSourceFrame ?? true ? { width, height } : { width: bounds.width, height: bounds.height },
    options,
  );
}

export async function getGiftLayoutRects(
  mainBlob: Blob,
  giftBlob: Blob,
  options: GiftComposeOptions = {},
): Promise<{ main: LayoutRect; gift: LayoutRect }> {
  const main = await renderBlobToCanvas(mainBlob);
  const gift = await renderBlobToCanvas(giftBlob);
  const preserveSourceFrame = options.preserveSourceFrame ?? true;
  const mainFrame = preserveSourceFrame ? { width: main.width, height: main.height } : { width: main.bounds.width, height: main.bounds.height };
  const giftFrame = preserveSourceFrame ? { width: gift.width, height: gift.height } : { width: gift.bounds.width, height: gift.bounds.height };

  const mainScale = options.mainScale ?? 1;
  let mainWidth: number;
  let mainHeight: number;
  let mainX: number;
  let mainY: number;

  if (options.mainFullBleed) {
    const scale = Math.max(CANVAS_SIZE / mainFrame.width, CANVAS_SIZE / mainFrame.height) * mainScale;
    mainWidth = mainFrame.width * scale;
    mainHeight = mainFrame.height * scale;
    mainX = (CANVAS_SIZE - mainWidth) / 2 + (options.mainOffset?.x ?? 0);
    mainY = (CANVAS_SIZE - mainHeight) / 2 + (options.mainOffset?.y ?? 0);
  } else {
    const mainPlacement = calculateContainSize(mainFrame.width, mainFrame.height, 792, 792);
    mainWidth = mainPlacement.width * mainScale;
    mainHeight = mainPlacement.height * mainScale;
    mainX = (CANVAS_SIZE - mainWidth) / 2 + (options.mainOffset?.x ?? 0);
    mainY = (CANVAS_SIZE - mainHeight) / 2 + (options.mainOffset?.y ?? 0);
  }

  const giftArea = options.giftArea ?? GIFT_FRAME_METRICS.imageLayoutBox;
  const giftPlacement = calculateContainSize(giftFrame.width, giftFrame.height, giftArea.width, giftArea.height);
  const giftScale = options.giftScale ?? 1;
  const giftWidth = giftPlacement.width * giftScale;
  const giftHeight = giftPlacement.height * giftScale;
  const giftX = giftArea.x + (giftArea.width - giftWidth) / 2 + (options.giftOffset?.x ?? 0);
  const giftY = giftArea.y + (giftArea.height - giftHeight) / 2 + (options.giftOffset?.y ?? 0);

  return {
    main: { x: mainX, y: mainY, width: mainWidth, height: mainHeight },
    gift: { x: giftX, y: giftY, width: giftWidth, height: giftHeight },
  };
}

export async function composeGiftImage(
  mainBlob: Blob,
  giftBlob: Blob,
  options: GiftComposeOptions = {},
): Promise<OutputImagePayload> {
  const canvas = createCanvas({ width: CANVAS_SIZE, height: CANVAS_SIZE });
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("사은품 이미지를 생성할 수 없습니다.");
  }

  await drawTemplateBackground(
    context,
    options.backgroundImageSrc ?? GIFT_TEMPLATE_SRC,
    options.backgroundColor ?? "#ffffff",
  );

  const main = await renderBlobToCanvas(mainBlob);
  const gift = await renderBlobToCanvas(giftBlob);
  const preserveSourceFrame = options.preserveSourceFrame ?? true;
  const mainFrame = preserveSourceFrame ? { width: main.width, height: main.height } : { width: main.bounds.width, height: main.bounds.height };
  const giftFrame = preserveSourceFrame ? { width: gift.width, height: gift.height } : { width: gift.bounds.width, height: gift.bounds.height };
  const mainSourceRect = preserveSourceFrame ? { x: 0, y: 0, width: main.sourceCanvas.width, height: main.sourceCanvas.height } : main.bounds;
  const giftSourceRect = preserveSourceFrame ? { x: 0, y: 0, width: gift.sourceCanvas.width, height: gift.sourceCanvas.height } : gift.bounds;

  const mainScale = options.mainScale ?? 1;
  let mainWidth: number;
  let mainHeight: number;
  let mainX: number;
  let mainY: number;

  if (options.mainFullBleed) {
    const scale = Math.max(CANVAS_SIZE / mainFrame.width, CANVAS_SIZE / mainFrame.height) * mainScale;
    mainWidth = mainFrame.width * scale;
    mainHeight = mainFrame.height * scale;
    mainX = (canvas.width - mainWidth) / 2 + (options.mainOffset?.x ?? 0);
    mainY = (canvas.height - mainHeight) / 2 + (options.mainOffset?.y ?? 0);
  } else {
    const mainPlacement = calculateContainSize(mainFrame.width, mainFrame.height, 792, 792);
    mainWidth = mainPlacement.width * mainScale;
    mainHeight = mainPlacement.height * mainScale;
    mainX = (canvas.width - mainWidth) / 2 + (options.mainOffset?.x ?? 0);
    mainY = (canvas.height - mainHeight) / 2 + (options.mainOffset?.y ?? 0);
  }

  if (options.mainShadow && !options.mainFullBleed) {
    context.save();
    context.shadowColor = "rgba(20, 33, 58, 0.15)";
    context.shadowBlur = 34;
    context.shadowOffsetY = 24;
    context.drawImage(
      main.sourceCanvas,
      mainSourceRect.x,
      mainSourceRect.y,
      mainSourceRect.width,
      mainSourceRect.height,
      mainX,
      mainY,
      mainWidth,
      mainHeight,
    );
    context.restore();
  }

  context.drawImage(
    main.sourceCanvas,
    mainSourceRect.x,
    mainSourceRect.y,
    mainSourceRect.width,
    mainSourceRect.height,
    mainX,
    mainY,
    mainWidth,
    mainHeight,
  );

  const giftArea = options.giftArea ?? GIFT_FRAME_METRICS.imageLayoutBox;
  const giftPlacement = calculateContainSize(giftFrame.width, giftFrame.height, giftArea.width, giftArea.height);
  const giftScale = options.giftScale ?? 1;
  const giftWidth = giftPlacement.width * giftScale;
  const giftHeight = giftPlacement.height * giftScale;
  const giftX = giftArea.x + (giftArea.width - giftWidth) / 2 + (options.giftOffset?.x ?? 0);
  const giftY = giftArea.y + (giftArea.height - giftHeight) / 2 + (options.giftOffset?.y ?? 0);

  await drawGiftFrameBase(context);

  if (options.giftShadow) {
    context.save();
    drawRoundedRectPath(context, giftArea, GIFT_FRAME_METRICS.radii.white);
    context.clip();
    context.shadowColor = "rgba(20, 33, 58, 0.12)";
    context.shadowBlur = 24;
    context.shadowOffsetY = 16;
    context.drawImage(
      gift.sourceCanvas,
      giftSourceRect.x,
      giftSourceRect.y,
      giftSourceRect.width,
      giftSourceRect.height,
      giftX,
      giftY,
      giftWidth,
      giftHeight,
    );
    context.restore();
  }

  context.save();
  drawRoundedRectPath(context, giftArea, GIFT_FRAME_METRICS.radii.white);
  context.clip();
  context.drawImage(
    gift.sourceCanvas,
    giftSourceRect.x,
    giftSourceRect.y,
    giftSourceRect.width,
    giftSourceRect.height,
    giftX,
    giftY,
    giftWidth,
    giftHeight,
  );
  context.restore();

  await drawGiftFrameOverlay(context);

  if (options.guideOverlayImageSrc) {
    await drawTemplateBackground(context, options.guideOverlayImageSrc, "transparent");
  }

  const resultBlob = await canvasToBlob(canvas, "image/png");
  return {
    blob: resultBlob,
    objectUrl: URL.createObjectURL(resultBlob),
    width: canvas.width,
    height: canvas.height,
  };
}

export async function mergeOnWhiteBackground(blob: Blob): Promise<OutputImagePayload> {
  const bitmap = await loadImageBitmap(blob);
  const canvas = createCanvas({ width: bitmap.width, height: bitmap.height });
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("흰색 배경 결과를 생성할 수 없습니다.");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0);
  const resultBlob = await canvasToBlob(canvas, "image/png");
  return {
    blob: resultBlob,
    objectUrl: URL.createObjectURL(resultBlob),
    width: canvas.width,
    height: canvas.height,
  };
}

export async function exportCanvasBlob(blob: Blob, format: "png" | "jpg") {
  const bitmap = await loadImageBitmap(blob);
  const canvas = createCanvas({ width: bitmap.width, height: bitmap.height });
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("이미지 내보내기에 실패했습니다.");
  }

  if (format === "jpg") {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.drawImage(bitmap, 0, 0);
  return canvasToBlob(canvas, format === "png" ? "image/png" : "image/jpeg", 0.92);
}
