import {
  Dumbbell,
  Flower2,
  Focus,
  Footprints,
  HeartPulse,
  Moon,
  Salad,
  Scale,
  Sun,
  Wind,
} from "lucide-react";
const icons: Record<string, any> = {
  "feel-calmer": Wind,
  "lift-your-mood": Sun,
  "sleep-better": Moon,
  "focus-and-habits": Focus,
  "eat-for-a-condition": HeartPulse,
  "healthy-weight": Scale,
  "eat-better": Salad,
  "get-stronger": Dumbbell,
  "move-more": Footprints,
  "ease-and-flexibility": Flower2,
};
export function NeedIcon({ slug, size = 24 }: { slug: string; size?: number }) {
  const Icon = icons[slug] || HeartPulse;
  return <Icon size={size} strokeWidth={1.7} />;
}
