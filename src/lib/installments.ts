export function generateInstallments(
  total: number,
  count: number,
  firstDueDate: string,
): { number: number; due_date: string; amount: number }[] {
  const base = Math.floor((total * 100) / count) / 100;
  const result: { number: number; due_date: string; amount: number }[] = [];
  let acc = 0;
  const [y, m, d] = firstDueDate.split("-").map(Number);
  for (let i = 0; i < count; i++) {
    const dt = new Date(y, m - 1 + i, d);
    const due = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    const amt = i === count - 1 ? Math.round((total - acc) * 100) / 100 : base;
    acc += amt;
    result.push({ number: i + 1, due_date: due, amount: amt });
  }
  return result;
}