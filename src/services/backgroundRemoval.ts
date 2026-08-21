import * as ort from "onnxruntime-web";
import type { BaseSession } from "@bunnio/rembg-web";
import { newSession, remove, rembgConfig } from "@bunnio/rembg-web";
import type { RemovalOptions } from "../types/image";
import { canvasToBlob, imageDataToCanvas, loadImageBitmap } from "../utils/image";

type ModelName = "u2netp" | "u2net" | "isnet-general-use";

type CropBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type AlphaStats = {
  coverage: number;
  maxAlpha: number;
  strongCoverage: number;
  boundsCoverage: number;
  componentCount: number;
  largestComponentCoverage: number;
};

type RemovalQualityProfile = {
  weakAlphaCutoff: number;
  alphaBoostUpperBound: number;
  alphaBoostFactor: number;
  emptyCoverageThreshold: number;
  strongCoverageThreshold: number;
  boundsCoverageThreshold: number;
  maxAlphaThreshold: number;
  defaultEdgeFeather: number;
  defaultMaskInset: number;
  defaultHaloSuppression: number;
  defaultTranslucencyProtection: number;
  defaultShadowSuppression: number;
};

type ConnectedComponent = {
  id: number;
  area: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  sumX: number;
  sumY: number;
  touchesLeft: boolean;
  touchesRight: boolean;
  touchesTop: boolean;
  touchesBottom: boolean;
};

type ComponentSelection = {
  component: ConnectedComponent;
  score: number;
};

const ECOMMERCE_CUTOUT_PROFILE: RemovalQualityProfile = {
  weakAlphaCutoff: 14,
  alphaBoostUpperBound: 248,
  alphaBoostFactor: 1.06,
  emptyCoverageThreshold: 0.003,
  strongCoverageThreshold: 0.0015,
  boundsCoverageThreshold: 0.01,
  maxAlphaThreshold: 32,
  defaultEdgeFeather: 1,
  defaultMaskInset: 1,
  defaultHaloSuppression: 0.7,
  defaultTranslucencyProtection: 0.35,
  defaultShadowSuppression: 0.35,
};

const FOOD_PLATE_PROFILE: RemovalQualityProfile = {
  weakAlphaCutoff: 10,
  alphaBoostUpperBound: 250,
  alphaBoostFactor: 1.04,
  emptyCoverageThreshold: 0.01,
  strongCoverageThreshold: 0.008,
  boundsCoverageThreshold: 0.08,
  maxAlphaThreshold: 42,
  defaultEdgeFeather: 1,
  defaultMaskInset: 0,
  defaultHaloSuppression: 0.52,
  defaultTranslucencyProtection: 0.44,
  defaultShadowSuppression: 0.2,
};

const TRAY_PRODUCT_PROFILE: RemovalQualityProfile = {
  weakAlphaCutoff: 10,
  alphaBoostUpperBound: 250,
  alphaBoostFactor: 1.03,
  emptyCoverageThreshold: 0.012,
  strongCoverageThreshold: 0.01,
  boundsCoverageThreshold: 0.1,
  maxAlphaThreshold: 44,
  defaultEdgeFeather: 1,
  defaultMaskInset: 0,
  defaultHaloSuppression: 0.48,
  defaultTranslucencyProtection: 0.38,
  defaultShadowSuppression: 0.16,
};

const SUBJECT_CROP_THRESHOLD = 22;
const FOREGROUND_ALPHA_THRESHOLD = 26;
const STRONG_ALPHA_THRESHOLD = 52;
const LIGHT_FOOD_EDGE_THRESHOLD = 42;
const SUPPORT_EDGE_BLOCK_THRESHOLD = 58;
const SUPPORT_BRIGHTNESS_MIN = 150;
const SUPPORT_SATURATION_MAX = 42;
const CORNER_COMPONENT_PENALTY = 0.55;
const EDGE_COMPONENT_PENALTY = 0.22;
const MIN_COMPONENT_AREA_RATIO = 0.00035;
const TRAY_SUPPORT_COMPONENT_AREA_RATIO = 0.06;
const TRAY_CENTER_BOUNDS_PADDING_RATIO = 0.18;
const TRAY_SUPPORT_BRIGHTNESS_MIN = 162;
const TRAY_SUPPORT_SATURATION_MAX = 38;
const TRAY_SUPPORT_EDGE_MAX = 68;
const FOOD_SUPPORT_TOP_ALLOWANCE_RATIO = 0.22;
const FOOD_SUPPORT_BOTTOM_ALLOWANCE_RATIO = 0.16;
const FOOD_SUPPORT_SIDE_ALLOWANCE_RATIO = 0.18;
const FOOD_SUPPORT_ELLIPSE_THRESHOLD = 1.02;
const SUPPORT_SEED_DOWNWARD_RATIO = 0.24;
const SUPPORT_SEED_SIDE_RATIO = 0.18;
const SUPPORT_SEED_UPWARD_RATIO = 0.12;
const LOGO_COMPONENT_DISTANCE_THRESHOLD = 0.78;
const LOGO_COMPONENT_AREA_RATIO = 0.18;
const LOGO_COMPONENT_BOUNDS_RATIO = 0.28;
const LOGO_PRESERVE_PADDING_RATIO = 0.06;
const STRICT_SUBJECT_PADDING_RATIO = 0.12;
const STRICT_SUBJECT_AREA_RATIO = 0.12;
const PRIMARY_ONLY_PRESETS: Array<NonNullable<RemovalOptions["preset"]>> = [
  "standard",
  "package",
  "food",
  "tray",
];
const DETACHED_COMPONENT_DISTANCE_THRESHOLD = 0.52;
const DETACHED_COMPONENT_AREA_RATIO = 0.22;
const DETACHED_COMPONENT_MAX_KEEP_RATIO = 0.05;
const DETACHED_COMPONENT_EDGE_PENALTY_RATIO = 0.18;

type ResolvedRemovalOptions = Required<
  Pick<
    RemovalOptions,
    | "edgeRefinement"
    | "experimentalLab"
    | "fallbackToOriginal"
    | "edgeFeather"
    | "maskInset"
    | "haloSuppression"
    | "removeSmallArtifacts"
    | "removeLogos"
    | "logoRemovalStrength"
    | "plateRecoveryStrength"
    | "translucencyProtection"
    | "shadowSuppression"
    | "preset"
  >
>;

let initialized = false;
let initializationPromise: Promise<void> | null = null;
const sessionPromises = new Map<ModelName, Promise<BaseSession>>();
const unavailableModels = new Set<ModelName>();

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getConfiguredModelBaseUrl() {
  const sameOriginModelUrl = new URL("/models/", window.location.origin).toString().replace(/\/$/, "");
  const isPagesDeployment = /\.pages\.dev$/i.test(window.location.hostname);

  if (isPagesDeployment) {
    return sameOriginModelUrl;
  }

  const envBaseUrl = import.meta.env.VITE_MODEL_BASE_URL?.trim();
  if (envBaseUrl) {
    return envBaseUrl.replace(/\/$/, "");
  }

  return sameOriginModelUrl;
}

function getProfileForPreset(preset: RemovalOptions["preset"]) {
  if (preset === "food") {
    return FOOD_PLATE_PROFILE;
  }

  if (preset === "tray") {
    return TRAY_PRODUCT_PROFILE;
  }

  return ECOMMERCE_CUTOUT_PROFILE;
}

function getPresetAdjustments(preset: RemovalOptions["preset"]) {
  switch (preset) {
    case "bottle":
      return {
        edgeFeather: 1,
        maskInset: 0,
        haloSuppression: 0.58,
        translucencyProtection: 0.72,
        shadowSuppression: 0.22,
      };
    case "package":
      return {
        edgeFeather: 1,
        maskInset: 1,
        haloSuppression: 0.82,
        translucencyProtection: 0.28,
        shadowSuppression: 0.45,
      };
    case "multi":
      return {
        edgeFeather: 1,
        maskInset: 1,
        haloSuppression: 0.78,
        translucencyProtection: 0.32,
        shadowSuppression: 0.4,
      };
    case "food":
      return {
        edgeFeather: FOOD_PLATE_PROFILE.defaultEdgeFeather,
        maskInset: FOOD_PLATE_PROFILE.defaultMaskInset,
        haloSuppression: FOOD_PLATE_PROFILE.defaultHaloSuppression,
        translucencyProtection: FOOD_PLATE_PROFILE.defaultTranslucencyProtection,
        shadowSuppression: FOOD_PLATE_PROFILE.defaultShadowSuppression,
      };
    case "tray":
      return {
        edgeFeather: TRAY_PRODUCT_PROFILE.defaultEdgeFeather,
        maskInset: TRAY_PRODUCT_PROFILE.defaultMaskInset,
        haloSuppression: TRAY_PRODUCT_PROFILE.defaultHaloSuppression,
        translucencyProtection: TRAY_PRODUCT_PROFILE.defaultTranslucencyProtection,
        shadowSuppression: TRAY_PRODUCT_PROFILE.defaultShadowSuppression,
      };
    case "standard":
    default:
      return {
        edgeFeather: ECOMMERCE_CUTOUT_PROFILE.defaultEdgeFeather,
        maskInset: ECOMMERCE_CUTOUT_PROFILE.defaultMaskInset,
        haloSuppression: ECOMMERCE_CUTOUT_PROFILE.defaultHaloSuppression,
        translucencyProtection: ECOMMERCE_CUTOUT_PROFILE.defaultTranslucencyProtection,
        shadowSuppression: ECOMMERCE_CUTOUT_PROFILE.defaultShadowSuppression,
      };
  }
}

function resolveRemovalOptions(options?: RemovalOptions): ResolvedRemovalOptions {
  const preset = options?.preset ?? "standard";
  const presetDefaults = getPresetAdjustments(preset);

  return {
    edgeRefinement: options?.edgeRefinement ?? true,
    experimentalLab: options?.experimentalLab ?? false,
    fallbackToOriginal: options?.fallbackToOriginal ?? true,
    edgeFeather: clamp(options?.edgeFeather ?? presetDefaults.edgeFeather, 0, 4),
    maskInset: clamp(options?.maskInset ?? presetDefaults.maskInset, -2, 4),
    haloSuppression: clamp(options?.haloSuppression ?? presetDefaults.haloSuppression, 0, 1),
    removeSmallArtifacts: options?.removeSmallArtifacts ?? true,
    removeLogos: options?.removeLogos ?? true,
    logoRemovalStrength: clamp(options?.logoRemovalStrength ?? 50, 0, 100),
    plateRecoveryStrength: clamp(options?.plateRecoveryStrength ?? 50, 0, 100),
    translucencyProtection: clamp(
      options?.translucencyProtection ?? presetDefaults.translucencyProtection,
      0,
      1,
    ),
    shadowSuppression: clamp(options?.shadowSuppression ?? presetDefaults.shadowSuppression, 0, 1),
    preset,
  };
}

async function ensureBackgroundRemovalReady() {
  if (initialized) {
    return;
  }

  if (initializationPromise) {
    await initializationPromise;
    return;
  }

  initializationPromise = (async () => {
    const modelBaseUrl = getConfiguredModelBaseUrl();
    ort.env.wasm.wasmPaths = `${modelBaseUrl}/`;
    ort.env.wasm.numThreads = 1;
    rembgConfig.setBaseUrl(modelBaseUrl);
    initialized = true;
  })();

  try {
    await initializationPromise;
  } catch (error) {
    initializationPromise = null;
    throw error;
  }
}

function getPreferredModelsForPreset(
  preset: RemovalOptions["preset"],
  experimentalLab = false,
): ModelName[] {
  if (experimentalLab) {
    switch (preset) {
      case "food":
      case "tray":
        return ["u2netp", "u2net", "isnet-general-use"];
      case "multi":
        return ["u2netp", "u2net", "isnet-general-use"];
      case "package":
      case "bottle":
      case "standard":
      default:
        return ["u2netp", "u2net"];
    }
  }

  switch (preset) {
    case "food":
      return ["isnet-general-use", "u2net", "u2netp"];
    case "tray":
      return ["isnet-general-use", "u2net", "u2netp"];
    case "package":
      return ["u2net", "u2netp"];
    case "multi":
      return ["u2net", "isnet-general-use", "u2netp"];
    case "bottle":
      return ["u2net", "u2netp"];
    case "standard":
    default:
      return ["u2net", "u2netp", "isnet-general-use"];
  }
}

function shouldEscalateModelAttempt(
  stats: AlphaStats,
  modelName: ModelName,
  options: ResolvedRemovalOptions,
) {
  if (!options.experimentalLab || modelName !== "u2netp") {
    return false;
  }

  if (isEffectivelyEmptyCutout(stats, options.preset)) {
    return true;
  }

  switch (options.preset) {
    case "food":
    case "tray":
      return (
        stats.boundsCoverage < 0.16 ||
        stats.largestComponentCoverage < 0.02 ||
        stats.componentCount > 12
      );
    case "multi":
      return stats.largestComponentCoverage < 0.012 || stats.componentCount > 16;
    case "package":
    case "bottle":
    case "standard":
    default:
      return stats.largestComponentCoverage < 0.006;
  }
}

function isMissingModelError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = message.toLowerCase();
  return (
    normalized.includes("404") ||
    normalized.includes("failed to fetch") ||
    normalized.includes("model") ||
    normalized.includes(".onnx")
  );
}

async function getSessionForModel(modelName: ModelName) {
  if (unavailableModels.has(modelName)) {
    throw new Error(`Model unavailable: ${modelName}`);
  }

  const existing = sessionPromises.get(modelName);
  if (existing) {
    return existing;
  }

  const nextPromise = (async () => {
    const session = newSession(modelName);
    await session;
    return session;
  })();

  sessionPromises.set(modelName, nextPromise);

  try {
    return await nextPromise;
  } catch (error) {
    sessionPromises.delete(modelName);
    if (isMissingModelError(error)) {
      unavailableModels.add(modelName);
    }
    throw error;
  }
}

function brightnessAt(data: Uint8ClampedArray, index: number) {
  return (data[index] + data[index + 1] + data[index + 2]) / 3;
}

function saturationAt(data: Uint8ClampedArray, index: number) {
  const maxChannel = Math.max(data[index], data[index + 1], data[index + 2]);
  const minChannel = Math.min(data[index], data[index + 1], data[index + 2]);
  return maxChannel - minChannel;
}

function edgeStrengthAt(source: ImageData, x: number, y: number) {
  const { width, height, data } = source;
  const leftX = clamp(x - 1, 0, width - 1);
  const rightX = clamp(x + 1, 0, width - 1);
  const topY = clamp(y - 1, 0, height - 1);
  const bottomY = clamp(y + 1, 0, height - 1);
  const left = brightnessAt(data, (y * width + leftX) * 4);
  const right = brightnessAt(data, (y * width + rightX) * 4);
  const top = brightnessAt(data, (topY * width + x) * 4);
  const bottom = brightnessAt(data, (bottomY * width + x) * 4);
  return Math.abs(left - right) + Math.abs(top - bottom);
}

function createBinaryMaskFromAlpha(alpha: Uint8ClampedArray, threshold: number) {
  const mask = new Uint8Array(alpha.length);
  for (let index = 0; index < alpha.length; index += 1) {
    mask[index] = alpha[index] >= threshold ? 1 : 0;
  }
  return mask;
}

function getComponentBounds(component: ConnectedComponent): CropBounds {
  return {
    x: component.minX,
    y: component.minY,
    width: component.maxX - component.minX + 1,
    height: component.maxY - component.minY + 1,
  };
}

function getComponentCenter(component: ConnectedComponent) {
  return {
    x: component.sumX / component.area,
    y: component.sumY / component.area,
  };
}

function findConnectedComponents(mask: Uint8Array, width: number, height: number) {
  const visited = new Uint8Array(mask.length);
  const labels = new Int32Array(mask.length);
  const components: ConnectedComponent[] = [];
  const queue = new Int32Array(mask.length);
  let nextId = 1;

  for (let start = 0; start < mask.length; start += 1) {
    if (mask[start] === 0 || visited[start] === 1) {
      continue;
    }

    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    visited[start] = 1;

    const component: ConnectedComponent = {
      id: nextId,
      area: 0,
      minX: width,
      minY: height,
      maxX: -1,
      maxY: -1,
      sumX: 0,
      sumY: 0,
      touchesLeft: false,
      touchesRight: false,
      touchesTop: false,
      touchesBottom: false,
    };

    while (head < tail) {
      const current = queue[head++];
      labels[current] = nextId;
      const x = current % width;
      const y = Math.floor(current / width);

      component.area += 1;
      component.minX = Math.min(component.minX, x);
      component.minY = Math.min(component.minY, y);
      component.maxX = Math.max(component.maxX, x);
      component.maxY = Math.max(component.maxY, y);
      component.sumX += x;
      component.sumY += y;
      component.touchesLeft ||= x === 0;
      component.touchesRight ||= x === width - 1;
      component.touchesTop ||= y === 0;
      component.touchesBottom ||= y === height - 1;

      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          if (offsetX === 0 && offsetY === 0) {
            continue;
          }

          const sampleX = x + offsetX;
          const sampleY = y + offsetY;
          if (sampleX < 0 || sampleX >= width || sampleY < 0 || sampleY >= height) {
            continue;
          }

          const sampleIndex = sampleY * width + sampleX;
          if (mask[sampleIndex] === 0 || visited[sampleIndex] === 1) {
            continue;
          }

          visited[sampleIndex] = 1;
          queue[tail++] = sampleIndex;
        }
      }
    }

    components.push(component);
    nextId += 1;
  }

  return { labels, components };
}

function getExpandedBounds(bounds: CropBounds, width: number, height: number, paddingX: number, paddingY: number): CropBounds {
  const nextX = Math.max(0, bounds.x - paddingX);
  const nextY = Math.max(0, bounds.y - paddingY);
  const maxX = Math.min(width, bounds.x + bounds.width + paddingX);
  const maxY = Math.min(height, bounds.y + bounds.height + paddingY);
  return {
    x: nextX,
    y: nextY,
    width: maxX - nextX,
    height: maxY - nextY,
  };
}

function componentIntersectsBounds(component: ConnectedComponent, bounds: CropBounds) {
  return !(
    component.maxX < bounds.x ||
    component.minX > bounds.x + bounds.width - 1 ||
    component.maxY < bounds.y ||
    component.minY > bounds.y + bounds.height - 1
  );
}

function scoreComponent(
  component: ConnectedComponent,
  width: number,
  height: number,
  prioritizeBottom = false,
  suppressPeripheralArtifacts = false,
) {
  const bounds = getComponentBounds(component);
  const center = getComponentCenter(component);
  const areaRatio = component.area / (width * height);
  const boundsRatio = (bounds.width * bounds.height) / (width * height);
  const distanceX = Math.abs(center.x - width / 2) / (width / 2);
  const distanceY = Math.abs(center.y - height / 2) / (height / 2);
  const centerDistance = Math.sqrt(distanceX * distanceX + distanceY * distanceY);
  const centrality = 1 - clamp(centerDistance, 0, 1.5) / 1.5;
  const lowerHalfBonus = prioritizeBottom ? clamp((center.y / height) * 0.25, 0, 0.25) : 0;

  let penalty = 0;
  if (component.touchesLeft || component.touchesRight || component.touchesTop || component.touchesBottom) {
    penalty += EDGE_COMPONENT_PENALTY;
  }

  const cornerTouchCount =
    Number(component.touchesTop && component.touchesLeft) +
    Number(component.touchesTop && component.touchesRight) +
    Number(component.touchesBottom && component.touchesLeft) +
    Number(component.touchesBottom && component.touchesRight);
  if (cornerTouchCount > 0) {
    penalty += CORNER_COMPONENT_PENALTY;
  }

  if (suppressPeripheralArtifacts) {
    const cornerBias =
      Number(component.touchesTop || component.touchesBottom) +
      Number(component.touchesLeft || component.touchesRight);

    if (centerDistance > LOGO_COMPONENT_DISTANCE_THRESHOLD) {
      penalty += 0.42;
    }

    if (cornerBias >= 2) {
      penalty += 0.28;
    }

    if (areaRatio < 0.01 && boundsRatio < 0.03) {
      penalty += 0.18;
    }
  }

  return areaRatio * 1.35 + boundsRatio * 0.75 + centrality * 1.1 + lowerHalfBonus - penalty;
}

function selectPrimaryComponents(
  components: ConnectedComponent[],
  width: number,
  height: number,
  prioritizeBottom = false,
  preset?: RemovalOptions["preset"],
  suppressPeripheralArtifacts = false,
  logoRemovalStrength = 50,
  experimentalLab = false,
) {
  const imageArea = width * height;
  const ranked: ComponentSelection[] = components
    .filter((component) => component.area / imageArea >= MIN_COMPONENT_AREA_RATIO)
    .map((component) => ({
      component,
      score: scoreComponent(component, width, height, prioritizeBottom, suppressPeripheralArtifacts),
    }))
    .sort((left, right) => right.score - left.score);

  if (ranked.length === 0) {
    return [];
  }

  const primary = ranked[0].component;
  const primaryBounds = getComponentBounds(primary);
  const expandedPrimaryBounds = getExpandedBounds(
    primaryBounds,
    width,
    height,
    Math.round(primaryBounds.width * 0.4),
    Math.round(primaryBounds.height * 0.4),
  );
  const primaryArea = primary.area;

  const logoStrengthRatio = logoRemovalStrength / 100;
  const strictPaddingRatio = STRICT_SUBJECT_PADDING_RATIO - logoStrengthRatio * 0.05;
  const strictAreaRatio = STRICT_SUBJECT_AREA_RATIO - logoStrengthRatio * 0.06;

  if (experimentalLab && suppressPeripheralArtifacts && preset && PRIMARY_ONLY_PRESETS.includes(preset)) {
    const strictBounds = getExpandedBounds(
      primaryBounds,
      width,
      height,
      Math.round(primaryBounds.width * strictPaddingRatio),
      Math.round(primaryBounds.height * strictPaddingRatio),
    );

    const primaryOnly = ranked
      .map((entry) => entry.component)
      .filter((component) => {
        if (component.id === primary.id) {
          return true;
        }

        if (!componentIntersectsBounds(component, strictBounds)) {
          return false;
        }

        const center = getComponentCenter(component);
        const centerInside =
          center.x >= strictBounds.x &&
          center.x < strictBounds.x + strictBounds.width &&
          center.y >= strictBounds.y &&
          center.y < strictBounds.y + strictBounds.height;

        if (!centerInside) {
          return false;
        }

        return component.area >= primaryArea * strictAreaRatio;
      });

    if (primaryOnly.length > 0) {
      return primaryOnly;
    }
  }

  if (experimentalLab && suppressPeripheralArtifacts && preset !== "multi") {
    const strictBounds = getExpandedBounds(
      primaryBounds,
      width,
      height,
      Math.round(primaryBounds.width * strictPaddingRatio),
      Math.round(primaryBounds.height * strictPaddingRatio),
    );

    const strictFiltered = ranked
      .map((entry) => entry.component)
      .filter((component) => {
        if (component.id === primary.id) {
          return true;
        }

        const center = getComponentCenter(component);
        const centerInside =
          center.x >= strictBounds.x &&
          center.x < strictBounds.x + strictBounds.width &&
          center.y >= strictBounds.y &&
          center.y < strictBounds.y + strictBounds.height;

        if (!centerInside) {
          return false;
        }

        if (componentIntersectsBounds(component, primaryBounds)) {
          return true;
        }

        return component.area >= primaryArea * strictAreaRatio;
      });

    if (strictFiltered.length > 0) {
      return strictFiltered;
    }
  }

  const filtered = ranked
    .map((entry) => entry.component)
    .filter((component) => {
      if (component.id === primary.id) {
        return true;
      }

      if (!componentIntersectsBounds(component, expandedPrimaryBounds)) {
        return false;
      }

      const center = getComponentCenter(component);
      const primaryCenter = getComponentCenter(primary);
      const normalizedDistance = Math.sqrt(
        Math.pow((center.x - primaryCenter.x) / Math.max(primaryBounds.width, 1), 2) +
          Math.pow((center.y - primaryCenter.y) / Math.max(primaryBounds.height, 1), 2),
      );
      const componentBounds = getComponentBounds(component);
      const componentBoundsRatio =
        (componentBounds.width * componentBounds.height) / Math.max(primaryBounds.width * primaryBounds.height, 1);
      const touchesCorner =
        (component.touchesTop || component.touchesBottom) &&
        (component.touchesLeft || component.touchesRight);

      if (suppressPeripheralArtifacts) {
        if (touchesCorner) {
          return false;
        }

        if (
          normalizedDistance > LOGO_COMPONENT_DISTANCE_THRESHOLD &&
          component.area < primaryArea * LOGO_COMPONENT_AREA_RATIO &&
          componentBoundsRatio < LOGO_COMPONENT_BOUNDS_RATIO
        ) {
          return false;
        }
      }

      return component.area >= primaryArea * 0.035;
    });

  if (preset !== "tray") {
    return filtered;
  }

  const strictBounds = getExpandedBounds(
    primaryBounds,
    width,
    height,
    Math.round(primaryBounds.width * TRAY_CENTER_BOUNDS_PADDING_RATIO),
    Math.round(primaryBounds.height * TRAY_CENTER_BOUNDS_PADDING_RATIO),
  );

  return filtered.filter((component) => {
    if (component.id === primary.id) {
      return true;
    }

    const center = getComponentCenter(component);
    const componentAreaRatio = component.area / primaryArea;
    const centerInside =
      center.x >= strictBounds.x &&
      center.x < strictBounds.x + strictBounds.width &&
      center.y >= strictBounds.y &&
      center.y < strictBounds.y + strictBounds.height;

    return centerInside && componentAreaRatio >= TRAY_SUPPORT_COMPONENT_AREA_RATIO;
  });
}

function buildMaskFromComponents(labels: Int32Array, keepIds: Set<number>) {
  const next = new Uint8Array(labels.length);
  for (let index = 0; index < labels.length; index += 1) {
    next[index] = keepIds.has(labels[index]) ? 1 : 0;
  }
  return next;
}

function boundsFromMask(mask: Uint8Array, width: number, height: number) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index] === 0) {
      continue;
    }

    const x = index % width;
    const y = Math.floor(index / width);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  if (maxX === -1 || maxY === -1) {
    return null;
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

function buildSubjectCandidateMask(imageData: ImageData) {
  const { width, height, data } = imageData;
  const mask = new Uint8Array(width * height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const average = brightnessAt(data, index);
      const saturation = saturationAt(data, index);
      const distanceFromWhite = 255 - average;
      const edgeStrength = edgeStrengthAt(imageData, x, y);
      const isForegroundCandidate =
        distanceFromWhite > SUBJECT_CROP_THRESHOLD ||
        (distanceFromWhite > 8 && saturation > 14) ||
        (distanceFromWhite > 5 && edgeStrength > LIGHT_FOOD_EDGE_THRESHOLD);

      mask[y * width + x] = isForegroundCandidate ? 1 : 0;
    }
  }

  return mask;
}

function dilateBinaryMask(mask: Uint8Array, width: number, height: number, iterations: number) {
  let current = mask;

  for (let step = 0; step < iterations; step += 1) {
    const next = new Uint8Array(current.length);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let value = 0;

        for (let offsetY = -1; offsetY <= 1 && value === 0; offsetY += 1) {
          const sampleY = clamp(y + offsetY, 0, height - 1);
          for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
            const sampleX = clamp(x + offsetX, 0, width - 1);
            if (current[sampleY * width + sampleX] === 1) {
              value = 1;
              break;
            }
          }
        }

        next[y * width + x] = value;
      }
    }

    current = next;
  }

  return current;
}

function getPrimarySubjectMask(
  imageData: ImageData,
  preset: RemovalOptions["preset"],
  suppressPeripheralArtifacts: boolean,
  logoRemovalStrength = 50,
  experimentalLab = false,
) {
  const { width, height } = imageData;
  const mask = buildSubjectCandidateMask(imageData);
  const { labels, components } = findConnectedComponents(mask, width, height);
  const selectedComponents = selectPrimaryComponents(
    components,
    width,
    height,
    true,
    preset,
    suppressPeripheralArtifacts,
    logoRemovalStrength,
    experimentalLab,
  );
  if (selectedComponents.length === 0) {
    return null;
  }

  const keepIds = new Set(selectedComponents.map((component) => component.id));
  const mergedMask = buildMaskFromComponents(labels, keepIds);
  const dilatedMask = dilateBinaryMask(mergedMask, width, height, suppressPeripheralArtifacts ? 5 : 3);
  const bounds = boundsFromMask(dilatedMask, width, height);

  return bounds
    ? {
        mask: dilatedMask,
        bounds,
      }
    : null;
}

function calculateSubjectBounds(
  imageData: ImageData,
  preset: RemovalOptions["preset"],
  suppressPeripheralArtifacts: boolean,
  logoRemovalStrength = 50,
  experimentalLab = false,
) {
  const { width, height } = imageData;
  const subjectMask = getPrimarySubjectMask(
    imageData,
    preset,
    suppressPeripheralArtifacts,
    logoRemovalStrength,
    experimentalLab,
  );
  if (!subjectMask) {
    return null;
  }

  const bounds = subjectMask.bounds;
  const imageArea = width * height;
  const boundsArea = bounds.width * bounds.height;
  const areaRatio = boundsArea / imageArea;

  if (areaRatio < 0.025) {
    return null;
  }

  const paddingX = Math.round(bounds.width * 0.12);
  const paddingY = Math.round(bounds.height * 0.12);
  return getExpandedBounds(bounds, width, height, paddingX, paddingY);
}

function constrainAlphaToSubjectPrior(
  alpha: Uint8ClampedArray,
  subjectMask: Uint8Array,
) {
  const next = new Uint8ClampedArray(alpha.length);

  for (let index = 0; index < alpha.length; index += 1) {
    if (subjectMask[index] === 1) {
      next[index] = alpha[index];
    }
  }

  return next;
}

async function cropSource(blob: Blob, bounds: CropBounds) {
  const bitmap = await loadImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bounds.width;
  canvas.height = bounds.height;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("크롭 캔버스를 생성할 수 없습니다.");
  }

  context.drawImage(
    bitmap,
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    0,
    0,
    bounds.width,
    bounds.height,
  );

  return canvasToBlob(canvas, "image/png");
}

async function restoreCropToOriginalSize(
  blob: Blob,
  originalSize: { width: number; height: number },
  bounds: CropBounds,
) {
  const bitmap = await loadImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = originalSize.width;
  canvas.height = originalSize.height;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("복원 캔버스를 생성할 수 없습니다.");
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, bounds.x, bounds.y, bounds.width, bounds.height);
  return canvasToBlob(canvas, "image/png");
}

function applyMaskInset(alpha: Uint8ClampedArray, width: number, height: number, inset: number) {
  if (inset === 0) {
    return alpha;
  }

  let current = alpha;
  const iterations = Math.abs(inset);

  for (let step = 0; step < iterations; step += 1) {
    const next = new Uint8ClampedArray(current.length);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let value = inset > 0 ? 255 : 0;

        for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
          const sampleY = clamp(y + offsetY, 0, height - 1);

          for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
            const sampleX = clamp(x + offsetX, 0, width - 1);
            const sample = current[sampleY * width + sampleX];
            value = inset > 0 ? Math.min(value, sample) : Math.max(value, sample);
          }
        }

        next[y * width + x] = value;
      }
    }

    current = next;
  }

  return current;
}

function blurAlpha(alpha: Uint8ClampedArray, width: number, height: number, radius: number) {
  if (radius <= 0) {
    return alpha;
  }

  let current = alpha;
  for (let pass = 0; pass < radius; pass += 1) {
    const next = new Uint8ClampedArray(current.length);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let sum = 0;
        let count = 0;
        for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
          const sampleY = clamp(y + offsetY, 0, height - 1);
          for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
            const sampleX = clamp(x + offsetX, 0, width - 1);
            sum += current[sampleY * width + sampleX];
            count += 1;
          }
        }
        next[y * width + x] = Math.round(sum / count);
      }
    }
    current = next;
  }

  return current;
}

function removeSmallArtifacts(alpha: Uint8ClampedArray, width: number, height: number) {
  const next = new Uint8ClampedArray(alpha);

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      const value = alpha[index];
      if (value === 0 || value > 120) {
        continue;
      }

      let strongNeighbors = 0;
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          if (offsetX === 0 && offsetY === 0) {
            continue;
          }

          const sample = alpha[(y + offsetY) * width + (x + offsetX)];
          if (sample > 96) {
            strongNeighbors += 1;
          }
        }
      }

      if (strongNeighbors <= 1) {
        next[index] = 0;
      }
    }
  }

  return next;
}

function filterForegroundByComponents(
  alpha: Uint8ClampedArray,
  width: number,
  height: number,
  options: ResolvedRemovalOptions,
) {
  const strongMask = createBinaryMaskFromAlpha(alpha, STRONG_ALPHA_THRESHOLD);
  const { labels, components } = findConnectedComponents(strongMask, width, height);
  const selectedComponents = selectPrimaryComponents(
    components,
    width,
    height,
    true,
    options.preset,
    options.removeLogos,
    options.logoRemovalStrength,
    options.experimentalLab,
  );

  if (selectedComponents.length === 0) {
    return alpha;
  }

  const keepIds = new Set(selectedComponents.map((component) => component.id));
  const primary = selectedComponents[0];
  const primaryBounds = getComponentBounds(primary);
  const preserveBounds = getExpandedBounds(
    primaryBounds,
    width,
    height,
    Math.round(primaryBounds.width * (options.removeLogos ? LOGO_PRESERVE_PADDING_RATIO : 0.08)),
    Math.round(primaryBounds.height * (options.removeLogos ? LOGO_PRESERVE_PADDING_RATIO : 0.08)),
  );
  const next = new Uint8ClampedArray(alpha.length);
  for (let index = 0; index < alpha.length; index += 1) {
    if (alpha[index] === 0) {
      continue;
    }

    const label = labels[index];
    if (label !== 0 && keepIds.has(label)) {
      next[index] = alpha[index];
      continue;
    }

    if (label === 0 && alpha[index] >= FOREGROUND_ALPHA_THRESHOLD) {
      const x = index % width;
      const y = Math.floor(index / width);
      const preserved =
        x >= preserveBounds.x &&
        x < preserveBounds.x + preserveBounds.width &&
        y >= preserveBounds.y &&
        y < preserveBounds.y + preserveBounds.height;

      if (preserved) {
        next[index] = alpha[index];
      }
    }
  }

  return next;
}

function removeDetachedPeripheralComponents(
  alpha: Uint8ClampedArray,
  width: number,
  height: number,
  options: ResolvedRemovalOptions,
) {
  if (!options.removeLogos || !options.experimentalLab) {
    return alpha;
  }

  const strongMask = createBinaryMaskFromAlpha(alpha, STRONG_ALPHA_THRESHOLD);
  const { labels, components } = findConnectedComponents(strongMask, width, height);
  const ranked = components
    .filter((component) => component.area / (width * height) >= MIN_COMPONENT_AREA_RATIO)
    .map((component) => ({
      component,
      score: scoreComponent(component, width, height, true, true),
    }))
    .sort((left, right) => right.score - left.score);

  if (ranked.length <= 1) {
    return alpha;
  }

  const primary = ranked[0].component;
  const primaryBounds = getComponentBounds(primary);
  const primaryCenter = getComponentCenter(primary);
  const primaryBoundsArea = Math.max(primaryBounds.width * primaryBounds.height, 1);
  const keepIds = new Set<number>([primary.id]);
  const logoStrengthRatio = options.logoRemovalStrength / 100;
  const detachedDistanceThreshold = DETACHED_COMPONENT_DISTANCE_THRESHOLD - logoStrengthRatio * 0.1;
  const detachedAreaRatio = DETACHED_COMPONENT_AREA_RATIO - logoStrengthRatio * 0.1;
  const detachedBoundsRatio = DETACHED_COMPONENT_MAX_KEEP_RATIO - logoStrengthRatio * 0.025;
  const relaxedBounds = getExpandedBounds(
    primaryBounds,
    width,
    height,
    Math.round(primaryBounds.width * 0.16),
    Math.round(primaryBounds.height * 0.16),
  );

  for (let index = 1; index < ranked.length; index += 1) {
    const component = ranked[index].component;
    const bounds = getComponentBounds(component);
    const center = getComponentCenter(component);
    const areaRatioToPrimary = component.area / Math.max(primary.area, 1);
    const boundsRatioToPrimary = (bounds.width * bounds.height) / primaryBoundsArea;
    const normalizedDistance = Math.sqrt(
      Math.pow((center.x - primaryCenter.x) / Math.max(primaryBounds.width, 1), 2) +
        Math.pow((center.y - primaryCenter.y) / Math.max(primaryBounds.height, 1), 2),
    );
    const intersectsPrimaryNeighborhood = componentIntersectsBounds(component, relaxedBounds);
    const touchesMultipleEdges =
      Number(component.touchesTop || component.touchesBottom) +
        Number(component.touchesLeft || component.touchesRight) >=
      2;
    const likelyDetachedArtifact =
      !intersectsPrimaryNeighborhood &&
      normalizedDistance > detachedDistanceThreshold &&
      areaRatioToPrimary < detachedAreaRatio &&
      boundsRatioToPrimary < detachedBoundsRatio;

    if (likelyDetachedArtifact) {
      continue;
    }

    if (
      touchesMultipleEdges &&
      normalizedDistance > DETACHED_COMPONENT_EDGE_PENALTY_RATIO &&
      areaRatioToPrimary < 0.12
    ) {
      continue;
    }

    keepIds.add(component.id);
  }

  const next = new Uint8ClampedArray(alpha.length);
  for (let index = 0; index < alpha.length; index += 1) {
    if (alpha[index] === 0) {
      continue;
    }

    const label = labels[index];
    if (label !== 0 && keepIds.has(label)) {
      next[index] = alpha[index];
    }
  }

  return next;
}

function recoverFoodPlateSupport(
  alpha: Uint8ClampedArray,
  sourceImageData: ImageData,
  width: number,
  height: number,
  preset: RemovalOptions["preset"],
  suppressPeripheralArtifacts: boolean,
  plateRecoveryStrength: number,
  experimentalLab: boolean,
) {
  const strongMask = createBinaryMaskFromAlpha(alpha, STRONG_ALPHA_THRESHOLD);
  const { labels, components } = findConnectedComponents(strongMask, width, height);
  const selectedComponents = selectPrimaryComponents(
    components,
    width,
    height,
    true,
    preset,
    suppressPeripheralArtifacts,
    50,
    false,
  );
  if (selectedComponents.length === 0) {
    return alpha;
  }

  const keepIds = new Set(selectedComponents.map((component) => component.id));
  const selectedMask = buildMaskFromComponents(labels, keepIds);
  const selectedBounds = boundsFromMask(selectedMask, width, height);
  if (!selectedBounds) {
    return alpha;
  }

  const isTrayPreset = preset === "tray";
  const recoveryRatio = experimentalLab ? plateRecoveryStrength / 100 : 0.5;
  const expandedBounds = getExpandedBounds(
    selectedBounds,
    width,
    height,
    Math.round(selectedBounds.width * (isTrayPreset ? 0.52 + recoveryRatio * 0.22 : 0.38 + recoveryRatio * 0.24)),
    Math.round(selectedBounds.height * (isTrayPreset ? 0.48 + recoveryRatio * 0.22 : 0.32 + recoveryRatio * 0.24)),
  );
  const centerX = selectedBounds.x + selectedBounds.width / 2;
  const centerY = selectedBounds.y + selectedBounds.height / 2;
  const radiusX = Math.max(selectedBounds.width * (0.82 + recoveryRatio * 0.3), width * 0.18);
  const radiusY = Math.max(selectedBounds.height * (0.82 + recoveryRatio * 0.3), height * 0.18);
  const supportCandidates = new Uint8Array(alpha.length);
  const queue = new Int32Array(alpha.length);
  let head = 0;
  let tail = 0;

  for (let y = expandedBounds.y; y < expandedBounds.y + expandedBounds.height; y += 1) {
    for (let x = expandedBounds.x; x < expandedBounds.x + expandedBounds.width; x += 1) {
      const index = y * width + x;
      if (alpha[index] >= FOREGROUND_ALPHA_THRESHOLD) {
        continue;
      }

      if (isTrayPreset) {
        const insideTrayBox =
          x >= selectedBounds.x - Math.round(selectedBounds.width * 0.12) &&
          x < selectedBounds.x + selectedBounds.width + Math.round(selectedBounds.width * 0.12) &&
          y >= selectedBounds.y - Math.round(selectedBounds.height * 0.1) &&
          y < selectedBounds.y + selectedBounds.height + Math.round(selectedBounds.height * 0.18);
        if (!insideTrayBox) {
          continue;
        }
      } else {
        const horizontalAllowance = Math.round(
          selectedBounds.width * (FOOD_SUPPORT_SIDE_ALLOWANCE_RATIO - 0.08 + recoveryRatio * 0.12),
        );
        if (
          x < selectedBounds.x - horizontalAllowance ||
          x >= selectedBounds.x + selectedBounds.width + horizontalAllowance
        ) {
          continue;
        }

        const ellipseX = (x - centerX) / radiusX;
        const ellipseY = (y - centerY) / radiusY;
        if (
          ellipseX * ellipseX + ellipseY * ellipseY >
          FOOD_SUPPORT_ELLIPSE_THRESHOLD - 0.12 + recoveryRatio * 0.2
        ) {
          continue;
        }
        if (
          y < selectedBounds.y - Math.round(selectedBounds.height * FOOD_SUPPORT_TOP_ALLOWANCE_RATIO) ||
          y >
            selectedBounds.y +
              selectedBounds.height +
              Math.round(selectedBounds.height * (FOOD_SUPPORT_BOTTOM_ALLOWANCE_RATIO - 0.08 + recoveryRatio * 0.16))
        ) {
          continue;
        }
      }

      const pixelIndex = index * 4;
      const brightness = brightnessAt(sourceImageData.data, pixelIndex);
      const saturation = saturationAt(sourceImageData.data, pixelIndex);
      const edgeStrength = edgeStrengthAt(sourceImageData, x, y);
      const brightnessMin = isTrayPreset ? TRAY_SUPPORT_BRIGHTNESS_MIN : SUPPORT_BRIGHTNESS_MIN;
      const saturationMax = isTrayPreset ? TRAY_SUPPORT_SATURATION_MAX : SUPPORT_SATURATION_MAX;
      const edgeStrengthMax = isTrayPreset ? TRAY_SUPPORT_EDGE_MAX : SUPPORT_EDGE_BLOCK_THRESHOLD;
      if (
        brightness < brightnessMin ||
        saturation > saturationMax ||
        edgeStrength > edgeStrengthMax
      ) {
        continue;
      }

      supportCandidates[index] = 1;
    }
  }

  const downwardGap = Math.max(
    6,
    Math.round(selectedBounds.height * (SUPPORT_SEED_DOWNWARD_RATIO - 0.08 + recoveryRatio * 0.12)),
  );
  const sideGap = Math.max(
    4,
    Math.round(selectedBounds.width * (SUPPORT_SEED_SIDE_RATIO - 0.08 + recoveryRatio * 0.12)),
  );
  const upwardGap = Math.max(4, Math.round(selectedBounds.height * SUPPORT_SEED_UPWARD_RATIO));

  for (let x = selectedBounds.x; x < selectedBounds.x + selectedBounds.width; x += 1) {
    let minY = -1;
    let maxY = -1;
    for (let y = selectedBounds.y; y < selectedBounds.y + selectedBounds.height; y += 1) {
      const index = y * width + x;
      if (selectedMask[index] === 0) {
        continue;
      }
      minY = minY === -1 ? y : minY;
      maxY = y;
    }

    if (maxY === -1) {
      continue;
    }

    for (let step = 1; step <= downwardGap; step += 1) {
      const sampleY = maxY + step;
      if (sampleY >= expandedBounds.y + expandedBounds.height) {
        break;
      }

      const sampleIndex = sampleY * width + x;
      if (supportCandidates[sampleIndex] === 1) {
        supportCandidates[sampleIndex] = 2;
        queue[tail++] = sampleIndex;
        break;
      }
    }

    if (!isTrayPreset && preset !== "food" && minY !== -1) {
      const isCenterColumn =
        x >= selectedBounds.x + Math.round(selectedBounds.width * 0.18) &&
        x <= selectedBounds.x + Math.round(selectedBounds.width * 0.82);
      if (!isCenterColumn) {
        continue;
      }

      for (let step = 1; step <= upwardGap; step += 1) {
        const sampleY = minY - step;
        if (sampleY < expandedBounds.y) {
          break;
        }

        const sampleIndex = sampleY * width + x;
        if (supportCandidates[sampleIndex] === 1) {
          supportCandidates[sampleIndex] = 2;
          queue[tail++] = sampleIndex;
          break;
        }
      }
    }
  }

  for (let y = selectedBounds.y + Math.round(selectedBounds.height * 0.25); y < selectedBounds.y + selectedBounds.height; y += 1) {
    let minX = -1;
    let maxX = -1;
    for (let x = selectedBounds.x; x < selectedBounds.x + selectedBounds.width; x += 1) {
      const index = y * width + x;
      if (selectedMask[index] === 0) {
        continue;
      }
      minX = minX === -1 ? x : minX;
      maxX = x;
    }

    if (minX === -1 || maxX === -1) {
      continue;
    }

    for (let step = 1; step <= sideGap; step += 1) {
      const leftX = minX - step;
      if (leftX >= expandedBounds.x) {
        const leftIndex = y * width + leftX;
        if (supportCandidates[leftIndex] === 1) {
          supportCandidates[leftIndex] = 2;
          queue[tail++] = leftIndex;
          break;
        }
      }
    }

    for (let step = 1; step <= sideGap; step += 1) {
      const rightX = maxX + step;
      if (rightX < expandedBounds.x + expandedBounds.width) {
        const rightIndex = y * width + rightX;
        if (supportCandidates[rightIndex] === 1) {
          supportCandidates[rightIndex] = 2;
          queue[tail++] = rightIndex;
          break;
        }
      }
    }
  }

  while (head < tail) {
    const current = queue[head++];
    const x = current % width;
    const y = Math.floor(current / width);

    for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        if (offsetX === 0 && offsetY === 0) {
          continue;
        }

        const sampleX = x + offsetX;
        const sampleY = y + offsetY;
        if (
          sampleX < expandedBounds.x ||
          sampleX >= expandedBounds.x + expandedBounds.width ||
          sampleY < expandedBounds.y ||
          sampleY >= expandedBounds.y + expandedBounds.height
        ) {
          continue;
        }

        const sampleIndex = sampleY * width + sampleX;
        if (supportCandidates[sampleIndex] !== 1) {
          continue;
        }

        supportCandidates[sampleIndex] = 2;
        queue[tail++] = sampleIndex;
      }
    }
  }

  const recovered = new Uint8ClampedArray(alpha);
  for (let index = 0; index < recovered.length; index += 1) {
    if (supportCandidates[index] === 2) {
      recovered[index] = Math.max(recovered[index], 242);
    }
  }

  return recovered;
}

function restoreRecoveredSupportColors(
  alpha: Uint8ClampedArray,
  imageData: ImageData,
  sourceImageData: ImageData,
  preset: RemovalOptions["preset"],
) {
  const { data } = imageData;
  const sourceData = sourceImageData.data;
  const isTrayPreset = preset === "tray";
  const brightnessMin = isTrayPreset ? TRAY_SUPPORT_BRIGHTNESS_MIN : SUPPORT_BRIGHTNESS_MIN;
  const saturationMax = isTrayPreset ? TRAY_SUPPORT_SATURATION_MAX : SUPPORT_SATURATION_MAX;

  for (let pixelIndex = 0; pixelIndex < alpha.length; pixelIndex += 1) {
    const nextAlpha = alpha[pixelIndex];
    if (nextAlpha < 180) {
      continue;
    }

    const index = pixelIndex * 4;
    const currentBrightness = brightnessAt(data, index);
    const currentSaturation = saturationAt(data, index);
    const sourceBrightness = brightnessAt(sourceData, index);
    const sourceSaturation = saturationAt(sourceData, index);

    const looksLikeRecoveredBlackArtifact =
      currentBrightness < 48 &&
      currentSaturation < 36 &&
      sourceBrightness >= brightnessMin &&
      sourceSaturation <= saturationMax;

    if (!looksLikeRecoveredBlackArtifact) {
      continue;
    }

    data[index] = sourceData[index];
    data[index + 1] = sourceData[index + 1];
    data[index + 2] = sourceData[index + 2];
  }
}

async function refineEdges(blob: Blob, sourceImageData: ImageData | null, options: ResolvedRemovalOptions) {
  const bitmap = await loadImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("가장자리 보정용 캔버스를 생성할 수 없습니다.");
  }

  context.drawImage(bitmap, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;
  const width = canvas.width;
  const height = canvas.height;
  const profile = getProfileForPreset(options.preset);
  const { weakAlphaCutoff, alphaBoostUpperBound, alphaBoostFactor } = profile;
  let alpha: Uint8ClampedArray<ArrayBufferLike> = new Uint8ClampedArray(width * height);

  for (let index = 0; index < alpha.length; index += 1) {
    alpha[index] = data[index * 4 + 3];
  }

  alpha = applyMaskInset(alpha, width, height, options.maskInset);
  alpha = filterForegroundByComponents(alpha, width, height, options);

  if ((options.preset === "food" || options.preset === "tray") && sourceImageData) {
    alpha = recoverFoodPlateSupport(
      alpha,
      sourceImageData,
      width,
      height,
      options.preset,
      options.removeLogos,
      options.plateRecoveryStrength,
      options.experimentalLab,
    );
  }

  if (
    sourceImageData &&
    options.experimentalLab &&
    options.removeLogos &&
    options.preset !== "food" &&
    options.preset !== "tray"
  ) {
    const subjectPrior = getPrimarySubjectMask(
      sourceImageData,
      options.preset,
      true,
      options.logoRemovalStrength,
      options.experimentalLab,
    );
    if (subjectPrior) {
      alpha = constrainAlphaToSubjectPrior(alpha, subjectPrior.mask);
    }
  }

  alpha = removeDetachedPeripheralComponents(alpha, width, height, options);

  if (options.removeSmallArtifacts) {
    alpha = removeSmallArtifacts(alpha, width, height);
  }

  if (options.edgeFeather > 0) {
    alpha = blurAlpha(alpha, width, height, options.edgeFeather);
  }

  if ((options.preset === "food" || options.preset === "tray") && sourceImageData) {
    restoreRecoveredSupportColors(alpha, imageData, sourceImageData, options.preset);
  }

  for (let index = 0; index < data.length; index += 4) {
    const pixelIndex = index / 4;
    const nextAlpha = alpha[pixelIndex];
    const y = Math.floor(pixelIndex / width);
    const channelRed = data[index];
    const channelGreen = data[index + 1];
    const channelBlue = data[index + 2];
    const maxChannel = Math.max(channelRed, channelGreen, channelBlue);
    const minChannel = Math.min(channelRed, channelGreen, channelBlue);
    const saturation = maxChannel - minChannel;
    const brightness = (channelRed + channelGreen + channelBlue) / 3;

    if (nextAlpha === 0) {
      data[index] = 0;
      data[index + 1] = 0;
      data[index + 2] = 0;
      data[index + 3] = 0;
      continue;
    }

    let processedAlpha = nextAlpha;
    if (processedAlpha < weakAlphaCutoff) {
      data[index + 3] = 0;
      continue;
    }

    const alphaRatio = processedAlpha / 255;
    if (processedAlpha < 255) {
      const decontamFactor =
        alphaRatio +
        (1 - alphaRatio) * clamp(0.16 + options.translucencyProtection * 0.54, 0.16, 0.7);
      const haloFactor = 1 - (1 - alphaRatio) * options.haloSuppression * 0.92;
      const preserveFactor = Math.max(decontamFactor, haloFactor);
      data[index] = Math.round(data[index] * preserveFactor);
      data[index + 1] = Math.round(data[index + 1] * preserveFactor);
      data[index + 2] = Math.round(data[index + 2] * preserveFactor);
    }

    if (
      options.shadowSuppression > 0 &&
      y > height * 0.55 &&
      processedAlpha < 170 &&
      saturation < 26 &&
      brightness < 220
    ) {
      const bottomWeight = (y - height * 0.55) / (height * 0.45);
      const suppression = options.shadowSuppression * bottomWeight * 0.55;
      processedAlpha = Math.max(0, Math.round(processedAlpha * (1 - suppression)));
    }

    if (processedAlpha > 0 && processedAlpha < alphaBoostUpperBound) {
      const boost = alphaBoostFactor + options.haloSuppression * 0.06;
      processedAlpha = Math.min(255, Math.round(processedAlpha * boost));
    }

    data[index + 3] = processedAlpha;
  }

  context.putImageData(imageData, 0, 0);
  return canvasToBlob(canvas, "image/png");
}

async function analyzeAlpha(blob: Blob): Promise<AlphaStats> {
  const bitmap = await loadImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("알파 분석용 캔버스를 생성할 수 없습니다.");
  }

  context.drawImage(bitmap, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;
  const alpha: Uint8ClampedArray<ArrayBufferLike> = new Uint8ClampedArray(canvas.width * canvas.height);
  let nonZeroAlphaCount = 0;
  let strongAlphaCount = 0;
  let maxAlpha = 0;
  let minX = canvas.width;
  let minY = canvas.height;
  let maxX = -1;
  let maxY = -1;

  for (let index = 0; index < alpha.length; index += 1) {
    const alphaValue = data[index * 4 + 3];
    alpha[index] = alphaValue;
    if (alphaValue > 0) {
      nonZeroAlphaCount += 1;
      maxAlpha = Math.max(maxAlpha, alphaValue);
    }

    if (alphaValue >= STRONG_ALPHA_THRESHOLD) {
      strongAlphaCount += 1;
      const x = index % canvas.width;
      const y = Math.floor(index / canvas.width);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  const strongMask = createBinaryMaskFromAlpha(alpha, STRONG_ALPHA_THRESHOLD);
  const { components } = findConnectedComponents(strongMask, canvas.width, canvas.height);
  const largestComponentArea = components.reduce((largest, component) => Math.max(largest, component.area), 0);
  const boundsWidth = maxX >= minX ? maxX - minX + 1 : 0;
  const boundsHeight = maxY >= minY ? maxY - minY + 1 : 0;
  const boundsCoverage = (boundsWidth * boundsHeight) / (canvas.width * canvas.height);

  return {
    coverage: nonZeroAlphaCount / (canvas.width * canvas.height),
    maxAlpha,
    strongCoverage: strongAlphaCount / (canvas.width * canvas.height),
    boundsCoverage,
    componentCount: components.length,
    largestComponentCoverage: largestComponentArea / (canvas.width * canvas.height),
  };
}

function isEffectivelyEmptyCutout(stats: AlphaStats, preset: ResolvedRemovalOptions["preset"]) {
  const profile = getProfileForPreset(preset);

  if (preset === "food" || preset === "tray") {
    const hasVisibleForeground =
      stats.coverage >= profile.emptyCoverageThreshold * 0.55 &&
      stats.strongCoverage >= profile.strongCoverageThreshold * 0.5 &&
      stats.maxAlpha >= profile.maxAlphaThreshold &&
      stats.largestComponentCoverage >= 0.012;

    if (hasVisibleForeground) {
      return false;
    }

    return (
      stats.coverage < profile.emptyCoverageThreshold * 0.35 ||
      stats.strongCoverage < profile.strongCoverageThreshold * 0.3 ||
      stats.maxAlpha < profile.maxAlphaThreshold ||
      stats.largestComponentCoverage < 0.008
    );
  }

  if (
    stats.coverage < profile.emptyCoverageThreshold ||
    stats.strongCoverage < profile.strongCoverageThreshold ||
    stats.boundsCoverage < profile.boundsCoverageThreshold ||
    stats.maxAlpha < profile.maxAlphaThreshold
  ) {
    return true;
  }

  return stats.componentCount > 10 || stats.largestComponentCoverage < 0.004;
}

async function removeWithSession(source: Blob, sourceImageData: ImageData | null, options: ResolvedRemovalOptions) {
  await ensureBackgroundRemovalReady();
  const preferredModels = getPreferredModelsForPreset(options.preset, options.experimentalLab);
  let lastError: unknown = null;

  for (const modelName of preferredModels) {
    try {
      const session = await getSessionForModel(modelName);
      const result = (await remove(source, {
        session,
        postProcessMask: true,
      })) as Blob;

      const processedResult = options.edgeRefinement
        ? await refineEdges(result, sourceImageData, options)
        : result;
      const stats = await analyzeAlpha(processedResult);

      if (shouldEscalateModelAttempt(stats, modelName, options)) {
        continue;
      }

      return processedResult;
    } catch (error) {
      lastError = error;
      console.warn(`background removal model failed: ${modelName}`, error);
    }
  }

  throw lastError ?? new Error("사용 가능한 누끼 모델을 찾지 못했습니다.");
}

function getBackgroundRemovalFailureReason(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalizedMessage = message.toLowerCase();

  if (
    normalizedMessage.includes("fetch") ||
    normalizedMessage.includes("404") ||
    normalizedMessage.includes("failed to load") ||
    normalizedMessage.includes("u2netp") ||
    normalizedMessage.includes(".wasm")
  ) {
    return "누끼 모델 파일을 불러오지 못했습니다. 모델 경로나 배포 파일을 확인해 주세요.";
  }

  if (
    normalizedMessage.includes("sharedarraybuffer") ||
    normalizedMessage.includes("cross-origin") ||
    normalizedMessage.includes("thread") ||
    normalizedMessage.includes("pthread")
  ) {
    return "현재 브라우저 환경에서 로컬 AI 누끼 모델 실행이 막혀 있습니다. 다른 브라우저를 사용하거나 수동 누끼 사이트를 이용해 주세요.";
  }

  if (
    normalizedMessage.includes("createimagebitmap") ||
    normalizedMessage.includes("imagebitmap") ||
    normalizedMessage.includes("decode")
  ) {
    return "이미지 파일을 브라우저에서 해석하지 못했습니다. 다른 형식으로 다시 저장한 뒤 업로드해 주세요.";
  }

  if (normalizedMessage.includes("memory") || normalizedMessage.includes("out of memory")) {
    return "브라우저 메모리가 부족해 누끼 처리를 완료하지 못했습니다. 큰 이미지는 크기를 줄여 다시 시도해 주세요.";
  }

  return "모델 파일 또는 브라우저 환경 확인이 필요합니다.";
}

export async function removeImageBackground(file: Blob, options?: RemovalOptions) {
  try {
    const resolvedOptions = resolveRemovalOptions(options);
    const sourceBitmap = await loadImageBitmap(file);
    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = sourceBitmap.width;
    sourceCanvas.height = sourceBitmap.height;
    const sourceContext = sourceCanvas.getContext("2d");

    if (!sourceContext) {
      throw new Error("원본 이미지를 읽을 수 없습니다.");
    }

    sourceContext.drawImage(sourceBitmap, 0, 0);
    const sourceImageData = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
    const cropBounds = calculateSubjectBounds(
      sourceImageData,
      resolvedOptions.preset,
      resolvedOptions.removeLogos,
      resolvedOptions.logoRemovalStrength,
      resolvedOptions.experimentalLab,
    );

    if (!cropBounds) {
      const result = await removeWithSession(file, sourceImageData, resolvedOptions);
      const stats = await analyzeAlpha(result);
      return resolvedOptions.fallbackToOriginal && isEffectivelyEmptyCutout(stats, resolvedOptions.preset)
        ? file
        : result;
    }

    const croppedSource = await cropSource(file, cropBounds);
    const croppedCanvas = document.createElement("canvas");
    croppedCanvas.width = cropBounds.width;
    croppedCanvas.height = cropBounds.height;
    const croppedContext = croppedCanvas.getContext("2d");
    if (!croppedContext) {
      throw new Error("크롭 이미지를 읽을 수 없습니다.");
    }

    croppedContext.drawImage(
      sourceCanvas,
      cropBounds.x,
      cropBounds.y,
      cropBounds.width,
      cropBounds.height,
      0,
      0,
      cropBounds.width,
      cropBounds.height,
    );
    const croppedImageData = croppedContext.getImageData(0, 0, cropBounds.width, cropBounds.height);
    const croppedResult = await removeWithSession(croppedSource, croppedImageData, resolvedOptions);
    const restoredResult = await restoreCropToOriginalSize(
      croppedResult,
      { width: sourceCanvas.width, height: sourceCanvas.height },
      cropBounds,
    );
    const restoredStats = await analyzeAlpha(restoredResult);
    return resolvedOptions.fallbackToOriginal && isEffectivelyEmptyCutout(restoredStats, resolvedOptions.preset)
      ? file
      : restoredResult;
  } catch (error) {
    console.error("background removal failed", error);
    throw new Error(`자동 누끼 처리에 실패했습니다. ${getBackgroundRemovalFailureReason(error)}`);
  }
}

export async function createWhiteBackgroundPreview(blob: Blob) {
  const bitmap = await loadImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("미리보기를 생성할 수 없습니다.");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0);
  return canvasToBlob(canvas, "image/png");
}

export async function getImageDataFromBlob(blob: Blob) {
  const bitmap = await loadImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("이미지 데이터를 읽을 수 없습니다.");
  }

  context.drawImage(bitmap, 0, 0);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

export function getCanvasFromImageData(imageData: ImageData) {
  return imageDataToCanvas(imageData);
}
