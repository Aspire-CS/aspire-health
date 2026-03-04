export const LOCATION_OPTIONS_PATIENTS = [
  "Bakersfield SUD",
  "Bakersfield ABH",
  "Fresno",
  "San Luis Obispo",
  "Santa Clarita",
  "Simi Valley",
  "Victorville",
];

export const AGE_GROUP_OPTIONS = ["Adult", "Teen"];
export const TRACK_OPTIONS = ["Substance", "Behavioral"];

const TRACK_ALIASES = {
  sud: "Substance",
  substance: "Substance",
  bh: "Behavioral",
  behavioral: "Behavioral",
};

const PROGRAM_TEMPLATES = {
  "Adult IOP": { displayName: "Adult IOP", weeks: 12 },
  "Teen IOP": { displayName: "Teen IOP", weeks: 12 },
  "Adult PHP (SUD)": { displayName: "Adult PHP", weeks: 36 },
  "Teen PHP (SUD)": { displayName: "Teen PHP", weeks: 36 },
  "Adult IOP AM": { displayName: "Adult IOP AM", weeks: 12 },
  "Adult IOP PM": { displayName: "Adult IOP PM", weeks: 12 },
  "Adult PHP (BH)": { displayName: "Adult PHP", weeks: 36 },
  "Teen A IOP": { displayName: "Teen A IOP", weeks: 12 },
  "Teen B IOP": { displayName: "Teen B IOP", weeks: 12 },
  "Teen C IOP": { displayName: "Teen C IOP", weeks: 12 },
  "Teen PHP (BH)": { displayName: "Teen PHP", weeks: 36 },
};

const LOCATION_MATRIX = {
  "Bakersfield SUD": {
    Adult: {
      Substance: ["Adult IOP", "Adult PHP (SUD)"],
    },
    Teen: {
      Substance: ["Teen IOP", "Teen PHP (SUD)"],
    },
  },
  "Bakersfield ABH": {
    Adult: {
      Behavioral: ["Adult IOP AM", "Adult IOP PM", "Adult PHP (BH)"],
    },
    Teen: {
      Behavioral: ["Teen A IOP", "Teen B IOP", "Teen C IOP", "Teen PHP (BH)"],
    },
  },
  Fresno: {},
  "San Luis Obispo": {},
  "Santa Clarita": {},
  "Simi Valley": {},
  Victorville: {},
};

export function canonicalTrack(value) {
  const key = (value || "").toString().trim().toLowerCase();
  if (!key) return "";
  return TRACK_ALIASES[key] || value.toString().trim();
}

export function canonicalAgeGroup(value) {
  const key = (value || "").toString().trim().toLowerCase();
  if (!key) return "";
  if (key === "adult") return "Adult";
  if (key === "teen") return "Teen";
  return value.toString().trim();
}

export function normalizeProgramLocation(value) {
  const key = (value || "").toString().trim().toLowerCase();
  if (!key) return "";
  if (key.startsWith("bakersfield") && key.includes("sud")) return "Bakersfield SUD";
  if (key.startsWith("bakersfield") && key.includes("abh")) return "Bakersfield ABH";
  if (key.startsWith("bakersfield")) return "Bakersfield SUD";
  if (key.startsWith("fresno")) return "Fresno";
  if (key.startsWith("san luis obispo")) return "San Luis Obispo";
  if (key.startsWith("santa clarita")) return "Santa Clarita";
  if (key.startsWith("simi valley")) return "Simi Valley";
  if (key.startsWith("victorville")) return "Victorville";
  return (value || "").toString().trim();
}

export function availablePrograms({ location, ageGroup, track }) {
  const normalizedLocation = normalizeProgramLocation(location);
  const normalizedAgeGroup = canonicalAgeGroup(ageGroup);
  const normalizedTrack = canonicalTrack(track);
  const programs = LOCATION_MATRIX?.[normalizedLocation]?.[normalizedAgeGroup]?.[normalizedTrack] || [];
  return [...programs].sort((a, b) => a.localeCompare(b));
}

export function programDisplayName(programName) {
  return PROGRAM_TEMPLATES?.[programName]?.displayName || programName;
}

export function programWeeks(programName) {
  return PROGRAM_TEMPLATES?.[programName]?.weeks || null;
}
