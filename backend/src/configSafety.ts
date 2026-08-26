export interface RuntimeSafetyInput {
  nodeEnv: 'development' | 'production' | 'test';
  databaseUrl?: string;
  sessionSecret?: string;
}

export const EXAMPLE_SESSION_SECRET = 'dev-secret-change-me-please-32-chars-min';

/** Release gates that must hold before the backend is allowed to serve money paths. */
export function runtimeSafetyErrors(input: RuntimeSafetyInput): string[] {
  const errors: string[] = [];
  if (input.nodeEnv === 'production' && !input.databaseUrl) {
    errors.push(
      'DATABASE_URL is required in production; flat-file persistence is not safe for financial workflows',
    );
  }
  if (
    input.nodeEnv === 'production' &&
    (!input.sessionSecret ||
      input.sessionSecret.length < 32 ||
      input.sessionSecret === EXAMPLE_SESSION_SECRET)
  ) {
    errors.push('SESSION_SECRET must be a unique production secret of at least 32 characters');
  }
  return errors;
}

export function moneyInvariantInstallFailureIsFatal(
  nodeEnv: RuntimeSafetyInput['nodeEnv'],
): boolean {
  return nodeEnv === 'production';
}
