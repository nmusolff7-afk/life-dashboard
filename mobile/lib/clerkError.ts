export function extractClerkError(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'errors' in err) {
    const errors = (err as { errors?: { longMessage?: string; message?: string }[] }).errors;
    if (errors && errors.length > 0) {
      return errors[0].longMessage ?? errors[0].message ?? 'Something went wrong.';
    }
  }
  if (err instanceof Error) return err.message;
  return 'Something went wrong.';
}
