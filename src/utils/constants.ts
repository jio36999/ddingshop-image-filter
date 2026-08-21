import type { CutoutSettings, MenuItem } from "../types/app";

export const CANVAS_SIZE = 1100;
export const MAX_FILE_SIZE_MB = 20;
export const ACCEPTED_FILE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/jpg",
];

export const ACCEPTED_GUIDE_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export const MENU_ITEMS: MenuItem[] = [
  { label: "대표이미지 생성", path: "/representative", icon: "image" },
  { label: "대표이미지 일괄변경", path: "/batch", icon: "layers" },
  { label: "사은품 이미지", path: "/gift", icon: "gift" },
  { label: "사은품 이미지 일괄변경", path: "/gift-batch", icon: "layers" },
  { label: "누끼컷 생성", path: "/cutout", icon: "scissors" },
  { label: "관리자 페이지", path: "/admin", icon: "shield" },
];

export const DEFAULT_REPRESENTATIVE_SETTINGS = {
  defaultFormat: "PNG/JPG",
  resolution: CANVAS_SIZE,
  autoCutout: true,
  shadow: true,
} as const;

export const DEFAULT_GIFT_SETTINGS = {
  autoCutoutMain: false,
  autoCutoutGift: true,
  fixedWhiteBackground: true,
  defaultFormat: "PNG",
} as const;

export const DEFAULT_CUTOUT_SETTINGS: CutoutSettings = {
  preset: "standard",
  edgeRefinement: true,
  edgeFeather: 1,
  maskInset: 1,
  haloSuppression: 70,
  translucencyProtection: 35,
  shadowSuppression: 35,
  removeSmallArtifacts: true,
  removeLogos: true,
};
