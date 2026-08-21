import type { ObjectOffset } from "./app";

export type CanvasSize = {
  width: number;
  height: number;
};

export type ComposeOptions = {
  backgroundColor?: string | null;
  addShadow?: boolean;
  shadowOpacity?: number;
  paddingRatio?: number;
  targetBoxRatio?: number;
  backgroundImageSrc?: string;
  objectOffset?: ObjectOffset;
  objectScale?: number;
  fullBleed?: boolean;
  preserveSourceFrame?: boolean;
};

export type GiftComposeOptions = {
  backgroundColor?: string;
  mainShadow?: boolean;
  giftShadow?: boolean;
  backgroundImageSrc?: string;
  guideOverlayImageSrc?: string;
  mainOffset?: ObjectOffset;
  giftOffset?: ObjectOffset;
  giftArea?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  mainScale?: number;
  giftScale?: number;
  mainFullBleed?: boolean;
  preserveSourceFrame?: boolean;
};

export type OutputImagePayload = {
  blob: Blob;
  objectUrl: string;
  width: number;
  height: number;
};

export type RemovalOptions = {
  edgeRefinement?: boolean;
  experimentalLab?: boolean;
  fallbackToOriginal?: boolean;
  edgeFeather?: number;
  maskInset?: number;
  haloSuppression?: number;
  removeSmallArtifacts?: boolean;
  removeLogos?: boolean;
  logoRemovalStrength?: number;
  plateRecoveryStrength?: number;
  translucencyProtection?: number;
  shadowSuppression?: number;
  preset?: "standard" | "bottle" | "package" | "multi" | "food" | "tray";
};
