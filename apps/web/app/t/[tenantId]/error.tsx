"use client";

export default function TenantError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main>
    <h1>We could not load this view</h1>
    <p className="muted">This is a system or access problem. It does not change learning verification, evidence, or competency state.</p>
    <button onClick={() => reset()}>Try again</button>
  </main>;
}
