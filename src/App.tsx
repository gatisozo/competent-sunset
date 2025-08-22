import React, { useMemo, useState } from "react";
import Landing from "./Landing";
import FullReportView from "./components/FullReportView";
import { analyzeUrl } from "./lib/analyze"; // jau esošā funkcija (free/full)

export default function App() {
  // --- vienkārša SPA routēšana pēc path ---
  const pathname =
    typeof window !== "undefined" ? window.location.pathname : "/";

  // --- state priekš Free testa (kā Tev bija) ---
  const [freeReport, setFreeReport] = useState<any | null>(null);
  const [running, setRunning] = useState(false);

  async function handleRunTest(url: string) {
    try {
      setRunning(true);
      setFreeReport(null);
      // FREE režīms -> parādām Free Report uz galvenās lapas
      const data = await analyzeUrl(url, "free");
      setFreeReport(data);
    } catch (e) {
      console.error("Analyze failed", e);
      alert("We couldn’t analyze that URL. Try another page.");
    } finally {
      setRunning(false);
    }
  }

  function handleOrderFull() {
    // Ja ir pēdējais notestētais URL, atveram /full ar autostartu
    const url = freeReport?.url ? freeReport.url : "";
    const base = typeof window !== "undefined" ? window.location.origin : "";
    if (url) {
      window.location.href = `${base}/full?autostart=1&url=${encodeURIComponent(
        url
      )}`;
    } else {
      window.location.href = `${base}/full`;
    }
  }

  function handleSeeSample() {
    const base = typeof window !== "undefined" ? window.location.origin : "";
    window.location.href = `${base}/full?sample=1`;
  }

  // --- /full maršruts -> renderējam FullReportView (tur jau ir autostarts no query) ---
  if (pathname === "/full") {
    return <FullReportView />;
  }

  // --- Citādi -> Landing (kā līdz šim) ---
  return (
    <Landing
      freeReport={freeReport}
      onRunTest={handleRunTest}
      onOrderFull={handleOrderFull}
      onSeeSample={handleSeeSample}
    />
  );
}
// piemērs:
<Route path="/full" element={<FullReportView />} />;
