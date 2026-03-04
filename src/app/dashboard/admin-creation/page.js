"use client";

import { useEffect, useMemo, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase-client";
import { useDashboardAccess } from "@/lib/dashboard-access-context";
import { LOCATION_OPTIONS } from "@/lib/locations";
import styles from "./page.module.css";

export default function AdminCreationPage() {
  const { isFullAdmin } = useDashboardAccess();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [location, setLocation] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [migrationBusy, setMigrationBusy] = useState(false);
  const [migrationMessage, setMigrationMessage] = useState("");
  const [migrationError, setMigrationError] = useState("");

  useEffect(() => {
    if (isFullAdmin) {
      setLocation((prev) => prev || LOCATION_OPTIONS[0]);
    }
  }, [isFullAdmin]);

  const canSubmit = useMemo(() => {
    return (
      isFullAdmin &&
      !saving &&
      email.trim().includes("@") &&
      LOCATION_OPTIONS.includes(location)
    );
  }, [email, isFullAdmin, location, saving]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canSubmit) return;

    setSaving(true);
    setMessage("");
    setError("");

    try {
      const createUser = httpsCallable(functions, "adminCreateUserAndNotify");
      const payload = {
        email: email.trim().toLowerCase(),
        displayName: displayName.trim() || undefined,
        tempPassword: tempPassword.trim() || undefined,
        role: "location-admin",
        extra: {
          type: "location-admin",
          location,
        },
      };

      await createUser(payload);
      setMessage(`Created/updated location-admin for ${payload.email} (${payload.extra.location}).`);
      setEmail("");
      setDisplayName("");
      setTempPassword("");
    } catch (err) {
      setError(err?.message || "Failed to create location-admin.");
    } finally {
      setSaving(false);
    }
  }

  async function runLegacyProfileMigration({ dryRun }) {
    if (!isFullAdmin || migrationBusy) return;
    setMigrationBusy(true);
    setMigrationMessage("");
    setMigrationError("");
    try {
      const normalizeProfiles = httpsCallable(functions, "adminNormalizeLegacyUserProfiles");
      let cursor = "";
      let totalInspected = 0;
      let totalMigrated = 0;
      let totalAlreadyCanonical = 0;
      let totalSkippedInvalid = 0;
      let totalSkippedNonLegacy = 0;
      let loops = 0;

      while (loops < 10) {
        loops += 1;
        const response = await normalizeProfiles({
          dryRun,
          limit: 500,
          startAfterId: cursor || undefined,
        });
        const data = response?.data || {};
        totalInspected += Number(data.inspected || 0);
        totalMigrated += Number(data.migratedCount || 0);
        totalAlreadyCanonical += Number(data.alreadyCanonicalCount || 0);
        totalSkippedInvalid += Number(data.skippedInvalidEmailCount || 0);
        totalSkippedNonLegacy += Number(data.skippedNonLegacyCount || 0);

        const hasMore = !!data.hasMore;
        const nextCursor = (data.nextCursor || "").toString();
        if (!hasMore || !nextCursor) break;
        cursor = nextCursor;
      }

      setMigrationMessage(
        `${dryRun ? "Dry run complete" : "Migration complete"}: inspected ${totalInspected}, `
        + `migrated ${totalMigrated}, already canonical ${totalAlreadyCanonical}, `
        + `skipped invalid-email ${totalSkippedInvalid}, skipped non-legacy ${totalSkippedNonLegacy}.`
      );
    } catch (err) {
      setMigrationError(err?.message || "Failed to run legacy profile migration.");
    } finally {
      setMigrationBusy(false);
    }
  }

  if (!isFullAdmin) {
    return (
      <main>
        <h1 className={styles.title}>Admin Creation</h1>
        <p className={styles.error}>Only full admins can access this page.</p>
      </main>
    );
  }

  return (
    <main>
      <h1 className={styles.title}>Admin Creation</h1>
      <p className={styles.subtitle}>
        Create a location-admin account. This role is limited to one location.
      </p>

      <form className={styles.form} onSubmit={handleSubmit}>
        <label className={styles.label} htmlFor="location-admin-email">
          Email
        </label>
        <input
          id="location-admin-email"
          className={styles.input}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="admin@example.com"
          required
        />

        <label className={styles.label} htmlFor="location-admin-name">
          Display Name
        </label>
        <input
          id="location-admin-name"
          className={styles.input}
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Optional"
        />

        <label className={styles.label} htmlFor="location-admin-location">
          Location
        </label>
        <select
          id="location-admin-location"
          className={styles.select}
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          required
        >
          {LOCATION_OPTIONS.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>

        <label className={styles.label} htmlFor="location-admin-password">
          Temporary Password (optional)
        </label>
        <input
          id="location-admin-password"
          className={styles.input}
          type="text"
          value={tempPassword}
          onChange={(e) => setTempPassword(e.target.value)}
          placeholder="Leave blank to auto-generate"
        />

        {message ? <p className={styles.success}>{message}</p> : null}
        {error ? <p className={styles.error}>{error}</p> : null}

        <button className={styles.button} type="submit" disabled={!canSubmit}>
          {saving ? "Creating..." : "Create Location Admin"}
        </button>
      </form>

      <section className={styles.form} style={{ marginTop: "1.5rem" }}>
        <h2 className={styles.title} style={{ fontSize: "1.2rem" }}>Legacy Profile Migration</h2>
        <p className={styles.subtitle}>
          One-time cleanup to move legacy `user_profile` ids (like safe-email ids) to canonical email ids.
        </p>
        <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
          <button
            className={styles.button}
            type="button"
            onClick={() => runLegacyProfileMigration({ dryRun: true })}
            disabled={migrationBusy}
          >
            {migrationBusy ? "Running..." : "Dry Run Migration"}
          </button>
          <button
            className={styles.button}
            type="button"
            onClick={() => runLegacyProfileMigration({ dryRun: false })}
            disabled={migrationBusy}
          >
            {migrationBusy ? "Running..." : "Run Migration"}
          </button>
        </div>
        {migrationMessage ? <p className={styles.success}>{migrationMessage}</p> : null}
        {migrationError ? <p className={styles.error}>{migrationError}</p> : null}
      </section>
    </main>
  );
}
