import { randomInt } from "node:crypto";
import type { ArcadeWorldQuestion, ArcadeWorldScene } from "./arcade-world-content";

export type CediMarketMission = "change" | "basket" | "discount" | "saving" | "budget" | "profit" | "percentage" | "tradeoff";

export type CediMarketScene = ArcadeWorldScene & {
  customer: string;
  avatar: string;
  basket: string[];
  wallet: number;
  mission: CediMarketMission;
  priceTags: string[];
};

export type CediCityMarketQuestion = ArcadeWorldQuestion & {
  conceptKey: string;
  scene: CediMarketScene;
};

const CUSTOMERS = ["Ama", "Kojo", "Abena", "Kwame", "Adwoa", "Kofi", "Akosua", "Yaw", "Esi", "Nana"] as const;
const AVATARS = ["sun", "bolt", "leaf", "star", "wave", "crown"] as const;
const PRODUCTS = [
  ["notebook", 8], ["pen set", 6], ["water bottle", 12], ["story book", 18], ["fruit pack", 10],
  ["geometry set", 15], ["exercise book", 9], ["school bag", 38], ["lunch box", 24], ["art pad", 14],
] as const;

function shuffle<T>(values: readonly T[]): T[] {
  const output = [...values];
  for (let index = output.length - 1; index > 0; index -= 1) {
    const swap = randomInt(index + 1);
    [output[index], output[swap]] = [output[swap], output[index]];
  }
  return output;
}

function money(value: number) {
  return `GH₵${Math.max(0, Math.round(value))}`;
}

function numericOptions(answer: number, seeds: number[]) {
  const values = new Set<number>([Math.max(0, Math.round(answer))]);
  for (const seed of seeds) values.add(Math.max(0, Math.round(seed)));
  let bump = 1;
  while (values.size < 4) {
    values.add(Math.max(0, Math.round(answer + bump * (bump % 2 ? 1 : -1))));
    bump += 1;
  }
  return shuffle([...values].slice(0, 4).map(money));
}

function productBasket(count: number) {
  return shuffle(PRODUCTS).slice(0, Math.max(1, Math.min(3, count)));
}

function scene(mission: CediMarketMission, basket: readonly (readonly [string, number])[], wallet: number, cue: string): CediMarketScene {
  return {
    boardTitle: "Cedi City Market",
    customer: CUSTOMERS[randomInt(CUSTOMERS.length)],
    avatar: AVATARS[randomInt(AVATARS.length)],
    basket: basket.map(([name]) => name),
    wallet,
    mission,
    priceTags: basket.map(([name, price]) => `${name} · ${money(price)}`),
    cue,
    meterLabels: [mission, `wallet ${money(wallet)}`, `${basket.length} item${basket.length === 1 ? "" : "s"}`],
  };
}

function question(index: number, mission: CediMarketMission, prompt: string, answerValue: number, distractors: number[], explanation: string, marketScene: CediMarketScene, conceptKey: string): CediCityMarketQuestion {
  const answer = money(answerValue);
  return {
    id: String(index),
    kind: "simulation",
    prompt,
    answer,
    options: numericOptions(answerValue, distractors),
    explanation,
    conceptKey,
    scene: marketScene,
  };
}

function changeQuestion(index: number, difficulty: number): CediCityMarketQuestion {
  const basket = productBasket(difficulty >= 3 ? 2 : 1);
  const cost = basket.reduce((sum, [, price]) => sum + price, 0) + randomInt(0, 1 + difficulty * 2);
  const walletStep = difficulty >= 4 ? 20 : 10;
  const wallet = Math.max(walletStep, Math.ceil((cost + 5) / walletStep) * walletStep);
  const answer = wallet - cost;
  return question(
    index,
    "change",
    `${CUSTOMERS[index % CUSTOMERS.length]} pays ${money(wallet)} for a basket costing ${money(cost)}. What change should the till return?`,
    answer,
    [wallet - answer, answer + 5, Math.max(0, answer - 5)],
    `${money(wallet)} − ${money(cost)} = ${money(answer)} change.`,
    scene("change", basket, wallet, "Check the amount paid, subtract the basket total, then verify the change."),
    `market-change:${wallet}:${cost}`,
  );
}

function basketQuestion(index: number, difficulty: number): CediCityMarketQuestion {
  const basket = productBasket(difficulty >= 3 ? 3 : 2);
  const modifier = randomInt(0, difficulty + 1);
  const prices = basket.map(([name, price], itemIndex) => [name, price + (itemIndex === 0 ? modifier : 0)] as const);
  const total = prices.reduce((sum, [, price]) => sum + price, 0);
  const wallet = Math.ceil((total + 12) / 10) * 10;
  const first = prices[0]?.[1] ?? total;
  const last = prices[prices.length - 1]?.[1] ?? 0;
  return question(
    index,
    "basket",
    `Ring up the basket: ${prices.map(([name, price]) => `${name} ${money(price)}`).join(" + ")}. What is the correct total?`,
    total,
    [Math.max(0, total - first), total + last, total + 5],
    `${prices.map(([, price]) => money(price)).join(" + ")} = ${money(total)}.`,
    scene("basket", prices, wallet, "Add every price once. Use the receipt order to avoid skipping or counting an item twice."),
    `market-basket:${prices.map(([, price]) => price).join("-")}`,
  );
}

function flatDiscountQuestion(index: number, difficulty: number): CediCityMarketQuestion {
  const basket = productBasket(1);
  const base = 30 + randomInt(0, 5 + difficulty) * 5;
  const discount = Math.min(base - 5, 5 + randomInt(0, Math.max(1, difficulty)) * 5);
  const final = base - discount;
  const priced = [[basket[0][0], base]] as const;
  return question(
    index,
    "discount",
    `A ${basket[0][0]} is marked ${money(base)} and the market voucher removes ${money(discount)}. What price should appear on the receipt?`,
    final,
    [base + discount, base, Math.max(0, final - 5)],
    `${money(base)} − ${money(discount)} = ${money(final)}.`,
    scene("discount", priced, base + 20, "Apply the voucher to the marked price before taking payment."),
    `market-flat-discount:${base}:${discount}`,
  );
}

function savingQuestion(index: number, difficulty: number): CediCityMarketQuestion {
  const income = 80 + randomInt(0, 5 + difficulty) * 20;
  const save = 20 + randomInt(0, Math.max(1, difficulty)) * 10;
  const spendable = income - save;
  const basket = productBasket(2);
  return question(
    index,
    "saving",
    `A learner has ${money(income)} but wants to protect ${money(save)} as savings before shopping. What is the maximum spendable amount?`,
    spendable,
    [income, save, Math.max(0, spendable - 10)],
    `Protecting ${money(save)} from ${money(income)} leaves ${money(spendable)} available to spend.`,
    scene("saving", basket, income, "Move savings out first. Only the remainder belongs in the shopping budget."),
    `market-saving:${income}:${save}`,
  );
}

function budgetQuestion(index: number, difficulty: number): CediCityMarketQuestion {
  const income = 140 + randomInt(0, 5 + difficulty) * 20;
  const transport = 30 + randomInt(0, difficulty + 1) * 5;
  const lunch = 40 + randomInt(0, difficulty + 2) * 5;
  const savings = 20 + randomInt(0, difficulty + 1) * 5;
  const remaining = income - transport - lunch - savings;
  const basket = productBasket(2);
  return question(
    index,
    "budget",
    `Weekly money is ${money(income)}. Transport is ${money(transport)}, lunch is ${money(lunch)}, and savings must be ${money(savings)}. What remains for other spending?`,
    remaining,
    [income - transport - lunch, income - savings, Math.max(0, remaining + 10)],
    `${money(income)} − ${money(transport)} − ${money(lunch)} − ${money(savings)} = ${money(remaining)}.`,
    scene("budget", basket, income, "Protect required needs and savings before deciding what remains."),
    `market-budget:${income}:${transport}:${lunch}:${savings}`,
  );
}

function profitQuestion(index: number, difficulty: number): CediCityMarketQuestion {
  const units = 4 + randomInt(0, 3 + difficulty);
  const costEach = 4 + randomInt(0, 4 + difficulty);
  const markup = 2 + randomInt(0, 2 + Math.ceil(difficulty / 2));
  const sellEach = costEach + markup;
  const cost = units * costEach;
  const revenue = units * sellEach;
  const profit = revenue - cost;
  const basket = [[`${units} market packs`, cost]] as const;
  return question(
    index,
    "profit",
    `The stall buys ${units} packs at ${money(costEach)} each and sells all of them at ${money(sellEach)} each. What is the gross profit before other costs?`,
    profit,
    [revenue, cost, markup * units + costEach],
    `Cost = ${units} × ${money(costEach)} = ${money(cost)}. Revenue = ${units} × ${money(sellEach)} = ${money(revenue)}. Profit = ${money(profit)}.`,
    scene("profit", basket, revenue, "Compare total revenue with total direct cost. Do not confuse revenue with profit."),
    `market-profit:${units}:${costEach}:${sellEach}`,
  );
}

function percentageQuestion(index: number, difficulty: number): CediCityMarketQuestion {
  const rates = difficulty >= 5 ? [10, 20, 25, 50] : [10, 20, 50];
  const rate = rates[randomInt(rates.length)];
  const baseStep = rate === 25 ? 20 : 10;
  const base = baseStep * (4 + randomInt(0, 4 + difficulty));
  const discount = (base * rate) / 100;
  const final = base - discount;
  const basket = [["festival offer", base]] as const;
  return question(
    index,
    "percentage",
    `Market Day gives ${rate}% off an item priced ${money(base)}. What is the final price after the discount?`,
    final,
    [discount, base + discount, base],
    `${rate}% of ${money(base)} is ${money(discount)}, so the final price is ${money(final)}.`,
    scene("percentage", basket, base, "Find the discount amount first, then subtract it from the marked price."),
    `market-percent:${rate}:${base}`,
  );
}

function tradeoffQuestion(index: number, difficulty: number): CediCityMarketQuestion {
  const budget = 100 + randomInt(0, 5 + difficulty) * 20;
  const essential = 40 + randomInt(0, difficulty + 3) * 5;
  const savings = 20 + randomInt(0, difficulty + 2) * 5;
  const optional = 10 + randomInt(0, difficulty + 3) * 5;
  const safeOptional = Math.max(0, Math.min(optional, budget - essential - savings));
  const basket = productBasket(2);
  return question(
    index,
    "tradeoff",
    `You have ${money(budget)}. An essential cost is ${money(essential)} and you must still save ${money(savings)}. What is the most you can safely use for an optional purchase without breaking the plan?`,
    safeOptional,
    [optional + essential, budget - essential, budget - savings],
    `After the essential cost and savings, ${money(Math.max(0, budget - essential - savings))} is the safe ceiling for optional spending.`,
    scene("tradeoff", basket, budget, "Needs and protected savings set the ceiling for optional spending."),
    `market-tradeoff:${budget}:${essential}:${savings}`,
  );
}

function modesForDifficulty(difficulty: number): CediMarketMission[] {
  if (difficulty <= 1) return ["change", "basket"];
  if (difficulty === 2) return ["change", "basket", "discount", "saving"];
  if (difficulty === 3) return ["change", "basket", "discount", "saving", "budget", "profit"];
  if (difficulty === 4) return ["basket", "budget", "profit", "percentage", "tradeoff", "change"];
  return ["budget", "profit", "percentage", "tradeoff", "basket", "change"];
}

export function createCediCityMarketQuestions(difficulty: number, length = 5): CediCityMarketQuestion[] {
  const safeDifficulty = Math.max(1, Math.min(5, Math.trunc(difficulty)));
  const safeLength = Math.max(1, Math.min(50, Math.trunc(length)));
  const modes = modesForDifficulty(safeDifficulty);
  const builders: Record<CediMarketMission, (index: number, difficulty: number) => CediCityMarketQuestion> = {
    change: changeQuestion,
    basket: basketQuestion,
    discount: flatDiscountQuestion,
    saving: savingQuestion,
    budget: budgetQuestion,
    profit: profitQuestion,
    percentage: percentageQuestion,
    tradeoff: tradeoffQuestion,
  };
  const selectedModes = Array.from({ length: safeLength }, (_, index) => modes[index % modes.length]);
  return shuffle(selectedModes).map((mode, index) => builders[mode](index, safeDifficulty));
}
