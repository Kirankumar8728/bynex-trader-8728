import fs from 'fs';
fetch('https://feature-app-builder.deriv-api-v2.pages.dev/docs/account/')
  .then(r => r.text())
  .then(t => fs.writeFileSync('account_docs.html', t))
  .catch(console.error);
