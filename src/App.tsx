// src/App.tsx
import React from "react";
import Landing from "./Landing";
import FullReportView from "./components/FullReportView";

/**
 * Neliela helper-funkcija, lai bez react-router pārslēgtos
 * starp lapām pēc URL ceļa.
 */
function getPathname() {
  if (typeof window === "undefined") return "/";
  return window.location.pathname || "/";
}

export default function App() {
  const path = getPathname();

  // Viss, kas sākas ar /full → Full report
  if (path.startsWith("/full")) {
    return <FullReportView />;
  }

  // Pretējā gadījumā → Landing (Free report)
  return <Landing />;
}
