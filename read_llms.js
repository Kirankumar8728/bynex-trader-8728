import fs from 'fs';
fetch('https://developers.deriv.com/llms.txt')
  .then(r => r.text())
  .then(t => {
     console.log(t);
  })
  .catch(console.error);
