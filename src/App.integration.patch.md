**Add imports** at the top of your `App.tsx`:

```ts
import type { CroAudit } from "./lib/analyze";
import { analyzeUrl } from "./lib/analyze";
```

**Add state** inside the component:

```ts
const [aiAudit, setAiAudit] = useState<CroAudit | null>(null);
const [aiError, setAiError] = useState("");
```

**Call the API** at the end of your `runTest()` when progress hits 100%:

```ts
try {
  const audit = await analyzeUrl(url);
  setAiAudit(audit);
} catch (e: any) {
  setAiError(e.message || "AI error");
}
```

**Render real results** in the Preview section:

```tsx
{
  aiAudit ? (
    <div className="grid lg:grid-cols-3 gap-6 md:gap-8">
      <div className="lg:col-span-1">
        <h2 className="text-2xl md:text-3xl font-semibold">
          Your Website Summary
        </h2>
        <p className="mt-2 text-slate-600">
          AI-generated score and top blockers.
        </p>
        <div className="mt-5 p-5 rounded-2xl border bg-white">
          <div className="text-sm text-slate-500">
            Conversion Readiness Score
          </div>
          <div className="mt-2 h-3 rounded-full bg-slate-200 overflow-hidden">
            <div
              className="h-full bg-[#006D77]"
              style={{ width: `${aiAudit.score}%` }}
            />
          </div>
          <div className="mt-2 text-sm font-medium">{aiAudit.score} / 100</div>
        </div>
      </div>
      <div className="lg:col-span-2 grid gap-4">
        {aiAudit.key_findings.map((f, i) => (
          <div key={i} className="p-5 rounded-2xl border bg-white">
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${
                  f.impact === "high"
                    ? "bg-red-500"
                    : f.impact === "medium"
                    ? "bg-amber-500"
                    : "bg-emerald-500"
                }`}
              />
              <div className="font-medium">{f.title}</div>
            </div>
            <p className="text-sm text-slate-600 mt-1">{f.recommendation}</p>
          </div>
        ))}
      </div>
    </div>
  ) : (
    // keep your existing placeholder rendering here
    <>{/* existing fallback */}</>
  );
}
```
