
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read the original JSON
const data = JSON.parse(readFileSync(join(__dirname, 'truckEntries.json'), 'utf-8'));

// Clean up function
function cleanTruckNumber(truckNumber: string): string {
  return truckNumber
    .trim() // Remove leading/trailing spaces
    .replace(/[\/\\]/g, '-') // Replace / and \ with -
    .replace(/\s+/g, '-'); // Replace spaces with -
}

// Clean the data
const cleanedData: any = {};
const entries = data.truckEntries;

for (const [key, value] of Object.entries(entries)) {
  const cleanKey = cleanTruckNumber(key);
  if (cleanKey) {
    cleanedData[cleanKey] = value;
  }
}

// Save the cleaned JSON
const outputPath = join(__dirname, 'cleaned-truckEntries.json');
writeFileSync(outputPath, JSON.stringify({ truckEntries: cleanedData }, null, 2));

console.log('Cleaned JSON saved to:', outputPath);