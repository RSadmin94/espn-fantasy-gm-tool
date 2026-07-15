import 'dotenv/config';
const keys = Object.keys(process.env).filter(k =>
  /ESPN|LEAGUE|SWID|S2/i.test(k)
);
console.log('MATCHING_ENV_KEYS:', JSON.stringify(keys));
for (const k of keys) {
  const v = process.env[k] || '';
  console.log(k, '=> present:', v.length > 0, '| length:', v.length);
}
