/// Where a new account goes once it exists: "About you" on /start straight
/// away (view 39), after the recovery step when that is on.
export const ABOUT_YOU = '/start?step=about';

export function afterCreate(opts: { recoveryStep: boolean }): 'recovery' | typeof ABOUT_YOU {
  return opts.recoveryStep ? 'recovery' : ABOUT_YOU;
}
