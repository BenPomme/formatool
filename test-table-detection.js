const { parseTableFromText } = require('./dist/utils/tableUtils');

const sampleTable = `Table 1. Evaluation Summary (Scoring Criteria in Appendix).
Criteria    Appcharge    Xsolla    Aghanim
1. Functional & Technical Fit    4 - Modular & customizable UI; Mobile-first practices and cutomisations; lacks API for text/assets    3 - Similar functionalities like Appcharge but less customized for mobile, lacks API for asset mgmt.    2; Lacks dynamic product list; weaker overall feature set
2. Payment Processing & Compliance    5 - Global MoR, PSP routing with full compliance    5 - Global MoR, strong PSP reach in emerging markets    4 - Global MoR but PSP breadth not detailed
3. Analytics & Reporting    3 - Real-time data, Looker-compatible; direct ingestion TBD    4 - AppsFlyer integration; direct ingestion TBD    2 - Basic support; segmentation gaps limit usability
4. Support & SLAs    4 - Dedicated team with EU office, latency TBD    4 - 100+ staffed robust global team for King; clear SLAs in latency, incidence, etc.     2 - Leaner team may limit speed of delivery and support
5. Commercial Model    4 - 7~11% effective rate; 20¢ fixed fee    3 - 8~12% effective rate; 30¢ fixed fee    5 – 5%~8% effective rate; no fixed fee
6. Vendor Maturity & Fit    4 - Fast-growing with credible mobile clients
4 - Highly mature, though weaker in mobile D2C    2 - Early stage, with ongoing IP litigation risk
Total (out of 30)    24    23    17`;

console.log('Testing table detection...\n');

const result = parseTableFromText(sampleTable);

if (result) {
  console.log('✅ Table detected!');
  console.log('\nHeaders:', result.headers);
  console.log('\nNumber of rows:', result.rows.length);
  console.log('\nFirst few rows:');
  result.rows.slice(0, 3).forEach((row, idx) => {
    console.log(`Row ${idx + 1}:`, row);
  });
} else {
  console.log('❌ Table NOT detected');
  console.log('\nDebugging: Checking individual lines...');
  const lines = sampleTable.split('\n');
  lines.forEach((line, idx) => {
    const hasMultipleSpaces = /\s{3,}/.test(line);
    const hasTabs = /\t/.test(line);
    const parts = line.split(/\s{3,}/).length;
    console.log(`Line ${idx}: spaces=${hasMultipleSpaces}, tabs=${hasTabs}, parts=${parts}`);
    console.log(`  "${line.substring(0, 60)}..."`);
  });
}
