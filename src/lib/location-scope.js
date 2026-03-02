import { canonicalCity } from "@/lib/locations";

export function normalizeLocation(value) {
  return (value || "").toString().trim().toLowerCase();
}

export function matchesScopedLocation(candidate, scopedLocation) {
  if (!scopedLocation) return true;
  return canonicalCity(candidate) === canonicalCity(scopedLocation);
}

export function profileLocation(profile) {
  const location = (profile?.location || "").toString().trim();
  const programLocation = (profile?.programLocation || "").toString().trim();
  return location || programLocation || "Unassigned Location";
}
