/** Cible de navigation vers le détail séance / saisie de perf (A-03/A-04). */
export function sessionDetailHref(assignmentId: string) {
  return { pathname: '/(athlete)/session/[id]' as const, params: { id: assignmentId } };
}

/** Cible de navigation vers la confirmation de perf (A-05, TLX-078). */
export function perfConfirmationHref(assignmentId: string) {
  return { pathname: '/(athlete)/perf/[id]' as const, params: { id: assignmentId } };
}
