import fs from 'fs';
fetch('https://feature-app-builder.deriv-api-v2.pages.dev/docs/intro/oauth/')
  .then(r => r.text())
  .then(t => fs.writeFileSync('oauth_docs.html', t))
  .catch(console.error);
