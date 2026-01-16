import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'test-smart-ocr-results.json'), 'utf8'));
const records = data.result.records;

const withSequence = records.filter(r => r.sequence && r.sequence.toString().trim().length > 0);
const withName = records.filter(r => r.name && r.name.toString().trim().length > 0);
const complete = records.filter(r => r.sequence && r.sequence.toString().trim().length > 0 && r.name && r.name.toString().trim().length > 0);
const sequences = withSequence.map(r => parseInt(r.sequence)).filter(n => !isNaN(n)).sort((a, b) => a - b);

console.log('📊 Results Analysis:');
console.log('='.repeat(80));
console.log(`Total records: ${records.length}`);
console.log(`Records with sequence: ${withSequence.length}`);
console.log(`Records with name: ${withName.length}`);
console.log(`Complete records (sequence + name): ${complete.length}`);
console.log(`\nSequences found: ${sequences.join(', ')}`);
console.log(`Max sequence: ${Math.max(...sequences, 0)}`);
console.log(`\nSample complete records:`);
complete.slice(0, 10).forEach((r, i) => {
  console.log(`  ${i+1}. Seq: ${r.sequence}, Name: ${r.name}, Gender: ${r.gender || 'N/A'}, House: ${r.houseNumber || 'N/A'}`);
});

console.log(`\n📋 All records with sequence:`);
withSequence.forEach((r, i) => {
  console.log(`  ${i+1}. Seq: ${r.sequence}, Name: ${r.name || 'N/A'}, Gender: ${r.gender || 'N/A'}, House: ${r.houseNumber || 'N/A'}`);
});
