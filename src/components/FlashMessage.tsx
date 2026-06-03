/** Inline flash banner for ?error= or ?msg= query params. */
export function FlashMessage({
  error,
  message,
}: {
  error?: string | null;
  message?: string | null;
}) {
  if (!error && !message) return null;
  if (error) {
    return (
      <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {error}
      </div>
    );
  }
  return (
    <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
      {message}
    </div>
  );
}
