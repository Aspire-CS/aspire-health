"use client";

import { createContext, useContext } from "react";

const DashboardAccessContext = createContext({
  role: "admin",
  location: "",
  isFullAdmin: true,
  isLocationAdmin: false,
});

export function DashboardAccessProvider({ value, children }) {
  return (
    <DashboardAccessContext.Provider value={value}>{children}</DashboardAccessContext.Provider>
  );
}

export function useDashboardAccess() {
  return useContext(DashboardAccessContext);
}

