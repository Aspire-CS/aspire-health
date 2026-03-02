"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase-client";
import { useDashboardAccess } from "@/lib/dashboard-access-context";
import { matchesScopedLocation, profileLocation } from "@/lib/location-scope";
import { canonicalCity, locationVariants } from "@/lib/locations";
import styles from "./page.module.css";

function groupLabel(profile) {
  const calendar = (profile?.calendar || "").toString().trim();
  const programName = (profile?.programName || "").toString().trim();
  const type = (profile?.type || "").toString().trim();
  return calendar || programName || type || "Unassigned";
}

function dateOnlyLabel(value) {
  if (!value) return "-";
  const date = typeof value?.toDate === "function" ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "2-digit",
  }).format(date);
}

function dateOnlyKey(value) {
  if (!value) return "";
  const date = typeof value?.toDate === "function" ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const yyyy = date.getFullYear();
  const mm = `${date.getMonth() + 1}`.padStart(2, "0");
  const dd = `${date.getDate()}`.padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function normalizeStatus(status) {
  const value = `${status || "unfinished"}`.toLowerCase().trim();
  return value === "finished" ? "finished" : "unfinished";
}

function hasNumericScore(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function scoreFromAnswers(rawAnswers) {
  if (!Array.isArray(rawAnswers) || rawAnswers.length === 0) return null;

  let total = 0;
  for (const answer of rawAnswers) {
    if (typeof answer !== "number" || !Number.isFinite(answer)) return null;
    if (![0, 1, 2, 3].includes(answer)) return null;
    total += answer;
  }
  return total;
}

function chartMaxForSurvey(survey) {
  const pointsMax = survey.points.reduce(
    (max, point) => (typeof point.score === "number" ? Math.max(max, point.score) : max),
    0
  );
  const declaredMax =
    typeof survey.maxPossibleScore === "number" && Number.isFinite(survey.maxPossibleScore)
      ? survey.maxPossibleScore
      : 0;
  return Math.max(12, pointsMax, declaredMax);
}

export default function SurveyDataPage() {
  const { isLocationAdmin, location: scopedLocation } = useDashboardAccess();
  const [loading, setLoading] = useState(true);
  const [patients, setPatients] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [openLocations, setOpenLocations] = useState({});
  const [openGroups, setOpenGroups] = useState({});
  const [openPatients, setOpenPatients] = useState({});

  useEffect(() => {
    async function loadData() {
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

        const patientMap = new Map();

        for (const instanceDoc of instanceDocs) {
          const data = instanceDoc.data() || {};
          const status = normalizeStatus(data.status);

          const patientDocId = (data.patientDocId || "").toString().trim();
          const patientEmail = (data.patientEmail || "").toString().toLowerCase().trim();
          const patientKey = patientDocId || patientEmail || instanceDoc.id;

          const profile = profileByDocId.get(patientDocId) || profileByEmail.get(patientEmail) || {};
          const profileResolvedLocation = profileLocation(profile);
          const fallbackLocation = (data.patientLocation || "").toString().trim();
          const resolvedLocation =
            profileResolvedLocation !== "Unassigned Location"
              ? profileResolvedLocation
              : fallbackLocation || profileResolvedLocation;

          if (!patientMap.has(patientKey)) {
            patientMap.set(patientKey, {
              key: patientKey,
              docId: patientDocId,
              email: (data.patientEmail || "").toString(),
              name: (data.patientName || "Unknown").toString(),
              mrn: (data.patientMrn || "").toString(),
              location: resolvedLocation,
              group: groupLabel(profile),
              surveys: new Map(),
            });
          }

          const patient = patientMap.get(patientKey);
          const surveyId = (data.surveyId || "").toString();
          const surveyTitle = (data.surveyTitle || "Untitled survey").toString();
          const surveyKey = surveyId || surveyTitle;

          if (!patient.surveys.has(surveyKey)) {
            patient.surveys.set(surveyKey, {
              surveyId,
              surveyTitle,
              finishedCount: 0,
              unfinishedCount: 0,
              maxPossibleScore:
                typeof data.maxPossibleScore === "number" && Number.isFinite(data.maxPossibleScore)
                  ? data.maxPossibleScore
                  : 0,
              points: [],
            });
          }

          const survey = patient.surveys.get(surveyKey);
          if (
            typeof data.maxPossibleScore === "number" &&
            Number.isFinite(data.maxPossibleScore) &&
            data.maxPossibleScore > survey.maxPossibleScore
          ) {
            survey.maxPossibleScore = data.maxPossibleScore;
          }

          if (status === "finished") {
            survey.finishedCount += 1;

            const resolvedScore = hasNumericScore(data.score)
              ? data.score
              : scoreFromAnswers(data.answers);

            if (resolvedScore !== null) {
              const completedAt = data.completedAt || null;
              const pointDate = completedAt?.toDate ? completedAt.toDate() : completedAt ? new Date(completedAt) : null;

              survey.points.push({
                score: resolvedScore,
                date: dateOnlyLabel(completedAt),
                dayKey: dateOnlyKey(completedAt),
                timestamp: pointDate && !Number.isNaN(pointDate.getTime()) ? pointDate.getTime() : 0,
              });
            }
          } else {
            survey.unfinishedCount += 1;
          }
        }

        const patientRows = Array.from(patientMap.values())
          .map((patient) => {
            const surveys = Array.from(patient.surveys.values())
              .map((survey) => {
                const latestByDay = new Map();
                for (const point of survey.points) {
                  const key = point.dayKey || point.date || `${point.timestamp}`;
                  const existing = latestByDay.get(key);
                  if (!existing || point.timestamp >= existing.timestamp) {
                    latestByDay.set(key, point);
                  }
                }

                const sortedPoints = Array.from(latestByDay.values()).sort(
                  (a, b) => a.timestamp - b.timestamp
                );
                const points = sortedPoints.map((pt, idx) => ({
                  index: idx + 1,
                  date: pt.date,
                  score: pt.score,
                }));

                return {
                  ...survey,
                  chartMax: chartMaxForSurvey({ ...survey, points }),
                  points,
                };
              })
              .sort((a, b) => a.surveyTitle.localeCompare(b.surveyTitle));

            return {
              ...patient,
              surveys,
            };
          })
          .filter(
            (patient) => !isLocationAdmin || matchesScopedLocation(patient.location, scopedLocation)
          )
          .sort((a, b) => a.name.localeCompare(b.name));

        setPatients(patientRows);
      } catch {
        setPatients([]);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [isLocationAdmin, scopedLocation]);

  const filteredPatients = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    if (!search) return patients;

    return patients.filter((patient) => {
      const hay = `${patient.name} ${patient.email} ${patient.mrn}`.toLowerCase();
      return hay.includes(search);
    });
  }, [patients, searchTerm]);

  const grouped = useMemo(() => {
    const locationMap = new Map();

    for (const patient of filteredPatients) {
      if (!locationMap.has(patient.location)) {
        locationMap.set(patient.location, new Map());
      }
      const groupMap = locationMap.get(patient.location);

      if (!groupMap.has(patient.group)) {
        groupMap.set(patient.group, []);
      }
      groupMap.get(patient.group).push(patient);
    }

    const locations = Array.from(locationMap.entries()).map(([location, groupMap]) => {
      const groups = Array.from(groupMap.entries())
        .map(([group, patientsInGroup]) => ({ group, patients: patientsInGroup }))
        .sort((a, b) => a.group.localeCompare(b.group));

      const patientCount = groups.reduce((sum, group) => sum + group.patients.length, 0);
      return { location, groups, patientCount };
    });

    locations.sort((a, b) => a.location.localeCompare(b.location));
    return locations;
  }, [filteredPatients]);

  useEffect(() => {
    if (!grouped.length) return;

    setOpenLocations((prev) => {
      const next = { ...prev };
      for (const location of grouped) {
        if (!(location.location in next)) next[location.location] = false;
      }
      return next;
    });

    setOpenGroups((prev) => {
      const next = { ...prev };
      for (const location of grouped) {
        for (const group of location.groups) {
          const key = `${location.location}::${group.group}`;
          if (!(key in next)) next[key] = false;
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

  function togglePatient(patientKey) {
    setOpenPatients((prev) => ({ ...prev, [patientKey]: !prev[patientKey] }));
  }

  return (
    <main>
      <h1 className={styles.title}>Survey Data</h1>
      <p className={styles.subtitle}>
        Patient trend graphs by survey, grouped by location and group.
      </p>

      <div className={styles.searchRow}>
        <input
          className={styles.searchInput}
          type="text"
          placeholder="Search patient"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {loading ? <p className={styles.state}>Loading survey data...</p> : null}
      {!loading && grouped.length === 0 ? <p className={styles.state}>No patient survey data found.</p> : null}

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
                  <span className={styles.meta}>{locationBlock.patientCount} patients</span>
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
                            <span className={styles.meta}>{groupBlock.patients.length} patients</span>
                            {groupOpen ? (
                              <ChevronDown className={styles.chevron} />
                            ) : (
                              <ChevronRight className={styles.chevron} />
                            )}
                          </button>

                          {groupOpen ? (
                            <div className={styles.patientList}>
                              {groupBlock.patients.map((patient) => {
                                const patientOpen = !!openPatients[patient.key];

                                return (
                                  <article className={styles.patientCard} key={patient.key}>
                                    <button
                                      className={styles.patientHeader}
                                      type="button"
                                      onClick={() => togglePatient(patient.key)}
                                    >
                                      <span className={styles.patientName}>{patient.name}</span>
                                      <span className={styles.patientMeta}>MRN: {patient.mrn || "-"}</span>
                                      {patientOpen ? (
                                        <ChevronDown className={styles.chevron} />
                                      ) : (
                                        <ChevronRight className={styles.chevron} />
                                      )}
                                    </button>

                                    {patientOpen ? (
                                      <div className={styles.patientBody}>
                                        {patient.surveys.length === 0 ? (
                                          <p className={styles.state}>No survey history for this patient yet.</p>
                                        ) : (
                                          <div className={styles.surveyCharts}>
                                            {patient.surveys.map((survey) => (
                                              <section className={styles.surveyCard} key={`${patient.key}-${survey.surveyId || survey.surveyTitle}`}>
                                                <div className={styles.surveyHeader}>
                                                  <h3>{survey.surveyTitle}</h3>
                                                  <p>
                                                    Finished: {survey.finishedCount} | Unfinished: {survey.unfinishedCount}
                                                  </p>
                                                </div>

                                                {survey.points.length > 0 ? (
                                                  <div className={styles.chartWrap}>
                                                    <ResponsiveContainer width="100%" height={240}>
                                                      <LineChart data={survey.points} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                                        <CartesianGrid strokeDasharray="3 3" stroke="#dbe7d1" />
                                                        <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                                                        <YAxis domain={[0, survey.chartMax]} tick={{ fontSize: 12 }} />
                                                        <Tooltip />
                                                        <Line
                                                          type="monotone"
                                                          dataKey="score"
                                                          stroke="#638f38"
                                                          strokeWidth={2.5}
                                                          dot={{ r: 3 }}
                                                          activeDot={{ r: 5 }}
                                                        />
                                                      </LineChart>
                                                    </ResponsiveContainer>
                                                  </div>
                                                ) : (
                                                  <p className={styles.state}>
                                                    No completed score data yet for this survey.
                                                  </p>
                                                )}
                                              </section>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    ) : null}
                                  </article>
                                );
                              })}
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
