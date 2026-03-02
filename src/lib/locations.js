export const LOCATION_OPTIONS = [
  "Bakersfield, California",
  "Fresno, California",
  "San Luis Obispo, California",
  "Santa Clarita, California",
  "Simi Valley, California",
  "Victorville, California",
];

export function canonicalCity(value) {
  const raw = (value || "").toString().trim().toLowerCase();
  if (!raw) return "";

  if (raw.startsWith("bakersfield")) return "bakersfield";
  if (raw.startsWith("fresno")) return "fresno";
  if (raw.startsWith("san luis obispo")) return "san luis obispo";
  if (raw.startsWith("santa clarita")) return "santa clarita";
  if (raw.startsWith("simi valley")) return "simi valley";
  if (raw.startsWith("victorville")) return "victorville";

  return raw.replace(/,\s*california$/i, "").trim();
}

export function locationVariants(value) {
  const city = canonicalCity(value);
  if (!city) return [];

  const map = {
    bakersfield: [
      "Bakersfield, California",
      "Bakersfield",
      "Bakersfield SUD",
      "Bakersfield ABH",
    ],
    fresno: ["Fresno, California", "Fresno"],
    "san luis obispo": ["San Luis Obispo, California", "San Luis Obispo"],
    "santa clarita": ["Santa Clarita, California", "Santa Clarita"],
    "simi valley": ["Simi Valley, California", "Simi Valley"],
    victorville: ["Victorville, California", "Victorville"],
  };

  return map[city] || [];
}
