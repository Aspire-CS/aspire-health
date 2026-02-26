"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase-client";
import { hasAdminAccess } from "@/lib/admin-access";
import styles from "./dashboard.module.css";

const navItems = [
  { href: "/dashboard/surveys", label: "Surveys" },
  { href: "/dashboard/surveys/create", label: "Create Survey" },
  { href: "/dashboard/patients", label: "Survey Assignment" },
];

export default function DashboardLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/");
        return;
      }

      const admin = await hasAdminAccess(user);
      if (!admin) {
        await signOut(auth);
        router.replace("/");
        return;
      }

      setUserEmail(user.email || "");
      setLoading(false);
    });

    return () => unsub();
  }, [router]);

  async function handleSignOut() {
    await signOut(auth);
    router.replace("/");
  }

  if (loading) {
    return <main className={styles.loading}>Loading dashboard...</main>;
  }

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <h2 className={styles.brand}>Aspire Admin</h2>
        <nav className={styles.nav}>
          {navItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.navLink} ${active ? styles.navLinkActive : ""}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className={styles.sidebarFooter}>
          <p className={styles.userEmail}>{userEmail}</p>
          <button className={styles.signOut} onClick={handleSignOut}>
            Sign Out
          </button>
        </div>
      </aside>

      <section className={styles.content}>{children}</section>
    </div>
  );
}
