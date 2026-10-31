"use client";

export function PrintButton({ label = "Exportera PDF" }: { label?: string }) {
  return (
    <button type="button" className="btn secondary small" onClick={() => window.print()} title="Välj 'Spara som PDF' i utskriftsdialogen">
      {label}
    </button>
  );
}
