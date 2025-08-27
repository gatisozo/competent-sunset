// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App"; // <-- tieši šādi (default), nevis { App }

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
