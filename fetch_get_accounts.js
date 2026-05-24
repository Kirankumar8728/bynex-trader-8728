import fs from 'fs';
fetch('https://feature-app-builder.deriv-api-v2.pages.dev/docs/options/get-accounts')
  .then(r => r.text())
  .then(t => fs.writeFileSync('get_accounts.html', t))
  .catch(console.error);
