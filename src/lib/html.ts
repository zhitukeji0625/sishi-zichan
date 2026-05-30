/** Escape user-controlled strings before embedding in HTML templates. */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function fillContractTemplate(
  bodyHtml: string,
  vars: Record<string, string>,
): string {
  let out = bodyHtml;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{{${key}}}`, escapeHtml(value));
  }
  return out;
}
