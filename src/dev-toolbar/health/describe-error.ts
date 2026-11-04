/** The first line of a thrown value, split into its name and message. */
export function describeError(error: unknown): { name: string; message: string } {
  if (error instanceof Error) {
    return { name: error.name || 'Error', message: error.message };
  }
  if (error instanceof ErrorEvent) {
    return { name: 'Error', message: error.message };
  }
  return { name: 'Thrown value', message: String(error) };
}
