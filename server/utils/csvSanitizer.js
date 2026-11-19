/**
 * CSV & Spreadsheet Formula Injection Neutralization Utility (OWASP CSV Injection Defense)
 *
 * Prevents Excel / LibreOffice Calc / Google Sheets from executing formulas
 * embedded in user-controlled text fields (=, +, -, @, \t, \r).
 */

const FORMULA_PREFIX_REGEX = /^[\t\r\n ]*[=+\-@]|^[\t\r\n]/;

/**
 * Neutralize a cell value for safe export to CSV or XLSX.
 * Non-string primitives (numbers, booleans, null, undefined) are handled safely.
 */
function sanitizeCsvCell(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'number' || typeof val === 'boolean') return val;

  const str = String(val);
  if (FORMULA_PREFIX_REGEX.test(str)) {
    return `'${str}`;
  }
  return str;
}

/**
 * Neutralize and RFC-4180 quote a single CSV field.
 */
function escapeCsvField(val) {
  const safe = String(sanitizeCsvCell(val));
  return `"${safe.replace(/"/g, '""')}"`;
}

module.exports = {
  sanitizeCsvCell,
  escapeCsvField
};
