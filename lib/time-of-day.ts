export type TimeOfDay = "morning" | "midday" | "evening" | "night";

// Shared classifier so the hero background and the greeting can never
// disagree about which window applies.
export function getTimeOfDay(hour: number): TimeOfDay {
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 11 && hour < 16) return "midday";
  if (hour >= 16 && hour < 20) return "evening";
  return "night";
}
