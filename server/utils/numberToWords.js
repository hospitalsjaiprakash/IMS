/**
 * Number to Indian Currency Words Converter
 * e.g., 1000 -> "Rupees One Thousand only"
 */
function numberToWords(num) {
  if (num === null || num === undefined || isNaN(num)) return '';
  const n = Math.floor(Math.abs(Number(num)));
  if (n === 0) return 'Rupees Zero only';

  const a = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen'
  ];
  const b = [
    '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'
  ];

  function convertLessThanOneThousand(number) {
    let str = '';
    if (number >= 100) {
      str += a[Math.floor(number / 100)] + ' Hundred ';
      number %= 100;
    }
    if (number >= 20) {
      str += b[Math.floor(number / 10)] + (number % 10 !== 0 ? ' ' + a[number % 10] : '');
    } else if (number > 0) {
      str += a[number];
    }
    return str.trim();
  }

  let words = '';
  let crore = Math.floor(n / 10000000);
  let remainder = n % 10000000;
  let lakh = Math.floor(remainder / 100000);
  remainder = remainder % 100000;
  let thousand = Math.floor(remainder / 1000);
  remainder = remainder % 1000;

  if (crore > 0) {
    words += convertLessThanOneThousand(crore) + ' Crore ';
  }
  if (lakh > 0) {
    words += convertLessThanOneThousand(lakh) + ' Lakh ';
  }
  if (thousand > 0) {
    words += convertLessThanOneThousand(thousand) + ' Thousand ';
  }
  if (remainder > 0) {
    words += convertLessThanOneThousand(remainder);
  }

  words = words.trim();
  return words ? `Rupees ${words} only` : '';
}

module.exports = { numberToWords };
