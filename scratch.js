function genCNPJ() {
  const n = (max) => Math.floor(Math.random() * max);
  const create_array = (total, numero) => Array.from(Array(total), () => numero);
  const numbers = create_array(8, 0).map(() => n(9)).join('') + '0001';
  
  let length = numbers.length;
  let sum = 0;
  let pos = length - 7;
  for (let i = length; i >= 1; i--) {
    sum += parseInt(numbers.charAt(length - i)) * pos--;
    if (pos < 2) pos = 9;
  }
  let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  const digit1 = result;
  
  const numbersWithD1 = numbers + digit1;
  length = numbersWithD1.length;
  sum = 0;
  pos = length - 7;
  for (let i = length; i >= 1; i--) {
    sum += parseInt(numbersWithD1.charAt(length - i)) * pos--;
    if (pos < 2) pos = 9;
  }
  result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  const digit2 = result;
  
  return numbersWithD1 + digit2;
}
console.log(genCNPJ());
