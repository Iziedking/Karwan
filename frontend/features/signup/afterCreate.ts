/// Where a new account goes once it exists: setup straight away (view 38),
/// after the recovery step when that is on.
export function afterCreate(opts: { recoveryStep: boolean }): 'recovery' | '/setup' {
  return opts.recoveryStep ? 'recovery' : '/setup';
}
