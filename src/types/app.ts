export type MenuItem = {
  label: string;
  path: string;
  icon: "image" | "layers" | "gift" | "scissors" | "book" | "shield";
};

export type DownloadFormat = "png" | "jpg";

export type ToastType = "success" | "error" | "info";

export type BatchItemStatus = "대기" | "처리중" | "완료" | "실패";

export type ProcessedImage = {
  blob: Blob;
  objectUrl: string;
  width: number;
  height: number;
};

export type BatchProcessingItem = {
  id: string;
  file: File;
  status: BatchItemStatus;
  result?: ProcessedImage;
  error?: string;
  editableBlob?: Blob;
  offset?: ObjectOffset;
  scale?: number;
};

export type RepresentativeSettings = {
  defaultFormat: "PNG/JPG" | "PNG" | "JPG";
  resolution: number;
  autoCutout: boolean;
  shadow: boolean;
};

export type GiftSettings = {
  autoCutoutMain: boolean;
  autoCutoutGift: boolean;
  fixedWhiteBackground: boolean;
  defaultFormat: "PNG" | "JPG";
};

export type CutoutSettings = {
  preset: "standard" | "bottle" | "package" | "multi" | "food" | "tray";
  edgeRefinement: boolean;
  edgeFeather: number;
  maskInset: number;
  haloSuppression: number;
  translucencyProtection: number;
  shadowSuppression: number;
  removeSmallArtifacts: boolean;
  removeLogos: boolean;
};

export type GuideFileRecord = {
  id: string;
  name: string;
  type: string;
  size: number;
  updatedAt: string;
};

export type ObjectOffset = {
  x: number;
  y: number;
};
