// Per-vertical switches. "soon" shows a coming-soon entry; "off" hides the vertical.
export type FeatureStatus = "live" | "soon" | "off";
export type Feature =
  | "mental"
  | "nutrition"
  | "fitness"
  | "store"
  | "medicines"
  | "protect"
  | "content";
const defaults: Record<Feature, FeatureStatus> = {
  mental: "live",
  nutrition: "live",
  fitness: "live",
  store: "live",
  medicines: "soon",
  protect: "soon",
  content: "off",
};
// Regulated verticals need licences and partners before they can be offered.
const regulated: Feature[] = ["medicines", "protect"];
// Optional overrides, e.g. NEXT_PUBLIC_CHATBUD_FEATURES="fitness=live,content=soon".
function resolve(
  feature: Feature,
  fallback: FeatureStatus,
  override: string | undefined,
): FeatureStatus {
  if (override === undefined) return fallback;
  if (!["live", "soon", "off"].includes(override)) {
    console.warn(`Ignoring unknown status "${override}" for ${feature}`);
    return fallback;
  }
  // Launching a regulated vertical is a code change, never a setting.
  if (override === "live" && regulated.includes(feature)) return fallback;
  return override as FeatureStatus;
}
const overrides = Object.fromEntries(
  (process.env.NEXT_PUBLIC_CHATBUD_FEATURES || "")
    .split(",")
    .map((pair) => pair.trim().split("="))
    .filter((pair) => pair.length === 2),
) as Record<string, string>;
export const features = Object.fromEntries(
  (Object.keys(defaults) as Feature[]).map((feature) => [
    feature,
    resolve(feature, defaults[feature], overrides[feature]),
  ]),
) as Record<Feature, FeatureStatus>;
