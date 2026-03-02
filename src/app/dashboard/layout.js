"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase-client";
import { resolveDashboardAccess } from "@/lib/admin-access";
import { DashboardAccessProvider } from "@/lib/dashboard-access-context";
import styles from "./dashboard.module.css";

const navItems = [
  { href: "/dashboard/surveys", label: "Surveys" },
  { href: "/dashboard/surveys/create", label: "Create Survey" },
  { href: "/dashboard/send-surveys", label: "Send Surveys" },
  { href: "/dashboard/survey-results", label: "Survey Results" },
  { href: "/dashboard/survey-data", label: "Survey Data" },
  { href: "/dashboard/patients", label: "Survey Assignment" },
  { href: "/dashboard/admin-creation", label: "Admin Creation", fullAdminOnly: true },
];

export default function DashboardLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState("");
  const [access, setAccess] = useState({ role: "", location: "" });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/");
        return;
      }

      const dashboardAccess = await resolveDashboardAccess(user);
      if (!dashboardAccess.allowed) {
        await signOut(auth);
        router.replace("/");
        return;
      }

      setUserEmail(user.email || "");
      setAccess({
        role: dashboardAccess.role,
        location: dashboardAccess.location || "",
      });
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

  const isFullAdmin = access.role === "admin";
  const accessContextValue = {
    role: access.role,
    location: access.location,
    isFullAdmin,
    isLocationAdmin: access.role === "location-admin",
  };

  const visibleNavItems = navItems.filter((item) => !item.fullAdminOnly || isFullAdmin);

  const activeHref = visibleNavItems
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <DashboardAccessProvider value={accessContextValue}>
      <div className={styles.shell}>
        <aside className={styles.sidebar}>
          <h2 className={styles.brand}>Aspire Admin</h2>
          <nav className={styles.nav}>
            {visibleNavItems.map((item) => {
              const active = item.href === activeHref;
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
    </DashboardAccessProvider>
  );
}
