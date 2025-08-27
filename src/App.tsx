// src/App.tsx
import React, { Suspense } from "react";
import Landing from "./Landing";
import FullReportView from "./components/FullReportView";

// Lazy import: strādā gan ar default, gan ar named export (NewLanding)
const NewLanding = React.lazy(() =>
  import("./NewLanding").then((m: any) => ({
    default: m.default ?? m.NewLanding,
  }))
);

function getPathname() {
  if (typeof window === "undefined") return "/";
  return window.location.pathname || "/";
}

export default function App() {
  const path = getPathname();

  if (path.startsWith("/full")) return <FullReportView />;

  if (path.startsWith("/new")) {
    return (
      <Suspense fallback={<div />}>
        <NewLanding />
      </Suspense>
    );
  }

  return <Landing />;
}
