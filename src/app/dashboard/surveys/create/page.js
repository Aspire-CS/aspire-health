"use client";

import { useMemo, useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase-client";
import { useDashboardAccess } from "@/lib/dashboard-access-context";
import styles from "./page.module.css";

const MIN_QUESTIONS = 1;

export default function CreateSurveyPage() {
  const { isFullAdmin } = useDashboardAccess();
  const [title, setTitle] = useState("");
  const [questions, setQuestions] = useState([""]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const normalizedQuestions = useMemo(() => {
    return questions.map((q) => q.trim()).filter(Boolean);
  }, [questions]);

  const canSave = title.trim().length > 0 && normalizedQuestions.length >= MIN_QUESTIONS && !saving;

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
    if (!isFullAdmin || !canSave) return;

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const user = auth.currentUser;
      await addDoc(collection(db, "surveys"), {
        title: title.trim(),
        answerScale: { min: 0, max: 3 },
        questions: normalizedQuestions.map((text, idx) => ({
          id: idx + 1,
          text,
        })),
        createdByUid: user?.uid || "",
        createdByEmail: user?.email || "",
        createdAt: serverTimestamp(),
      });

      setTitle("");
      setQuestions([""]);
      setMessage("Survey created successfully.");
    } catch (err) {
      setError(err?.message || "Failed to create survey.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main>
      <h1 className={styles.title}>Create Survey</h1>
      <p className={styles.subtitle}>Add a title and as many questions as needed. All answers use 0-3 scale.</p>

      {!isFullAdmin ? (
        <p className={styles.error}>Only higher-up admins can create surveys.</p>
      ) : null}

      <form className={styles.form} onSubmit={handleSave}>
        <label className={styles.label} htmlFor="survey-title">
          Survey Title
        </label>
        <input
          id="survey-title"
          className={styles.input}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Example: Weekly Recovery Check-In"
          required
          disabled={!isFullAdmin}
        />

        <div className={styles.questionsHeader}>
          <h2>Questions</h2>
          <button
            className={styles.secondaryButton}
            type="button"
            onClick={addQuestion}
            disabled={!isFullAdmin}
          >
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
                disabled={!isFullAdmin}
              />
              <p className={styles.scaleHint}>Answers: 0, 1, 2, 3</p>
              {questions.length > 1 ? (
                <button
                  className={styles.removeButton}
                  type="button"
                  onClick={() => removeQuestion(index)}
                  disabled={!isFullAdmin}
                >
                  Remove
                </button>
              ) : null}
            </div>
          ))}
        </div>

        {message ? <p className={styles.success}>{message}</p> : null}
        {error ? <p className={styles.error}>{error}</p> : null}

        <button className={styles.primaryButton} type="submit" disabled={!isFullAdmin || !canSave}>
          {saving ? "Saving..." : "Create Survey"}
        </button>
      </form>
    </main>
  );
}
