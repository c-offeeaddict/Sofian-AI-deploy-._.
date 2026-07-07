const https = require('https');
https.get('https://raw.githubusercontent.com/nextlevelbuilder/ui-ux-pro-max-skill/main/README.md', { headers: { 'User-Agent': 'Node.js' } }, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log(data));
}).on('error', err => console.log('Error: ' + err.message));
