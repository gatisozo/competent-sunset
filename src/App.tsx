import React from "react";
import FullReportView from "./components/FullReportView";
import Landing from "./Landing";

function usePathname() {
  const [path, setPath] = React.useState(
    typeof window !== "undefined" ? window.location.pathname : "/"
  );
  React.useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  return path;
}

export default function App() {
  const path = usePathname();
  if (path === "/full") {
    return <FullReportView />;
  }
  return <Landing />;
}
