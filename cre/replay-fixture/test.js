// `npm test -- a` passes and `npm test -- b` fails, so one replay shows both results.
const item = process.argv[2];
if (item === 'a') {
  console.log('a: the agreed behaviour holds');
  process.exit(0);
}
if (item === 'b') {
  console.error('b: fails on purpose');
  process.exit(1);
}
console.error(`unknown item: ${item}`);
process.exit(2);
