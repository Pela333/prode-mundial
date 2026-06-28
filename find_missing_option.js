const fs = require('fs');

const html = fs.readFileSync('combinations_section.html', 'utf8');

const rows = [];
const rowRegex = /<tr>([\s\S]*?)<\/tr>/gi;
let match;
while ((match = rowRegex.exec(html)) !== null) {
  rows.push(match[1]);
}

const optionNumbers = [];
rows.forEach((rowHtml) => {
  const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
  const cells = [];
  let cellMatch;
  while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
    cells.push(cellMatch[1].replace(/<[^>]+>/g, '').trim());
  }
  if (cells.length >= 20) {
    const optNum = parseInt(cells[0], 10);
    if (!isNaN(optNum)) {
      optionNumbers.push(optNum);
    }
  }
});

console.log('Total option numbers parsed:', optionNumbers.length);
console.log('Min option number:', Math.min(...optionNumbers));
console.log('Max option number:', Math.max(...optionNumbers));

// Find gaps
for (let i = 1; i <= 495; i++) {
  if (!optionNumbers.includes(i)) {
    console.log(`Missing option number: ${i}`);
  }
}
