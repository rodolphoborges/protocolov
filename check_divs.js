const fs = require('fs');
const html = fs.readFileSync('analise.html', 'utf8');

const start = html.indexOf('<div id="content"');
const end = html.indexOf('<!-- Site Link -->');
const chunk = html.substring(start, end);

let openCount = 0;
const lines = chunk.split('\n');
for (let i = 0; i < lines.length; i++) {
    const opens = (lines[i].match(/<div/g) || []).length;
    const closes = (lines[i].match(/<\/div>/g) || []).length;
    openCount += opens - closes;
    console.log(`${i+1}: opens=${opens} closes=${closes} pending=${openCount} | ${lines[i].trim()}`);
}
