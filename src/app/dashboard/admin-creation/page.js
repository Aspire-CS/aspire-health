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
    </main>
  );
}
