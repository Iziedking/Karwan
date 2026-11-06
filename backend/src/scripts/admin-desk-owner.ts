import { setDeskOwner } from '../db/teamMembers.js';

/// Makes one team account the admin desk's owner (view 64). There is no route
/// for this on purpose: it runs only on the server, by the owner.
///
///   docker compose exec -T karwan-api node dist/scripts/admin-desk-owner.js you@karwan.site
///
/// The account must already exist (a team portal invite redeemed) and be active.

const email = process.argv[2]?.trim().toLowerCase();
if (!email || !email.includes('@')) {
  console.error('usage: admin-desk-owner.js <team account email>');
  process.exit(2);
}

const view = await setDeskOwner(email);
if (!view) {
  console.error('No active team account with that email. Redeem a team invite first.');
  process.exit(1);
}
console.log(`${view.name} is now the admin desk owner.`);
process.exit(0);
