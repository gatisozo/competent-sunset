// src/App.tsx
import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import Landing from "./Landing";
import FullReportView from "./components/FullReportView";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Free report (galvenā lapa) */}
        <Route path="/" element={<Landing />} />

        {/* Full report */}
        <Route path="/full" element={<FullReportView />} />

        {/* Fallback uz / */}
        <Route path="*" element={<Landing />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
