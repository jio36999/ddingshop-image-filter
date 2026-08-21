import { del, entries, get, set } from "idb-keyval";
import type { CutoutSettings, GiftSettings, GuideFileRecord, RepresentativeSettings } from "../types/app";
import { DEFAULT_CUTOUT_SETTINGS, DEFAULT_GIFT_SETTINGS, DEFAULT_REPRESENTATIVE_SETTINGS } from "../utils/constants";

const REPRESENTATIVE_SETTINGS_KEY = "representative-settings";
const GIFT_SETTINGS_KEY = "gift-settings";
const CUTOUT_SETTINGS_KEY = "cutout-settings";
const GUIDE_PREFIX = "guide-file:";

export function loadRepresentativeSettings(): RepresentativeSettings {
  const raw = localStorage.getItem(REPRESENTATIVE_SETTINGS_KEY);
  if (!raw) {
    return { ...DEFAULT_REPRESENTATIVE_SETTINGS };
  }

  try {
    return { ...DEFAULT_REPRESENTATIVE_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_REPRESENTATIVE_SETTINGS };
  }
}

export function saveRepresentativeSettings(settings: RepresentativeSettings) {
  localStorage.setItem(REPRESENTATIVE_SETTINGS_KEY, JSON.stringify(settings));
}

export function loadGiftSettings(): GiftSettings {
  const raw = localStorage.getItem(GIFT_SETTINGS_KEY);
  if (!raw) {
    return { ...DEFAULT_GIFT_SETTINGS };
  }

  try {
    return { ...DEFAULT_GIFT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_GIFT_SETTINGS };
  }
}

export function saveGiftSettings(settings: GiftSettings) {
  localStorage.setItem(GIFT_SETTINGS_KEY, JSON.stringify(settings));
}

export function loadCutoutSettings(): CutoutSettings {
  const raw = localStorage.getItem(CUTOUT_SETTINGS_KEY);
  if (!raw) {
    return { ...DEFAULT_CUTOUT_SETTINGS };
  }

  try {
    return { ...DEFAULT_CUTOUT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CUTOUT_SETTINGS };
  }
}

export function saveCutoutSettings(settings: CutoutSettings) {
  localStorage.setItem(CUTOUT_SETTINGS_KEY, JSON.stringify(settings));
}

export async function saveGuideFile(file: File) {
  const id = crypto.randomUUID();
  const record: GuideFileRecord = {
    id,
    name: file.name,
    type: file.type,
    size: file.size,
    updatedAt: new Date().toISOString(),
  };

  await set(`${GUIDE_PREFIX}${id}`, { record, blob: file });
  return record;
}

export async function replaceGuideFile(id: string, file: File) {
  const record: GuideFileRecord = {
    id,
    name: file.name,
    type: file.type,
    size: file.size,
    updatedAt: new Date().toISOString(),
  };

  await set(`${GUIDE_PREFIX}${id}`, { record, blob: file });
  return record;
}

export async function deleteGuideFile(id: string) {
  await del(`${GUIDE_PREFIX}${id}`);
}

export async function getGuideFiles() {
  const allEntries = await entries();
  return allEntries
    .filter(([key]) => typeof key === "string" && key.startsWith(GUIDE_PREFIX))
    .map(([, value]) => value.record as GuideFileRecord)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getGuideFileBlob(id: string) {
  const value = await get<{ record: GuideFileRecord; blob: Blob }>(`${GUIDE_PREFIX}${id}`);
  return value?.blob ?? null;
}
