const { parseTableFromText, renderMarkdownTable } = require('../dist/utils/tableUtils');

describe('Table Utils - Core Functionality', () => {
  describe('parseTableFromText', () => {
    test('should parse tab-separated table', () => {
      const input = `Name\tAge\tCity
John\t25\tNew York
Jane\t30\tLos Angeles`;

      const result = parseTableFromText(input);

      expect(result).not.toBeNull();
      expect(result.headers).toEqual(['Name', 'Age', 'City']);
      expect(result.rows.length).toBeGreaterThanOrEqual(2);

      // Check that we have the data rows
      const johnRow = result.rows.find(row => row.includes('John'));
      const janeRow = result.rows.find(row => row.includes('Jane'));
      expect(johnRow).toBeDefined();
      expect(janeRow).toBeDefined();
    });

    test('should parse markdown table with pipes', () => {
      const input = `| Name | Age | City |
| --- | --- | --- |
| John | 25 | NYC |
| Jane | 30 | LA |`;

      const result = parseTableFromText(input);

      expect(result).not.toBeNull();
      expect(result.headers).toEqual(['Name', 'Age', 'City']);

      // Check that we have data rows
      const johnRow = result.rows.find(row => row[0] === 'John');
      expect(johnRow).toBeDefined();
      if (johnRow) {
        expect(johnRow).toEqual(['John', '25', 'NYC']);
      }
    });

    test('should return null for non-table content', () => {
      const input = `This is just a paragraph.
It has multiple lines.
But it's not a table.`;

      const result = parseTableFromText(input);

      expect(result).toBeNull();
    });

    test('should return null for single line', () => {
      const input = `Just one line`;

      const result = parseTableFromText(input);

      expect(result).toBeNull();
    });
  });

  describe('renderMarkdownTable', () => {
    test('should render table with markdown pipes', () => {
      const tableData = {
        headers: ['Name', 'Age', 'City'],
        rows: [
          ['John', '25', 'NYC'],
          ['Jane', '30', 'LA']
        ]
      };

      const result = renderMarkdownTable(tableData);

      expect(result).toContain('| Name | Age | City |');
      expect(result).toContain('| --- | --- | --- |');
      expect(result).toContain('| John | 25 | NYC |');
      expect(result).toContain('| Jane | 30 | LA |');
    });

    test('should handle empty cells', () => {
      const tableData = {
        headers: ['A', 'B', 'C'],
        rows: [
          ['1', '', '3'],
          ['', '2', '']
        ]
      };

      const result = renderMarkdownTable(tableData);

      expect(result).toContain('| A | B | C |');
      // Verify structure is maintained even with empty cells
      expect(result.split('\n')).toHaveLength(4); // header + separator + 2 rows
    });
  });

  describe('Integration: Table round-trip', () => {
    test('should preserve table headers through parse and render', () => {
      const original = {
        headers: ['Feature', 'Status', 'Owner'],
        rows: [
          ['Login', 'Complete', 'Alice'],
          ['Dashboard', 'In Progress', 'Bob']
        ]
      };

      const markdown = renderMarkdownTable(original);
      const parsed = parseTableFromText(markdown);

      expect(parsed).not.toBeNull();
      expect(parsed.headers).toEqual(original.headers);

      // Verify we have the expected data in the parsed result
      const loginRow = parsed.rows.find(row => row.includes('Login'));
      expect(loginRow).toBeDefined();
    });
  });
});
