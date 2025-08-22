import React, { useState } from "react";
import Landing from "./Landing";
import FullReportView from "./components/FullReportView";
import { analyzeUrl } from "./lib/analyze";

function normalizeUrl(input?: string) {
  const s = (input || "").trim();
  if (!s) return "";
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(s) ? s : `https://${s}`;
}

export default function App() {
  const pathname =
    typeof window !== "undefined" ? window.location.pathname : "/";

  const [freeReport, setFreeReport] = useState<any | null>(null);
  const [running, setRunning] = useState(false);

  async function handleRunTest(url: string) {
    try {
      setRunning(true);
      setFreeReport(null);
      const data = await analyzeUrl(url, "free");
      setFreeReport(data);
    } catch (e) {
      console.error("Analyze failed", e);
      alert("We couldn’t analyze that URL. Try another page.");
    } finally {
      setRunning(false);
    }
  }

  // ⬇︎ pieņem izvēles URL no Landing (ja nav – izmanto pēdējo freeReport.url)
  function handleOrderFull(u?: string) {
    const chosen = normalizeUrl(u) || normalizeUrl(freeReport?.url);
    const base = typeof window !== "undefined" ? window.location.origin : "";
    if (chosen) {
      window.location.href = `${base}/full?autostart=1&url=${encodeURIComponent(
        chosen
      )}`;
    } else {
      window.location.href = `${base}/full`;
    }
  }

  function handleSeeSample() {
    const base = typeof window !== "undefined" ? window.location.origin : "";
    window.location.href = `${base}/full?sample=1`;
  }

  if (pathname === "/full") {
    return <FullReportView />;
  }

  return (
    <Landing
      freeReport={freeReport}
      onRunTest={handleRunTest}
      onOrderFull={handleOrderFull} // ⬅︎ Landing tagad nodod pēdējo URL
      onSeeSample={handleSeeSample}
    />
  );
}
