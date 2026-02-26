"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  browserLocalPersistence,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { auth } from "@/lib/firebase-client";
import { hasAdminAccess } from "@/lib/admin-access";
import styles from "./page.module.css";

function mapAuthError(errorCode) {
  switch (errorCode) {
    case "auth/invalid-email":
      return "The email address format is invalid.";
    case "auth/user-disabled":
      return "This account has been disabled.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Invalid email or password.";
    default:
      return "Sign in failed. Please try again.";
  }
}

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = useMemo(() => {
    return email.trim().length > 0 && password.trim().length > 0 && !submitting;
  }, [email, password, submitting]);

  async function onSubmit(event) {
    event.preventDefault();
    if (!canSubmit) return;

    setError("");
    setSubmitting(true);

    try {
      await setPersistence(auth, browserLocalPersistence);

      const credential = await signInWithEmailAndPassword(
        auth,
        email.trim().toLowerCase(),
        password
      );

      const isAdmin = await hasAdminAccess(credential.user);
      if (!isAdmin) {
        await signOut(auth);
        setError("This dashboard is restricted to admin accounts.");
        return;
      }

      router.push("/dashboard/surveys");
    } catch (err) {
      setError(mapAuthError(err?.code));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Aspire Admin Login</h1>
        <p className={styles.subtitle}>
          Sign in with the same Firebase account used in the mobile app.
        </p>

        <form className={styles.form} onSubmit={onSubmit}>
          <label className={styles.label} htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            className={styles.input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />

          <label className={styles.label} htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            className={styles.input}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />

          {error ? <p className={styles.error}>{error}</p> : null}

          <button className={styles.button} type="submit" disabled={!canSubmit}>
            {submitting ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
