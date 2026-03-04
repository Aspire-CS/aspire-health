"use client";

import { useEffect, useMemo, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase-client";
import { useDashboardAccess } from "@/lib/dashboard-access-context";
import {
  AGE_GROUP_OPTIONS,
  LOCATION_OPTIONS_PATIENTS,
  TRACK_OPTIONS,
  availablePrograms,
  normalizeProgramLocation,
  programDisplayName,
} from "@/lib/program-catalog";
import styles from "./page.module.css";

function validEmail(value) {
  return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test((value || "").trim());
}

export default function PatientCreationPage() {
  const { isFullAdmin, isLocationAdmin, location: scopedLocation } = useDashboardAccess();
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  const [location, setLocation] = useState("");
  const [ageGroup, setAgeGroup] = useState(AGE_GROUP_OPTIONS[0]);
  const [track, setTrack] = useState(TRACK_OPTIONS[0]);
  const [programName, setProgramName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (isLocationAdmin) {
      const scoped = normalizeProgramLocation(scopedLocation);
      setLocation(scoped);
      return;
    }
    setLocation((prev) => prev || LOCATION_OPTIONS_PATIENTS[0]);
  }, [isLocationAdmin, scopedLocation]);

  useEffect(() => {
    setProgramName("");
    setStartDate("");
  }, [location, ageGroup, track]);

  const programOptions = useMemo(
    () => availablePrograms({ location, ageGroup, track }),
    [location, ageGroup, track]
  );

  const canSubmit = useMemo(() => {
    if (saving) return false;
    if (!validEmail(email)) return false;
    if (!firstName.trim() || !lastName.trim()) return false;
    if (!location.trim()) return false;
    if (!ageGroup || !track) return false;
    if (programOptions.length > 0 && !programName) return false;
    if (programName && !startDate) return false;
    return isFullAdmin || isLocationAdmin;
  }, [saving, email, firstName, lastName, location, ageGroup, track, programOptions, programName, startDate, isFullAdmin, isLocationAdmin]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canSubmit) return;

    setSaving(true);
    setMessage("");
    setError("");
    try {
      const createPatient = httpsCallable(functions, "adminCreatePatientAndAssignProgram");
      const payload = {
        email: email.trim().toLowerCase(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        displayName: `${firstName.trim()} ${lastName.trim()}`.trim(),
        tempPassword: tempPassword.trim() || undefined,
        location,
        ageGroup,
        track,
        programName: programName || undefined,
        startDate: programName ? startDate : undefined,
      };

      const result = await createPatient(payload);
      const effectiveTempPassword =
        (result?.data?.tempPassword || payload.tempPassword || "").toString().trim();
      if (effectiveTempPassword) {
        setMessage(
          `Patient created for ${payload.email}. Temporary password: ${effectiveTempPassword}`
        );
      } else {
        setMessage(`Patient created for ${payload.email}.`);
      }
      setEmail("");
      setFirstName("");
      setLastName("");
      setTempPassword("");
      setProgramName("");
      setStartDate("");
    } catch (err) {
      setError(err?.message || "Failed to create patient.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main>
      <h1 className={styles.title}>Patient Creation</h1>
      <p className={styles.subtitle}>
        Create a patient account and assign program events. Location-admins are restricted to their location.
      </p>

      <form className={styles.form} onSubmit={handleSubmit}>
        <label className={styles.label} htmlFor="patient-create-email">Email</label>
        <input
          id="patient-create-email"
          className={styles.input}
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="patient@example.com"
          required
        />

        <label className={styles.label} htmlFor="patient-create-first-name">First Name</label>
        <input
          id="patient-create-first-name"
          className={styles.input}
          type="text"
          value={firstName}
          onChange={(event) => setFirstName(event.target.value)}
          required
        />

        <label className={styles.label} htmlFor="patient-create-last-name">Last Name</label>
        <input
          id="patient-create-last-name"
          className={styles.input}
          type="text"
          value={lastName}
          onChange={(event) => setLastName(event.target.value)}
          required
        />

        <label className={styles.label} htmlFor="patient-create-location">Location</label>
        <select
          id="patient-create-location"
          className={styles.select}
          value={location}
          onChange={(event) => setLocation(event.target.value)}
          disabled={isLocationAdmin}
          required
        >
          {(isLocationAdmin ? [location] : LOCATION_OPTIONS_PATIENTS).map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>

        <label className={styles.label} htmlFor="patient-create-age-group">Age Group</label>
        <select
          id="patient-create-age-group"
          className={styles.select}
          value={ageGroup}
          onChange={(event) => setAgeGroup(event.target.value)}
          required
        >
          {AGE_GROUP_OPTIONS.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>

        <label className={styles.label} htmlFor="patient-create-track">Track</label>
        <select
          id="patient-create-track"
          className={styles.select}
          value={track}
          onChange={(event) => setTrack(event.target.value)}
          required
        >
          {TRACK_OPTIONS.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>

        <label className={styles.label} htmlFor="patient-create-program">Program</label>
        <select
          id="patient-create-program"
          className={styles.select}
          value={programName}
          onChange={(event) => setProgramName(event.target.value)}
          disabled={programOptions.length === 0}
        >
          <option value="">
            {programOptions.length === 0 ? "No programs for this combination" : "Select a program"}
          </option>
          {programOptions.map((item) => (
            <option key={item} value={item}>
              {programDisplayName(item)}
            </option>
          ))}
        </select>

        <label className={styles.label} htmlFor="patient-create-start-date">Program Start Date</label>
        <input
          id="patient-create-start-date"
          className={styles.input}
          type="date"
          value={startDate}
          onChange={(event) => setStartDate(event.target.value)}
          disabled={!programName}
          required={!!programName}
        />

        <label className={styles.label} htmlFor="patient-create-password">Temporary Password (optional)</label>
        <input
          id="patient-create-password"
          className={styles.input}
          type="text"
          value={tempPassword}
          onChange={(event) => setTempPassword(event.target.value)}
          placeholder="Auto-generated when blank"
        />

        {message ? <p className={styles.success}>{message}</p> : null}
        {error ? <p className={styles.error}>{error}</p> : null}

        <button className={styles.button} type="submit" disabled={!canSubmit}>
          {saving ? "Creating..." : "Create Patient"}
        </button>
      </form>
    </main>
  );
}
