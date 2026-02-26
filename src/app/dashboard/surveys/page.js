"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
} from "firebase/firestore";
import { db } from "@/lib/firebase-client";
import styles from "./page.module.css";

const ANSWER_HEADERS = [
  "Not at all",
  "Several days",
  "More than half the days",
  "Nearly every day",
];

function normalizeQuestionText(item) {
  if (typeof item === "string") return item;
  if (item && typeof item === "object" && typeof item.text === "string") {
    return item.text;
  }
  return "";
}

export default function SurveysPage() {
  const [surveys, setSurveys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openPreviewId, setOpenPreviewId] = useState("");
  const [deletingId, setDeletingId] = useState("");

  const hasSurveys = useMemo(() => surveys.length > 0, [surveys]);

  async function loadSurveys() {
    setLoading(true);
    try {
      const surveysRef = collection(db, "surveys");
      const surveysQuery = query(surveysRef, orderBy("createdAt", "desc"));
      const snap = await getDocs(surveysQuery);

      const rows = snap.docs.map((surveyDoc) => {
        const data = surveyDoc.data();
        const rawQuestions = Array.isArray(data.questions) ? data.questions : [];
        const questions = rawQuestions.map(normalizeQuestionText).filter(Boolean);

        return {
          id: surveyDoc.id,
          title: data.title || "Untitled survey",
          questions,
          questionCount: questions.length,
        };
      });

      setSurveys(rows);
    } catch {
      setSurveys([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSurveys();
  }, []);

  async function handleDelete(surveyId, surveyTitle) {
    const confirmed = window.confirm(
      `Delete survey "${surveyTitle}"? This cannot be undone.`
    );
    if (!confirmed) return;

    setDeletingId(surveyId);
    try {
      await deleteDoc(doc(db, "surveys", surveyId));
      if (openPreviewId === surveyId) {
        setOpenPreviewId("");
      }
      await loadSurveys();
    } finally {
      setDeletingId("");
    }
  }

  function togglePreview(surveyId) {
    setOpenPreviewId((prev) => (prev === surveyId ? "" : surveyId));
  }

  return (
    <main>
      <h1 className={styles.title}>Surveys</h1>
      <p className={styles.subtitle}>Manage existing surveys in your Firebase project.</p>

      {loading ? <p className={styles.state}>Loading surveys...</p> : null}

      {!loading && !hasSurveys ? <p className={styles.state}>No surveys found yet.</p> : null}

      {!loading && hasSurveys ? (
        <div className={styles.list}>
          {surveys.map((survey) => {
            const isOpen = openPreviewId === survey.id;
            const isDeleting = deletingId === survey.id;

            return (
              <article className={styles.card} key={survey.id}>
                <div className={styles.cardTop}>
                  <div>
                    <h2 className={styles.cardTitle}>{survey.title}</h2>
                    <p className={styles.cardMeta}>{survey.questionCount} question(s)</p>
                  </div>

                  <div className={styles.actionsRow}>
                    <button
                      className={styles.previewButton}
                      type="button"
                      onClick={() => togglePreview(survey.id)}
                    >
                      {isOpen ? "Hide Preview" : "Dropdown Preview"}
                    </button>

                    <Link href={`/dashboard/surveys/${survey.id}/edit`} className={styles.editButton}>
                      Edit
                    </Link>

                    <button
                      className={styles.deleteButton}
                      type="button"
                      onClick={() => handleDelete(survey.id, survey.title)}
                      disabled={isDeleting}
                    >
                      {isDeleting ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </div>

                {isOpen ? (
                  <section className={styles.previewWrap}>
                    <div className={styles.previewHeader}>{survey.title.toUpperCase()}</div>

                    <div className={styles.previewGridHeader}>
                      <div className={styles.previewPrompt}>
                        Over the last 2 weeks, how often have you been bothered by any of the
                        following problems?
                      </div>
                      {ANSWER_HEADERS.map((header) => (
                        <div className={styles.previewColHeader} key={header}>
                          {header}
                        </div>
                      ))}
                    </div>

                    {survey.questions.map((question, index) => (
                      <div className={styles.previewRow} key={`${survey.id}-q-${index}`}>
                        <div className={styles.previewQuestion}>
                          <span className={styles.previewNumber}>{index + 1}.</span> {question}
                        </div>
                        <div className={styles.previewScore}>0</div>
                        <div className={styles.previewScore}>1</div>
                        <div className={styles.previewScore}>2</div>
                        <div className={styles.previewScore}>3</div>
                      </div>
                    ))}
                  </section>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : null}
    </main>
  );
}
