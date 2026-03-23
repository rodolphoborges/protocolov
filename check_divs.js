const fs = require('fs');
const html = fs.readFileSync('analise.html', 'utf8');
const start = html.indexOf('<div id="content"');
const end = html.indexOf('<!-- Site Link -->');
const chunk = html.substring(start, end);
const opens = (chunk.match(/<div/g) || []).length;
const closes = (chunk.match(/<\/div>/g) || []).length;
console.log(`Opens: ${opens}, Closes: ${closes}`);
