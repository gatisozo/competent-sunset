import React, { useState } from "react";
import Landing from "./Landing";
import { analyzeUrl } from "./lib/analyze"; // tava jau esošā funkcija (free/full)

export default function App() {
  const [freeReport, setFreeReport] = useState<any | null>(null);
  const [running, setRunning] = useState(false);

  async function handleRunTest(url: string) {
    try {
      setRunning(true);
      setFreeReport(null);
      // sūtām FREE režīmā, lai parādās Free Report rezultāti uz main lapas
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
    // DEV plūsma: atveram Full Report lapu ar to pašu URL (ja bija)
    const url = freeReport?.url ? freeReport.url : "";
    const base = typeof window !== "undefined" ? window.location.origin : "";
    if (url) {
      window.location.href = `${base}/full?url=${encodeURIComponent(url)}`;
    } else {
      window.location.href = `${base}/full`;
    }
  }

  function handleSeeSample() {
    // var atvērt gatavu sample, vai to pašu /full ar parametru ?sample=1
    const base = typeof window !== "undefined" ? window.location.origin : "";
    window.location.href = `${base}/full?sample=1`;
  }

  return (
    <Landing
      freeReport={freeReport}
      onRunTest={handleRunTest}
      onOrderFull={handleOrderFull}
      onSeeSample={handleSeeSample}
    />
  );
}
