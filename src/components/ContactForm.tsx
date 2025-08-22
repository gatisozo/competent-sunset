import React, { useState } from "react";

export default function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState(false);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // DEV: šobrīd tikai lokāla apstiprināšana
    setOk(true);
  };

  return (
    <section id="contact" className="mx-auto max-w-[1200px] px-4 py-14">
      <div className="rounded-3xl border bg-white p-6 md:p-10 grid md:grid-cols-2 gap-6">
        <div>
          <h3 className="text-2xl md:text-3xl font-semibold">Contact</h3>
          <p className="text-slate-600 mt-2">
            We reply within <b>24 hours</b>. Tell us about your page or use
            case.
          </p>
        </div>
        <form onSubmit={onSubmit} className="grid gap-3">
          <input
            placeholder="Name"
            className="rounded-xl px-4 py-3 bg-slate-50 border outline-none focus:ring-2 focus:ring-[#83C5BE]"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            placeholder="Email"
            className="rounded-xl px-4 py-3 bg-slate-50 border outline-none focus:ring-2 focus:ring-[#83C5BE]"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <textarea
            placeholder="Message"
            rows={4}
            className="rounded-xl px-4 py-3 bg-slate-50 border outline-none focus:ring-2 focus:ring-[#83C5BE]"
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
          />
          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="rounded-xl px-5 py-3 bg-[#006D77] text-white font-medium hover:opacity-90"
            >
              Send message
            </button>
            <span className="text-slate-500 text-sm">
              We reply within 24 hours.
            </span>
          </div>
          {ok && (
            <div className="text-emerald-600 text-sm">
              Thanks — we’ll get back to you shortly.
            </div>
          )}
        </form>
      </div>
    </section>
  );
}
