"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase-client";
import { useDashboardAccess } from "@/lib/dashboard-access-context";
import { matchesScopedLocation, profileLocation } from "@/lib/location-scope";
import { canonicalCity, locationVariants } from "@/lib/locations";
import styles from "./page.module.css";

function formatTimestamp(value) {
  if (!value) return "-";
  try {
    const date = typeof value?.toDate === "function" ? value.toDate() : new Date(value);
    if (Number.isNaN(date.getTime())) return "-";

    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  } catch {
    return "-";
  }
}

function normalizeStatus(status) {
  const value = `${status || "unfinished"}`.toLowerCase().trim();
  return value === "finished" ? "finished" : "unfinished";
}

function groupLabel(profile) {
  const calendar = (profile?.calendar || "").toString().trim();
  const programName = (profile?.programName || "").toString().trim();
  const type = (profile?.type || "").toString().trim();
  return calendar || programName || type || "Unassigned";
}

export default function SurveyResultsPage() {
  const { isLocationAdmin, location: scopedLocation } = useDashboardAccess();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [openLocations, setOpenLocations] = useState({});
  const [openGroups, setOpenGroups] = useState({});

  useEffect(() => {
    async function loadResults() {
      setLoading(true);
      try {
        const variants = locationVariants(scopedLocation);
        const city = canonicalCity(scopedLocation);
        let instanceDocs = [];
        let profileDocs = [];

        if (!isLocationAdmin) {
          const [instancesSnap, profilesSnap] = await Promise.all([
            getDocs(collection(db, "survey_instances")),
            getDocs(collection(db, "user_profile")),
          ]);
          instanceDocs = instancesSnap.docs;
          profileDocs = profilesSnap.docs;
        } else if (variants.length > 0) {
          const instanceMap = new Map();
          const profileMap = new Map();

          const instanceQueries = [
            query(collection(db, "survey_instances"), where("patientLocation", "in", variants)),
            query(collection(db, "survey_instances"), where("patientLocationCity", "==", city)),
          ];
          const profileQueries = [
            query(collection(db, "user_profile"), where("location", "in", variants)),
            query(collection(db, "user_profile"), where("programLocation", "in", variants)),
          ];

          for (const scopedQuery of instanceQueries) {
            try {
              const snap = await getDocs(scopedQuery);
              for (const docSnap of snap.docs) instanceMap.set(docSnap.id, docSnap);
            } catch (err) {
              const code = (err?.code || "").toString();
              if (code !== "permission-denied" && code !== "firestore/permission-denied") throw err;
            }
          }

          for (const scopedQuery of profileQueries) {
            try {
              const snap = await getDocs(scopedQuery);
              for (const docSnap of snap.docs) profileMap.set(docSnap.id, docSnap);
            } catch (err) {
              const code = (err?.code || "").toString();
              if (code !== "permission-denied" && code !== "firestore/permission-denied") throw err;
            }
          }

          instanceDocs = Array.from(instanceMap.values());
          profileDocs = Array.from(profileMap.values());
        }

        const profileByDocId = new Map();
        const profileByEmail = new Map();

        for (const profileDoc of profileDocs) {
          const data = profileDoc.data() || {};
          profileByDocId.set(profileDoc.id, data);

          const email = (data.email || "").toString().toLowerCase().trim();
          if (email) profileByEmail.set(email, data);
        }

        const instances = instanceDocs.map((instanceDoc) => {
          const data = instanceDoc.data() || {};
          const patientDocId = (data.patientDocId || "").toString().trim();
          const patientEmail = (data.patientEmail || "").toString().toLowerCase().trim();

          const profile = profileByDocId.get(patientDocId) || profileByEmail.get(patientEmail) || {};
          const profileResolvedLocation = profileLocation(profile);
          const fallbackLocation = (data.patientLocation || "").toString().trim();
          const resolvedLocation =
            profileResolvedLocation !== "Unassigned Location"
              ? profileResolvedLocation
              : fallbackLocation || profileResolvedLocation;

          return {
            id: instanceDoc.id,
            patientName: (data.patientName || "Unknown").toString(),
            patientEmail: (data.patientEmail || "").toString(),
            patientMrn: (data.patientMrn || "").toString(),
            surveyTitle: (data.surveyTitle || "Untitled survey").toString(),
            status: normalizeStatus(data.status),
            sentAt: data.sentAt || null,
            completedAt: data.completedAt || null,
            location: resolvedLocation,
            group: groupLabel(profile),
          };
        });

        const scopedInstances = instances.filter(
          (row) => !isLocationAdmin || matchesScopedLocation(row.location, scopedLocation)
        );

        scopedInstances.sort((a, b) => {
          const aDate = a.sentAt?.toDate ? a.sentAt.toDate().getTime() : 0;
          const bDate = b.sentAt?.toDate ? b.sentAt.toDate().getTime() : 0;
          return bDate - aDate;
        });

        setRows(scopedInstances);
      } catch {
        setRows([]);
      } finally {
        setLoading(false);
      }
    }

    loadResults();
  }, [isLocationAdmin, scopedLocation]);

  const filteredRows = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    return rows.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (!search) return true;

      const hay = `${row.patientName} ${row.patientEmail} ${row.patientMrn} ${row.surveyTitle}`.toLowerCase();
      return hay.includes(search);
    });
  }, [rows, statusFilter, searchTerm]);

  const grouped = useMemo(() => {
    const locationMap = new Map();

    for (const row of filteredRows) {
      if (!locationMap.has(row.location)) {
        locationMap.set(row.location, new Map());
      }
      const groupMap = locationMap.get(row.location);

      if (!groupMap.has(row.group)) {
        groupMap.set(row.group, []);
      }
      groupMap.get(row.group).push(row);
    }

    const locations = Array.from(locationMap.entries()).map(([location, groupMap]) => {
      const groups = Array.from(groupMap.entries())
        .map(([group, items]) => ({ group, items }))
        .sort((a, b) => a.group.localeCompare(b.group));

      const itemCount = groups.reduce((count, group) => count + group.items.length, 0);
      const unfinishedCount = groups.reduce(
        (count, group) =>
          count + group.items.filter((item) => item.status === "unfinished").length,
        0
      );
      const finishedCount = groups.reduce(
        (count, group) =>
          count + group.items.filter((item) => item.status === "finished").length,
        0
      );

      return { location, groups, itemCount, unfinishedCount, finishedCount };
    });

    locations.sort((a, b) => a.location.localeCompare(b.location));
    return locations;
  }, [filteredRows]);

  const summary = useMemo(() => {
    const unfinished = filteredRows.filter((row) => row.status === "unfinished").length;
    const finished = filteredRows.filter((row) => row.status === "finished").length;

    return { total: filteredRows.length, unfinished, finished };
  }, [filteredRows]);

  useEffect(() => {
    if (!grouped.length) return;

    setOpenLocations((prev) => {
      const next = { ...prev };
      for (const location of grouped) {
        if (!(location.location in next)) {
          next[location.location] = false;
        }
      }
      return next;
    });

    setOpenGroups((prev) => {
      const next = { ...prev };
      for (const location of grouped) {
        for (const group of location.groups) {
          const key = `${location.location}::${group.group}`;
          if (!(key in next)) {
            next[key] = false;
          }
        }
      }
      return next;
    });
  }, [grouped]);

  function toggleLocation(locationName) {
    setOpenLocations((prev) => ({ ...prev, [locationName]: !prev[locationName] }));
  }

  function toggleGroup(groupKey) {
    setOpenGroups((prev) => ({ ...prev, [groupKey]: !prev[groupKey] }));
  }

  return (
    <main>
      <h1 className={styles.title}>Survey Results</h1>
      <p className={styles.subtitle}>Log view of unfinished and finished survey instances.</p>

      <div className={styles.filters}>
        <input
          className={styles.input}
          type="text"
          placeholder="Search patient or survey"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />

        <select
          className={styles.select}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All Statuses</option>
          <option value="unfinished">Unfinished</option>
          <option value="finished">Finished</option>
        </select>
      </div>

      <div className={styles.summaryRow}>
        <span>Total: {summary.total}</span>
        <span>Unfinished: {summary.unfinished}</span>
        <span>Finished: {summary.finished}</span>
      </div>

      {loading ? <p className={styles.state}>Loading results...</p> : null}
      {!loading && grouped.length === 0 ? <p className={styles.state}>No survey logs found.</p> : null}

      {!loading && grouped.length > 0 ? (
        <div className={styles.locationList}>
          {grouped.map((locationBlock) => {
            const locationOpen = !!openLocations[locationBlock.location];
            return (
              <section className={styles.locationCard} key={locationBlock.location}>
                <button
                  className={styles.locationHeader}
                  type="button"
                  onClick={() => toggleLocation(locationBlock.location)}
                >
                  <span className={styles.locationName}>{locationBlock.location}</span>
                  <span className={styles.meta}>
                    Unfinished: {locationBlock.unfinishedCount} | Finished:{" "}
                    {locationBlock.finishedCount}
                  </span>
                  {locationOpen ? (
                    <ChevronDown className={styles.chevron} />
                  ) : (
                    <ChevronRight className={styles.chevron} />
                  )}
                </button>

                {locationOpen ? (
                  <div className={styles.locationBody}>
                    {locationBlock.groups.map((groupBlock) => {
                      const groupKey = `${locationBlock.location}::${groupBlock.group}`;
                      const groupOpen = !!openGroups[groupKey];

                      return (
                        <section className={styles.groupCard} key={groupKey}>
                          <button
                            className={styles.groupHeader}
                            type="button"
                            onClick={() => toggleGroup(groupKey)}
                          >
                            <span className={styles.groupName}>{groupBlock.group}</span>
                            <span className={styles.meta}>{groupBlock.items.length} logs</span>
                            {groupOpen ? (
                              <ChevronDown className={styles.chevron} />
                            ) : (
                              <ChevronRight className={styles.chevron} />
                            )}
                          </button>

                          {groupOpen ? (
                            <div className={styles.logList}>
                              {groupBlock.items.map((row) => (
                                <article className={styles.logRow} key={row.id}>
                                  <div className={styles.left}>
                                    <strong>{row.patientName}</strong>
                                    <span>{row.patientEmail || "-"}</span>
                                    <span>MRN: {row.patientMrn || "-"}</span>
                                  </div>

                                  <div className={styles.center}>
                                    <strong>{row.surveyTitle}</strong>
                                    <span>Sent: {formatTimestamp(row.sentAt)}</span>
                                    <span>Completed: {formatTimestamp(row.completedAt)}</span>
                                  </div>

                                  <div className={styles.right}>
                                    <span
                                      className={`${styles.badge} ${
                                        row.status === "finished"
                                          ? styles.badgeFinished
                                          : styles.badgeUnfinished
                                      }`}
                                    >
                                      {row.status}
                                    </span>
                                  </div>
                                </article>
                              ))}
                            </div>
                          ) : null}
                        </section>
                      );
                    })}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      ) : null}
    </main>
  );
}
