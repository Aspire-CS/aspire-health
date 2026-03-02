"use client";

import { useEffect, useMemo, useState } from "react";
import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { ChevronDown, ChevronRight } from "lucide-react";
import { db } from "@/lib/firebase-client";
import { useDashboardAccess } from "@/lib/dashboard-access-context";
import { matchesScopedLocation, profileLocation } from "@/lib/location-scope";
import styles from "./page.module.css";

const ADMIN_DOMAINS = ["aspirecounselingservice.com", "aspirecounselingservices.com"];

function getDomain(email) {
  if (!email || !email.includes("@")) return "";
  return email.toLowerCase().split("@").pop() || "";
}

function isAdminProfile(profile) {
  const typeLower = (profile.typeLower || "").toString().toLowerCase();
  if (typeLower === "admin") return true;

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

  return (profile.email || "Unknown patient").toString();
}

function groupType(profile) {
  const calendar = (profile.calendar || "").toString().trim();
  const programName = (profile.programName || "").toString().trim();
  const type = (profile.type || "").toString().trim();

  return calendar || programName || type || "Unassigned";
}

function normalizeAssignedSurveyIds(profile) {
  const raw = profile?.assignedSurveyIds;
  if (!Array.isArray(raw)) return [];
  return raw.map((id) => `${id || ""}`.trim()).filter(Boolean);
}

export default function PatientsPage() {
  const { isLocationAdmin, location: scopedLocation } = useDashboardAccess();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [surveys, setSurveys] = useState([]);

  const [openLocations, setOpenLocations] = useState({});
  const [openGroups, setOpenGroups] = useState({});
  const [openPatients, setOpenPatients] = useState({});
  const [selectedSurveyByPatient, setSelectedSurveyByPatient] = useState({});
  const [assigningPatientId, setAssigningPatientId] = useState("");
  const [removingAssignmentKey, setRemovingAssignmentKey] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    async function loadPageData() {
      setLoading(true);
      try {
        const [profilesSnap, surveysSnap] = await Promise.all([
          getDocs(collection(db, "user_profile")),
          getDocs(collection(db, "surveys")),
        ]);

        const surveyRows = surveysSnap.docs.map((surveyDoc) => ({
          id: surveyDoc.id,
          title: `${surveyDoc.data()?.title || "Untitled survey"}`,
        }));
        surveyRows.sort((a, b) => a.title.localeCompare(b.title));

        const patients = profilesSnap.docs
          .map((docSnap) => {
            const data = docSnap.data() || {};
            return {
              id: docSnap.id,
              email: (data.email || docSnap.id || "").toString().toLowerCase(),
              name: patientName(data),
              mrn: (data.MRN || "").toString().trim(),
              location: profileLocation(data),
              groupType: groupType(data),
              assignedSurveyIds: normalizeAssignedSurveyIds(data),
              active: data.active !== false,
              raw: data,
            };
          })
          .filter((p) => p.active)
          .filter((p) => !isAdminProfile(p.raw))
          .filter((p) => !isLocationAdmin || matchesScopedLocation(p.location, scopedLocation))
          .sort((a, b) => a.name.localeCompare(b.name));

        setSurveys(surveyRows);
        setRows(patients);
      } catch {
        setSurveys([]);
        setRows([]);
      } finally {
        setLoading(false);
      }
    }

    loadPageData();
  }, [isLocationAdmin, scopedLocation]);

  const surveysById = useMemo(() => {
    const map = new Map();
    for (const survey of surveys) {
      map.set(survey.id, survey);
    }
    return map;
  }, [surveys]);

  const groupedByLocation = useMemo(() => {
    const locationMap = new Map();

    for (const row of rows) {
      if (!locationMap.has(row.location)) {
        locationMap.set(row.location, new Map());
      }
      const groupMap = locationMap.get(row.location);
      if (!groupMap.has(row.groupType)) {
        groupMap.set(row.groupType, []);
      }
      groupMap.get(row.groupType).push(row);
    }

    const locations = Array.from(locationMap.entries()).map(([location, groupMap]) => {
      const groups = Array.from(groupMap.entries())
        .map(([group, patients]) => ({ group, patients }))
        .sort((a, b) => a.group.localeCompare(b.group));

      const patientCount = groups.reduce((count, grp) => count + grp.patients.length, 0);
      return { location, groups, patientCount };
    });

    locations.sort((a, b) => a.location.localeCompare(b.location));
    return locations;
  }, [rows]);

  const filteredLocations = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return groupedByLocation;

    return groupedByLocation
      .map((locationBlock) => {
        const groups = locationBlock.groups
          .map((groupBlock) => {
            const patients = groupBlock.patients.filter((patient) => {
              const hay = `${patient.name} ${patient.email} ${patient.mrn}`.toLowerCase();
              return hay.includes(term);
            });
            return { ...groupBlock, patients };
          })
          .filter((groupBlock) => groupBlock.patients.length > 0);

        const patientCount = groups.reduce((count, grp) => count + grp.patients.length, 0);
        return { ...locationBlock, groups, patientCount };
      })
      .filter((locationBlock) => locationBlock.groups.length > 0);
  }, [groupedByLocation, searchTerm]);

  useEffect(() => {
    if (!groupedByLocation.length) return;

    setOpenLocations((prev) => {
      const next = { ...prev };
      for (const item of groupedByLocation) {
        if (!(item.location in next)) {
          next[item.location] = false;
        }
      }
      return next;
    });

    setOpenGroups((prev) => {
      const next = { ...prev };
      for (const location of groupedByLocation) {
        for (const group of location.groups) {
          const key = `${location.location}::${group.group}`;
          if (!(key in next)) {
            next[key] = false;
          }
        }
      }
      return next;
    });
  }, [groupedByLocation]);

  function toggleLocation(locationName) {
    setOpenLocations((prev) => ({
      ...prev,
      [locationName]: !prev[locationName],
    }));
  }

  function toggleGroup(groupKey) {
    setOpenGroups((prev) => ({
      ...prev,
      [groupKey]: !prev[groupKey],
    }));
  }

  function togglePatient(patientId) {
    setOpenPatients((prev) => ({
      ...prev,
      [patientId]: !prev[patientId],
    }));
  }

  function handleSelectSurvey(patientId, surveyId) {
    setSelectedSurveyByPatient((prev) => ({
      ...prev,
      [patientId]: surveyId,
    }));
  }

  async function assignSurveyToPatient(patient) {
    const selectedId = selectedSurveyByPatient[patient.id] || "";
    if (!selectedId) return;
    if (patient.assignedSurveyIds.includes(selectedId)) return;

    setAssigningPatientId(patient.id);
    try {
      await updateDoc(doc(db, "user_profile", patient.id), {
        assignedSurveyIds: arrayUnion(selectedId),
        updatedAt: serverTimestamp(),
      });

      setRows((prevRows) =>
        prevRows.map((row) => {
          if (row.id !== patient.id) return row;
          return {
            ...row,
            assignedSurveyIds: [...row.assignedSurveyIds, selectedId],
          };
        })
      );

      setSelectedSurveyByPatient((prev) => ({
        ...prev,
        [patient.id]: "",
      }));
    } finally {
      setAssigningPatientId("");
    }
  }

  async function removeSurveyFromPatient(patient, surveyId) {
    const assignmentKey = `${patient.id}:${surveyId}`;
    setRemovingAssignmentKey(assignmentKey);

    try {
      await updateDoc(doc(db, "user_profile", patient.id), {
        assignedSurveyIds: arrayRemove(surveyId),
        updatedAt: serverTimestamp(),
      });

      setRows((prevRows) =>
        prevRows.map((row) => {
          if (row.id !== patient.id) return row;
          return {
            ...row,
            assignedSurveyIds: row.assignedSurveyIds.filter((id) => id !== surveyId),
          };
        })
      );
    } finally {
      setRemovingAssignmentKey("");
    }
  }

  return (
    <main>
      <h1 className={styles.title}>Survey Assignment</h1>
      <p className={styles.subtitle}>
        Locations contain groups, and groups contain patients. Expand a patient to assign surveys.
      </p>

      <div className={styles.searchRow}>
        <input
          className={styles.searchInput}
          type="text"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Search patient name"
        />
      </div>

      {loading ? <p className={styles.state}>Loading patients...</p> : null}

      {!loading && filteredLocations.length === 0 ? (
        <p className={styles.state}>No matching patients found.</p>
      ) : null}

      {!loading && filteredLocations.length > 0 ? (
        <div className={styles.groupList}>
          {filteredLocations.map((locationBlock) => {
            const locationOpen = !!openLocations[locationBlock.location];

            return (
              <section className={styles.locationCard} key={locationBlock.location}>
                <button
                  className={styles.locationHeader}
                  type="button"
                  onClick={() => toggleLocation(locationBlock.location)}
                >
                  <span className={styles.locationName}>{locationBlock.location}</span>
                  <span className={styles.groupMeta}>{locationBlock.patientCount} patients</span>
                  <span className={styles.chevron} aria-hidden="true">
                    {locationOpen ? (
                      <ChevronDown className={styles.chevronIcon} />
                    ) : (
                      <ChevronRight className={styles.chevronIcon} />
                    )}
                  </span>
                </button>

                <div
                  className={`${styles.locationBody} ${locationOpen ? styles.expanded : ""}`}
                  aria-hidden={!locationOpen}
                >
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
                            <span className={styles.groupMeta}>{groupBlock.patients.length} patients</span>
                            <span className={styles.chevron} aria-hidden="true">
                              {groupOpen ? (
                                <ChevronDown className={styles.chevronIcon} />
                              ) : (
                                <ChevronRight className={styles.chevronIcon} />
                              )}
                            </span>
                          </button>

                          <div
                            className={`${styles.patientList} ${groupOpen ? styles.expanded : ""}`}
                            aria-hidden={!groupOpen}
                          >
                            {groupBlock.patients.map((patient) => {
                                const patientOpen = !!openPatients[patient.id];
                                const assignedSurveys = patient.assignedSurveyIds
                                  .map((surveyId) => surveysById.get(surveyId))
                                  .filter(Boolean);
                                const selectedSurveyId = selectedSurveyByPatient[patient.id] || "";
                                const assignDisabled =
                                  !selectedSurveyId ||
                                  assigningPatientId === patient.id ||
                                  patient.assignedSurveyIds.includes(selectedSurveyId);

                                return (
                                  <div className={styles.patientBlock} key={patient.id}>
                                    <div className={styles.patientRow}>
                                      <button
                                        className={styles.patientToggle}
                                        type="button"
                                        onClick={() => togglePatient(patient.id)}
                                      >
                                        <span className={styles.patientName}>{patient.name}</span>
                                        <span className={styles.patientMrn}>{patient.mrn || "No MRN"}</span>
                                        <span className={styles.chevronSmall} aria-hidden="true">
                                          {patientOpen ? (
                                            <ChevronDown className={styles.chevronIcon} />
                                          ) : (
                                            <ChevronRight className={styles.chevronIcon} />
                                          )}
                                        </span>
                                      </button>
                                    </div>

                                    <div
                                      className={`${styles.patientDropdown} ${patientOpen ? styles.expanded : ""}`}
                                      aria-hidden={!patientOpen}
                                    >
                                        <div className={styles.assignedHeader}>Assigned Surveys</div>
                                        {assignedSurveys.length > 0 ? (
                                          <ul className={styles.assignedList}>
                                            {assignedSurveys.map((survey) => (
                                              <li className={styles.assignedRow} key={`${patient.id}-${survey.id}`}>
                                                <span>{survey.title}</span>
                                                <button
                                                  className={styles.removeSurveyButton}
                                                  type="button"
                                                  disabled={removingAssignmentKey === `${patient.id}:${survey.id}`}
                                                  onClick={() => removeSurveyFromPatient(patient, survey.id)}
                                                >
                                                  {removingAssignmentKey === `${patient.id}:${survey.id}`
                                                    ? "Removing..."
                                                    : "Remove"}
                                                </button>
                                              </li>
                                            ))}
                                          </ul>
                                        ) : (
                                          <p className={styles.emptyAssigned}>No surveys assigned yet.</p>
                                        )}

                                        <div className={styles.assignControls}>
                                          <select
                                            className={styles.surveySelect}
                                            value={selectedSurveyId}
                                            onChange={(e) => handleSelectSurvey(patient.id, e.target.value)}
                                          >
                                            <option value="">Select a survey</option>
                                            {surveys.map((survey) => (
                                              <option key={survey.id} value={survey.id}>
                                                {survey.title}
                                              </option>
                                            ))}
                                          </select>

                                          <button
                                            className={styles.addSurveyButton}
                                            type="button"
                                            disabled={assignDisabled}
                                            onClick={() => assignSurveyToPatient(patient)}
                                          >
                                            {assigningPatientId === patient.id ? "Adding..." : "Add Survey"}
                                          </button>
                                        </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                        </section>
                      );
                    })}
                </div>
              </section>
            );
          })}
        </div>
      ) : null}
    </main>
  );
}
