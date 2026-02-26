export const TRUSTED_ADMIN_DOMAINS = [
  "aspirecounselingservice.com",
  "aspirecounselingservices.com",
];

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

export async function hasAdminAccess(user) {
  if (!user) return false;

  try {
    const tokenResult = await user.getIdTokenResult(true);
    const claims = tokenResult?.claims || {};
    return claimsGrantAdmin(claims) || TRUSTED_ADMIN_DOMAINS.includes(emailDomain(user.email));
  } catch {
    return TRUSTED_ADMIN_DOMAINS.includes(emailDomain(user.email));
  }
}
