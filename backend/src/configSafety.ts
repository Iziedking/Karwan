export interface RuntimeSafetyInput {
  nodeEnv: 'development' | 'production' | 'test';
  databaseUrl?: string;
  sessionSecret?: string;
  arcNetwork?: 'testnet' | 'mainnet';
  recoveryEnabled?: boolean;
  recoveryKmsKeyId?: string;
  worldIdEnabled?: boolean;
  worldIdEnvironment?: 'staging' | 'production';
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
  if (input.nodeEnv === 'production' && input.arcNetwork === 'mainnet' && input.recoveryEnabled && !input.recoveryKmsKeyId) {
    errors.push('RECOVERY_KMS_KEY_ID is required when RECOVERY_ENABLED is on mainnet in production');
  }
  // Staging is the default and only answers the World ID Simulator, so real
  // people scanning with World App were sent to an Orb prompt they could not use.
  if (input.nodeEnv === 'production' && input.worldIdEnabled && input.worldIdEnvironment !== 'production') {
    errors.push('WORLD_ID_ENVIRONMENT must be production when WORLD_ID_ENABLED is on in production; staging only works with the World ID Simulator');
  }
  return errors;
}

export function moneyInvariantInstallFailureIsFatal(
  nodeEnv: RuntimeSafetyInput['nodeEnv'],
): boolean {
  return nodeEnv === 'production';
}
