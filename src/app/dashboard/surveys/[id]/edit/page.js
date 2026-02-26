"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase-client";
import styles from "../../../surveys/create/page.module.css";

function normalizeQuestionText(item) {
  if (typeof item === "string") return item;
  if (item && typeof item === "object" && typeof item.text === "string") {
    return item.text;
  }
  return "";
}

export default function EditSurveyPage() {
  const params = useParams();
  const router = useRouter();
  const surveyId = params?.id;

  const [title, setTitle] = useState("");
  const [questions, setQuestions] = useState([""]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const normalizedQuestions = useMemo(() => {
    return questions.map((q) => q.trim()).filter(Boolean);
  }, [questions]);

  const canSave = !loading && title.trim().length > 0 && normalizedQuestions.length > 0 && !saving;

  useEffect(() => {
    async function loadSurvey() {
      if (!surveyId || typeof surveyId !== "string") {
        setError("Survey id is missing.");
        setLoading(false);
        return;
      }

      try {
        const snap = await getDoc(doc(db, "surveys", surveyId));
        if (!snap.exists()) {
          setError("Survey not found.");
          setLoading(false);
          return;
        }

        const data = snap.data();
        const initialQuestions = Array.isArray(data.questions)
          ? data.questions.map(normalizeQuestionText).filter(Boolean)
          : [];

        setTitle(typeof data.title === "string" ? data.title : "");
        setQuestions(initialQuestions.length ? initialQuestions : [""]);
      } catch {
        setError("Failed to load survey.");
      } finally {
        setLoading(false);
      }
    }

    loadSurvey();
  }, [surveyId]);

  function addQuestion() {
    setQuestions((prev) => [...prev, ""]);
  }

  function removeQuestion(index) {
    setQuestions((prev) => prev.filter((_, i) => i !== index));
  }

  function updateQuestion(index, value) {
    setQuestions((prev) => prev.map((item, i) => (i === index ? value : item)));
  }

  async function handleSave(event) {
    event.preventDefault();
    if (!canSave || typeof surveyId !== "string") return;

    setSaving(true);
    setMessage("");
    setError("");

    try {
      await updateDoc(doc(db, "surveys", surveyId), {
        title: title.trim(),
        answerScale: { min: 0, max: 3 },
        questions: normalizedQuestions.map((text, idx) => ({
          id: idx + 1,
          text,
        })),
        updatedAt: serverTimestamp(),
      });

      setMessage("Survey updated successfully.");
    } catch (err) {
      setError(err?.message || "Failed to update survey.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <main>Loading survey...</main>;
  }

  return (
    <main>
      <h1 className={styles.title}>Edit Survey</h1>
      <p className={styles.subtitle}>Update title and questions for this survey.</p>

      <p>
        <Link href="/dashboard/surveys">Back to Surveys</Link>
      </p>

      <form className={styles.form} onSubmit={handleSave}>
        <label className={styles.label} htmlFor="survey-title">
          Survey Title
        </label>
        <input
          id="survey-title"
          className={styles.input}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />

        <div className={styles.questionsHeader}>
          <h2>Questions</h2>
          <button className={styles.secondaryButton} type="button" onClick={addQuestion}>
            Add Question
          </button>
        </div>

        <div className={styles.questionsList}>
          {questions.map((question, index) => (
            <div className={styles.questionCard} key={`question-${index}`}>
              <label className={styles.label}>Question {index + 1}</label>
              <input
                className={styles.input}
                value={question}
                onChange={(e) => updateQuestion(index, e.target.value)}
                placeholder="Enter question"
                required
              />
              <p className={styles.scaleHint}>Answers: 0, 1, 2, 3</p>
              {questions.length > 1 ? (
                <button className={styles.removeButton} type="button" onClick={() => removeQuestion(index)}>
                  Remove
                </button>
              ) : null}
            </div>
          ))}
        </div>

        {message ? <p className={styles.success}>{message}</p> : null}
        {error ? <p className={styles.error}>{error}</p> : null}

        <button className={styles.primaryButton} type="submit" disabled={!canSave}>
          {saving ? "Saving..." : "Save Changes"}
        </button>

        <button
          className={styles.secondaryButton}
          type="button"
          onClick={() => router.push("/dashboard/surveys")}
        >
          Done
        </button>
      </form>
    </main>
  );
}
