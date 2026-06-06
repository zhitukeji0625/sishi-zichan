/** True when Prisma rejected a create/update due to a unique constraint (P2002). */
export function isPrismaUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code: string }).code === "P2002"
  );
}

/** Parse optional numeric form field; preserves 0 (unlike truthy checks). */
export function parseOptionalFormNumber(val: FormDataEntryValue | undefined): number | undefined {
  if (val === undefined || val === "") return undefined;
  const n = Number(val);
  return Number.isNaN(n) ? undefined : n;
}
