"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase-client";
import { useDashboardAccess } from "@/lib/dashboard-access-context";
import { matchesScopedLocation, profileLocation } from "@/lib/location-scope";
import { canonicalCity, locationVariants } from "@/lib/locations";
import styles from "./page.module.css";

const ADMIN_DOMAINS = ["aspirecounselingservice.com", "aspirecounselingservices.com"];

function getDomain(email) {
  if (!email || !email.includes("@")) return "";
  return email.toLowerCase().split("@").pop() || "";
}

function isAdminProfile(profile) {
  const typeLower = (profile.typeLower || profile.type || profile.role || "")
    .toString()
    .toLowerCase()
    .trim();
  if (
    typeLower === "admin" ||
    typeLower === "location-admin" ||
    typeLower === "location_admin" ||
    typeLower.includes("admin")
  ) {
    return true;
  }

  const email = (profile.email || "").toString().toLowerCase();
  return ADMIN_DOMAINS.includes(getDomain(email));
}

function patientName(profile) {
  const first = (profile.firstName || "").toString().trim();
  const last = (profile.lastName || "").toString().trim();
  const combined = `${first} ${last}`.trim();
  if (combined) return combined;

  const displayName = (profile.displayName || "").toString().trim();
  if (displayName) return displayName;

  return (profile.email || "Unknown").toString();
}

function formatTimestamp(value) {
  if (!value) return "Never";

  try {
    const date = typeof value?.toDate === "function" ? value.toDate() : new Date(value);
    if (Number.isNaN(date.getTime())) return "Never";

    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  } catch {
    return "Never";
  }
}

export default function SendSurveysPage() {
  const { isLocationAdmin, location: scopedLocation } = useDashboardAccess();
  const [loading, setLoading] = useState(true);
  const [surveys, setSurveys] = useState([]);
  const [patients, setPatients] = useState([]);
  const [sendingSurveyId, setSendingSurveyId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError("");

      try {
        const surveysSnap = await getDocs(collection(db, "surveys"));
        let profileDocs = [];

        if (!isLocationAdmin) {
          const profilesSnap = await getDocs(collection(db, "user_profile"));
          profileDocs = profilesSnap.docs;
        } else {
          const variants = locationVariants(scopedLocation);
          const merged = new Map();

          if (variants.length > 0) {
            const scopedQueries = [
              query(collection(db, "user_profile"), where("location", "in", variants)),
              query(collection(db, "user_profile"), where("programLocation", "in", variants)),
            ];

            for (const scopedQuery of scopedQueries) {
              try {
                const snap = await getDocs(scopedQuery);
                for (const docSnap of snap.docs) {
                  merged.set(docSnap.id, docSnap);
                }
              } catch (err) {
                const code = (err?.code || "").toString();
                if (code !== "permission-denied" && code !== "firestore/permission-denied") {
                  throw err;
                }
              }
            }
          }

          profileDocs = Array.from(merged.values());
        }

        const surveyRows = surveysSnap.docs
          .map((surveyDoc) => {
            const data = surveyDoc.data() || {};
            return {
              id: surveyDoc.id,
              title: (data.title || "Untitled survey").toString(),
              lastSentAt: data.lastSentAt || null,
              questionCount: Array.isArray(data.questions) ? data.questions.length : 0,
            };
          })
          .sort((a, b) => a.title.localeCompare(b.title));

        const patientRows = profileDocs
          .map((docSnap) => {
            const data = docSnap.data() || {};
            const assignedSurveyIds = Array.isArray(data.assignedSurveyIds)
              ? data.assignedSurveyIds.map((id) => `${id || ""}`.trim()).filter(Boolean)
              : [];

            return {
              id: docSnap.id,
              email: (data.email || docSnap.id || "").toString().toLowerCase(),
              uid: (data.uid || "").toString().trim(),
              name: patientName(data),
              mrn: (data.MRN || "").toString().trim(),
              location: profileLocation(data),
              assignedSurveyIds,
              active: data.active !== false,
              raw: data,
            };
          })
          .filter((patient) => patient.active)
          .filter((patient) => !isAdminProfile(patient.raw))
          .filter(
            (patient) => !isLocationAdmin || matchesScopedLocation(patient.location, scopedLocation)
          );

        setSurveys(surveyRows);
        setPatients(patientRows);
      } catch (err) {
        setError(err?.message || "Failed to load surveys.");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [isLocationAdmin, scopedLocation]);

  const assignedCountBySurvey = useMemo(() => {
    const counts = new Map();

    for (const patient of patients) {
      for (const surveyId of patient.assignedSurveyIds) {
        counts.set(surveyId, (counts.get(surveyId) || 0) + 1);
      }
    }

    return counts;
  }, [patients]);

  async function handleSendSurvey(survey) {
    setMessage("");
    setError("");

    const recipients = patients.filter((patient) => patient.assignedSurveyIds.includes(survey.id));
    if (!recipients.length) {
      setError(`No assigned patients found for \"${survey.title}\".`);
      return;
    }

    setSendingSurveyId(survey.id);

    try {
      const dispatchRef = await addDoc(collection(db, "survey_dispatches"), {
        surveyId: survey.id,
        surveyTitle: survey.title,
        location: scopedLocation || "",
        locationCity: canonicalCity(scopedLocation),
        recipientCount: recipients.length,
        sentByUid: auth.currentUser?.uid || "",
        sentByEmail: auth.currentUser?.email || "",
        sentAt: serverTimestamp(),
        status: "sent",
      });

      const batch = writeBatch(db);

      for (const recipient of recipients) {
        const instanceRef = doc(collection(db, "survey_instances"));
        batch.set(instanceRef, {
          surveyId: survey.id,
          surveyTitle: survey.title,
          dispatchId: dispatchRef.id,
          patientDocId: recipient.id,
          patientEmail: recipient.email,
          patientUid: recipient.uid || "",
          patientName: recipient.name,
          patientMrn: recipient.mrn,
          patientLocation: recipient.location,
          patientLocationCity: canonicalCity(recipient.location),
          status: "unfinished",
          score: null,
          answers: [],
          maxPossibleScore: Math.max(0, survey.questionCount * 3),
          sentAt: serverTimestamp(),
          completedAt: null,
        });
      }

      batch.update(doc(db, "surveys", survey.id), {
        lastSentAt: serverTimestamp(),
        lastDispatchId: dispatchRef.id,
      });

      await batch.commit();

      setSurveys((prev) =>
        prev.map((row) =>
          row.id === survey.id
            ? {
                ...row,
                lastSentAt: new Date(),
              }
            : row
        )
      );

      setMessage(`Sent \"${survey.title}\" to ${recipients.length} patient(s).`);
    } catch (err) {
      setError(err?.message || "Failed to send survey.");
    } finally {
      setSendingSurveyId("");
    }
  }

  return (
    <main>
      <h1 className={styles.title}>Send Surveys</h1>
      <p className={styles.subtitle}>
        Send a survey to all patients currently assigned to it.
      </p>

      {message ? <p className={styles.success}>{message}</p> : null}
      {error ? <p className={styles.error}>{error}</p> : null}

      {loading ? <p className={styles.state}>Loading surveys...</p> : null}

      {!loading && surveys.length === 0 ? (
        <p className={styles.state}>No surveys found.</p>
      ) : null}

      {!loading && surveys.length > 0 ? (
        <div className={styles.list}>
          {surveys.map((survey) => {
            const assignedCount = assignedCountBySurvey.get(survey.id) || 0;
            const isSending = sendingSurveyId === survey.id;

            return (
              <article className={styles.card} key={survey.id}>
                <div>
                  <h2 className={styles.cardTitle}>{survey.title}</h2>
                  <p className={styles.cardMeta}>{survey.questionCount} question(s)</p>
                  <p className={styles.cardMeta}>Assigned patients: {assignedCount}</p>
                  <p className={styles.cardMeta}>Last sent: {formatTimestamp(survey.lastSentAt)}</p>
                </div>

                <button
                  className={styles.sendButton}
                  type="button"
                  disabled={isSending || assignedCount === 0}
                  onClick={() => handleSendSurvey(survey)}
                >
                  {isSending ? "Sending..." : "Send"}
                </button>
              </article>
            );
          })}
        </div>
      ) : null}
    </main>
  );
}
