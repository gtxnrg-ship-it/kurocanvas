export interface DeviceAssessment {
  environment: "android" | "ios" | "desktop" | "unknown";
  browser: string;
  platformLabel: string;
  cores?: number;
  deviceMemoryGiB?: number;
  storageQuotaBytes?: number;
  storageUsageBytes?: number;
  webAssembly: boolean;
  webGPU: boolean;
  secureContext: boolean;
  confidence: "limited" | "moderate";
  notes: string[];
}
type NavigatorHints = Navigator & { deviceMemory?: number; hardwareConcurrency?: number; userAgentData?: { platform?: string; mobile?: boolean } };
type StorageEstimate = { quota?: number; usage?: number };

export async function assessDevice(): Promise<DeviceAssessment> {
  const nav = typeof navigator === "undefined" ? undefined : navigator as NavigatorHints;
  const ua = nav?.userAgent ?? "";
  const platform = nav?.userAgentData?.platform ?? nav?.platform ?? "";
  const environment: DeviceAssessment["environment"] =
    /android/i.test(ua) || /android/i.test(platform) ? "android" :
    /iphone|ipad|ipod/i.test(ua) || (/mac/i.test(platform) && (nav?.maxTouchPoints ?? 0) > 1) ? "ios" :
    nav ? "desktop" : "unknown";
  let storageQuotaBytes: number | undefined;
  let storageUsageBytes: number | undefined;
  try {
    const estimate = await nav?.storage?.estimate() as StorageEstimate | undefined;
    storageQuotaBytes = estimate?.quota;
    storageUsageBytes = estimate?.usage;
  } catch { /* storage estimates are optional and browser-controlled */ }
  const notes = [
    "Browser APIs do not reliably expose exact phone model, RAM currently free, thermal state, or battery throttling.",
    "Performance rating stays provisional until this exact model/runtime completes a real benchmark."
  ];
  if (nav?.deviceMemory === undefined) notes.push("This browser does not expose device memory; Kuro will use conservative estimates.");
  if (!(nav as Navigator & { gpu?: unknown } | undefined)?.gpu) notes.push("WebGPU is not available or not exposed in this environment.");
  return {
    environment,
    browser: /edg\//i.test(ua) ? "Edge" : /firefox\//i.test(ua) ? "Firefox" : /chrome\//i.test(ua) ? "Chromium browser" : /safari/i.test(ua) ? "Safari" : "Unknown browser",
    platformLabel: platform || environment,
    cores: nav?.hardwareConcurrency,
    deviceMemoryGiB: nav?.deviceMemory,
    storageQuotaBytes,
    storageUsageBytes,
    webAssembly: typeof WebAssembly !== "undefined",
    webGPU: Boolean((nav as Navigator & { gpu?: unknown } | undefined)?.gpu),
    secureContext: typeof isSecureContext !== "undefined" ? isSecureContext : false,
    confidence: nav?.deviceMemory === undefined ? "limited" : "moderate",
    notes
  };
}
