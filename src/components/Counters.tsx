import React, { useEffect, useRef, useState } from "react";

function useCountUp(target: number, duration = 1200, startWhenVisible = true) {
  const [val, setVal] = useState(0);
  const elRef = useRef<HTMLDivElement | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!startWhenVisible) return;

    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !started.current) {
          started.current = true;
          const start = performance.now();
          const tick = (t: number) => {
            const p = Math.min(1, (t - start) / duration);
            setVal(Math.floor(target * p));
            if (p < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.3 }
    );

    if (elRef.current) io.observe(elRef.current);
    return () => io.disconnect();
  }, [target, duration, startWhenVisible]);

  return { val, elRef };
}

export default function Counters() {
  const a = useCountUp(1200);
  const b = useCountUp(600);
  const c = useCountUp(18);
  const d = useCountUp(10000);

  return (
    <section className="mx-auto max-w-[1200px] px-4 py-14">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div
          ref={a.elRef}
          className="rounded-2xl border bg-white p-6 text-center"
        >
          <div className="text-3xl font-bold">{a.val.toLocaleString()}+</div>
          <div className="text-sm text-slate-600 mt-1">Websites analyzed</div>
        </div>
        <div
          ref={b.elRef}
          className="rounded-2xl border bg-white p-6 text-center"
        >
          <div className="text-3xl font-bold">{b.val.toLocaleString()}+</div>
          <div className="text-sm text-slate-600 mt-1">
            Full reports delivered
          </div>
        </div>
        <div
          ref={c.elRef}
          className="rounded-2xl border bg-white p-6 text-center"
        >
          <div className="text-3xl font-bold">+{c.val}%</div>
          <div className="text-sm text-slate-600 mt-1">
            Median uplift (top 5 fixes)
          </div>
        </div>
        <div
          ref={d.elRef}
          className="rounded-2xl border bg-white p-6 text-center"
        >
          <div className="text-3xl font-bold">{d.val.toLocaleString()}+</div>
          <div className="text-sm text-slate-600 mt-1">Audit checks run</div>
        </div>
      </div>
    </section>
  );
}
