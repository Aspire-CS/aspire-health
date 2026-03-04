"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase-client";
import { useDashboardAccess } from "@/lib/dashboard-access-context";
import { locationVariants } from "@/lib/locations";
import { matchesScopedLocation, profileLocation } from "@/lib/location-scope";
import { availablePrograms, normalizeProgramLocation } from "@/lib/program-catalog";
import styles from "./page.module.css";

function patientLabel(patient) {
  const identifier = patient.email || patient.id || "";
  return `${patient.name || "Unknown"}${identifier ? ` (${identifier})` : ""}`;
}

export default function PatientManagementPage() {
  const { isLocationAdmin, location: scopedLocation } = useDashboardAccess();
  const [patients, setPatients] = useState([]);
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [events, setEvents] = useState([]);
  const [loadingPatients, setLoadingPatients] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [active, setActive] = useState(true);
  const [singleEventDate, setSingleEventDate] = useState("");
  const [singleEventTime, setSingleEventTime] = useState("");
  const [singleEventProgram, setSingleEventProgram] = useState("");

  useEffect(() => {
    async function loadPatients() {
      setLoadingPatients(true);
      setError("");
      try {
        let docs = [];
        if (!isLocationAdmin) {
          const snap = await getDocs(collection(db, "user_profile"));
          docs = snap.docs;
        } else {
          const variants = locationVariants(scopedLocation);
          const merged = new Map();
          for (const variantQuery of [
            query(collection(db, "user_profile"), where("location", "in", variants)),
            query(collection(db, "user_profile"), where("programLocation", "in", variants)),
          ]) {
            try {
              const snap = await getDocs(variantQuery);
              for (const row of snap.docs) merged.set(row.id, row);
            } catch (err) {
              const code = (err?.code || "").toString();
              if (code !== "permission-denied" && code !== "firestore/permission-denied") {
                throw err;
              }
            }
          }
          docs = Array.from(merged.values());
        }

        const rows = docs
          .map((docSnap) => {
            const data = docSnap.data() || {};
            const first = (data.firstName || "").toString().trim();
            const last = (data.lastName || "").toString().trim();
            const name = `${first} ${last}`.trim() || (data.displayName || "").toString().trim();
            const profileEmail = (data.email || "").toString().toLowerCase().trim();
            const docId = (docSnap.id || "").toString().toLowerCase().trim();
            const email = profileEmail.includes("@")
              ? profileEmail
              : docId.includes("@")
                ? docId
                : "";
            return {
              id: docSnap.id,
              email,
              firstName: first,
              lastName: last,
              name: name || (profileEmail || docId || "").toString(),
              location: profileLocation(data),
              ageGroup: (data.type || data.programAgeGroup || "").toString().trim(),
              track: (data.track || data.programTrack || "").toString().trim(),
              programName: (data.programName || data.calendar || "").toString().trim(),
              active: data.active !== false,
            };
          })
          .filter((row) => !!row.id)
          .filter((row) => !isLocationAdmin || matchesScopedLocation(row.location, scopedLocation))
          .sort((a, b) => a.name.localeCompare(b.name));

        setPatients(rows);
      } catch {
        setPatients([]);
        setError("Failed to load patients.");
      } finally {
        setLoadingPatients(false);
      }
    }

    loadPatients();
  }, [isLocationAdmin, scopedLocation]);

  const selectedPatient = useMemo(
    () => patients.find((row) => row.id === selectedPatientId) || null,
    [patients, selectedPatientId]
  );

  const filteredPatients = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return patients;
    return patients.filter((row) => {
      const hay = `${row.name || ""} ${row.email || ""} ${row.id || ""}`.toLowerCase();
      return hay.includes(term);
    });
  }, [patients, searchTerm]);

  const programOptions = useMemo(() => {
    if (!selectedPatient) return [];
    return availablePrograms({
      location: normalizeProgramLocation(selectedPatient.location),
      ageGroup: selectedPatient.ageGroup,
      track: selectedPatient.track,
    });
  }, [selectedPatient]);

  useEffect(() => {
    if (!selectedPatient) return;
    setFirstName(selectedPatient.firstName || "");
    setLastName(selectedPatient.lastName || "");
    setActive(selectedPatient.active !== false);
    setSingleEventProgram(selectedPatient.programName || "");
  }, [selectedPatient]);

  useEffect(() => {
    async function loadEventsForPatient() {
      if (!selectedPatient?.id) {
        setEvents([]);
        return;
      }
      setLoadingEvents(true);
      setError("");
      try {
        const listEvents = httpsCallable(functions, "adminListPatientCalendarEvents");
        const result = await listEvents({
          patientId: selectedPatient.id,
          email: selectedPatient.email || undefined,
        });
        const rows = Array.isArray(result?.data?.events) ? result.data.events : [];
        setEvents(rows);
      } catch {
        setEvents([]);
        setError("Failed to load patient events.");
      } finally {
        setLoadingEvents(false);
      }
    }

    loadEventsForPatient();
  }, [selectedPatient?.id, selectedPatient?.email]);

  async function handleProfileUpdate(event) {
    event.preventDefault();
    if (!selectedPatient?.id || saving) return;
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const updatePatient = httpsCallable(functions, "adminUpdatePatientProfile");
      await updatePatient({
        patientId: selectedPatient.id,
        email: selectedPatient.email || undefined,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        displayName: `${firstName.trim()} ${lastName.trim()}`.trim(),
        active,
      });
      const setActiveStatus = httpsCallable(functions, "adminSetPatientActiveStatus");
      await setActiveStatus({
        patientId: selectedPatient.id,
        email: selectedPatient.email || undefined,
        active,
      });
      setMessage("Patient profile updated.");
      setPatients((prev) =>
        prev.map((row) =>
          row.id === selectedPatient.id
            ? {
                ...row,
                firstName: firstName.trim(),
                lastName: lastName.trim(),
                name: `${firstName.trim()} ${lastName.trim()}`.trim() || row.name,
                active,
              }
            : row
        )
      );
    } catch (err) {
      setError(err?.message || "Failed to update patient profile.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddSingleEvent(event) {
    event.preventDefault();
    if (!selectedPatient?.id || !singleEventDate || !singleEventTime || saving) return;
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const addEvent = httpsCallable(functions, "adminAddPatientSingleEvent");
      await addEvent({
        patientId: selectedPatient.id,
        email: selectedPatient.email || undefined,
        date: singleEventDate,
        startTime: singleEventTime,
        programName: singleEventProgram || undefined,
      });
      setMessage("Single event added.");
      const listEvents = httpsCallable(functions, "adminListPatientCalendarEvents");
      const result = await listEvents({
        patientId: selectedPatient.id,
        email: selectedPatient.email || undefined,
      });
      setEvents(Array.isArray(result?.data?.events) ? result.data.events : []);
      setSingleEventDate("");
      setSingleEventTime("");
    } catch (err) {
      setError(err?.message || "Failed to add event.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCancelEvent(eventId, sourceCalendarDocId) {
    if (!selectedPatient?.id || !eventId || saving) return;
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const cancelEvent = httpsCallable(functions, "adminCancelPatientEvent");
      await cancelEvent({
        patientId: selectedPatient.id,
        email: selectedPatient.email || undefined,
        eventId,
        sourceCalendarDocId: sourceCalendarDocId || undefined,
      });
      setEvents((prev) =>
        prev.map((row) =>
          row.id === eventId && (row.sourceCalendarDocId || "") === (sourceCalendarDocId || "")
            ? { ...row, isCanceled: true, status: "canceled" }
            : row
        )
      );
      setMessage("Event canceled.");
    } catch (err) {
      setError(err?.message || "Failed to cancel event.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main>
      <h1 className={styles.title}>Patient Management</h1>
      <p className={styles.subtitle}>
        Edit patient profile details, mark patient active/inactive, add a single event, or cancel a single event.
      </p>

      <div className={styles.row}>
        <label className={styles.label} htmlFor="patient-management-search">Search Patient</label>
        <input
          id="patient-management-search"
          className={styles.input}
          type="text"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Type patient name, email, or id"
        />

        <label className={styles.label} htmlFor="patient-management-select">Patient</label>
        <select
          id="patient-management-select"
          className={styles.select}
          value={selectedPatientId}
          onChange={(event) => setSelectedPatientId(event.target.value)}
        >
          <option value="">Select patient</option>
          {filteredPatients.map((row) => (
            <option key={row.id} value={row.id}>
              {patientLabel(row)}
            </option>
          ))}
        </select>
      </div>

      {loadingPatients ? <p className={styles.state}>Loading patients...</p> : null}

      {selectedPatient ? (
        <div className={styles.grid}>
          <section className={styles.card}>
            <h2 className={styles.sectionTitle}>Profile</h2>
            <form className={styles.form} onSubmit={handleProfileUpdate}>
              <label className={styles.label} htmlFor="patient-management-first-name">First Name</label>
              <input
                id="patient-management-first-name"
                className={styles.input}
                type="text"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
              />

              <label className={styles.label} htmlFor="patient-management-last-name">Last Name</label>
              <input
                id="patient-management-last-name"
                className={styles.input}
                type="text"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
              />

              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(event) => setActive(event.target.checked)}
                />
                <span>Active patient</span>
              </label>

              <button className={styles.button} type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save Patient"}
              </button>
            </form>
          </section>

          <section className={styles.card}>
            <h2 className={styles.sectionTitle}>Add Single Event</h2>
            <form className={styles.form} onSubmit={handleAddSingleEvent}>
              <label className={styles.label} htmlFor="patient-management-single-program">Program</label>
              <select
                id="patient-management-single-program"
                className={styles.select}
                value={singleEventProgram}
                onChange={(event) => setSingleEventProgram(event.target.value)}
              >
                <option value="">Use patient default program</option>
                {programOptions.map((program) => (
                  <option key={program} value={program}>
                    {program}
                  </option>
                ))}
              </select>

              <label className={styles.label} htmlFor="patient-management-single-date">Date</label>
              <input
                id="patient-management-single-date"
                className={styles.input}
                type="date"
                value={singleEventDate}
                onChange={(event) => setSingleEventDate(event.target.value)}
                required
              />

              <label className={styles.label} htmlFor="patient-management-single-time">Time</label>
              <input
                id="patient-management-single-time"
                className={styles.input}
                type="time"
                value={singleEventTime}
                onChange={(event) => setSingleEventTime(event.target.value)}
                required
              />

              <button className={styles.button} type="submit" disabled={saving || !singleEventDate || !singleEventTime}>
                {saving ? "Working..." : "Add Event"}
              </button>
            </form>
          </section>
        </div>
      ) : null}

      {selectedPatient ? (
        <section className={styles.card}>
          <h2 className={styles.sectionTitle}>Calendar Events</h2>
          {loadingEvents ? <p className={styles.state}>Loading events...</p> : null}
          {!loadingEvents && events.length === 0 ? <p className={styles.state}>No events found.</p> : null}
          {!loadingEvents && events.length > 0 ? (
            <ul className={styles.eventList}>
              {events.map((row) => (
                <li className={styles.eventRow} key={`${row.sourceCalendarDocId || "default"}:${row.id}`}>
                  <div className={styles.eventMain}>
                    <strong>{row.title || "Untitled event"}</strong>
                    <span>{row.startDateTimeIso ? new Date(row.startDateTimeIso).toLocaleString() : "No date"}</span>
                    <span>{row.isCanceled ? "Status: canceled" : "Status: scheduled"}</span>
                  </div>
                  <button
                    className={styles.cancelButton}
                    type="button"
                    disabled={saving || row.isCanceled}
                    onClick={() => handleCancelEvent(row.id, row.sourceCalendarDocId)}
                  >
                    {row.isCanceled ? "Canceled" : "Cancel Event"}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {message ? <p className={styles.success}>{message}</p> : null}
      {error ? <p className={styles.error}>{error}</p> : null}
    </main>
  );
}
