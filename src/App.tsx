// src/App.tsx
import React from "react";
import Landing from "./Landing";
import FullReportView from "./components/FullReportView";

function getPathname() {
  if (typeof window === "undefined") return "/";
  return window.location.pathname || "/";
}

export default function App() {
  const path = getPathname();
  if (path.startsWith("/full")) return <FullReportView />;
  return <Landing />;
}
