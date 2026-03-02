import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase-client";

function emailDomain(email) {
  if (!email || !email.includes("@")) return "";
  return email.trim().toLowerCase().split("@").pop() || "";
}

function claimsGrantAdmin(claims) {
  if (!claims || typeof claims !== "object") return false;
  if (claims.admin === true) return true;

  if (typeof claims.role === "string" && claims.role.toLowerCase() === "admin") {
    return true;
  }

  if (Array.isArray(claims.roles)) {
    return claims.roles.some(
      (entry) => typeof entry === "string" && entry.toLowerCase() === "admin"
    );
  }

  return false;
}

function claimsGrantLocationAdmin(claims) {
  if (!claims || typeof claims !== "object") return false;
  const role = typeof claims.role === "string" ? claims.role.toLowerCase().trim() : "";
  if (role === "location-admin" || role === "location_admin") return true;
  if (Array.isArray(claims.roles)) {
    return claims.roles.some(
      (entry) =>
        typeof entry === "string" &&
        ["location-admin", "location_admin"].includes(entry.toLowerCase().trim())
    );
  }
  return false;
}

function normalizeRole(value) {
  const role = (value || "").toString().toLowerCase().trim();
  if (role === "admin") return "admin";
  if (role === "location-admin" || role === "location_admin") return "location-admin";
  return "";
}

function normalizeLocation(value) {
  return (value || "").toString().trim();
}

function profileRole(profile) {
  if (!profile || typeof profile !== "object") return "";
  return (
    normalizeRole(profile.role) ||
    normalizeRole(profile.typeLower) ||
    normalizeRole(profile.type)
  );
}

function profileLocation(profile) {
  if (!profile || typeof profile !== "object") return "";
  return normalizeLocation(profile.location || profile.programLocation);
}

function emailCandidates(email) {
  if (!email || !email.includes("@")) return [];
  const lower = email.trim().toLowerCase();
  const safe = lower.replace(/[.@]/g, "_");
  return [lower, safe].filter(Boolean);
}

async function loadProfileByEmail(email) {
  const candidates = emailCandidates(email);
  for (const id of candidates) {
    try {
      const snap = await getDoc(doc(db, "user_profile", id));
      if (snap.exists()) {
        return snap.data() || {};
      }
    } catch {
      // Keep auth gating resilient if profile lookup fails.
    }
  }
  return null;
}

export async function resolveDashboardAccess(user) {
  if (!user) {
    return { allowed: false, role: "", location: "", reason: "missing-user" };
  }

  const email = (user.email || "").toLowerCase().trim();
  let claims = {};
  try {
    const tokenResult = await user.getIdTokenResult(true);
    claims = tokenResult?.claims || {};
  } catch {
    claims = {};
  }

  const roleFromClaims = claimsGrantAdmin(claims)
    ? "admin"
    : claimsGrantLocationAdmin(claims)
      ? "location-admin"
      : "";
  const locationFromClaims = normalizeLocation(claims.location);

  if (roleFromClaims === "admin") {
    return { allowed: true, role: "admin", location: "", reason: "claims-admin" };
  }

  if (roleFromClaims === "location-admin") {
    if (locationFromClaims) {
      return { allowed: true, role: "location-admin", location: locationFromClaims, reason: "claims-location-admin" };
    }
  }

  const profile = await loadProfileByEmail(email);
  const roleFromProfile = profileRole(profile);
  const locationFromProfile = profileLocation(profile);

  if (roleFromProfile === "admin") {
    return { allowed: true, role: "admin", location: "", reason: "profile-admin" };
  }

  if (roleFromProfile === "location-admin") {
    if (!locationFromProfile) {
      return { allowed: false, role: "location-admin", location: "", reason: "missing-location-profile" };
    }
    return { allowed: true, role: "location-admin", location: locationFromProfile, reason: "profile-location-admin" };
  }

  if (emailDomain(email) === "aspirecounselingservice.com") {
    return { allowed: true, role: "admin", location: "", reason: "temporary-domain-whitelist" };
  }

  return { allowed: false, role: "", location: "", reason: "unauthorized" };
}

export async function hasAdminAccess(user) {
  const access = await resolveDashboardAccess(user);
  return access.allowed;
}
