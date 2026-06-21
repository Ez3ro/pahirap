// Server copy of src/lib/notifyMessages.js. Kept in sync by hand — if you add or
// reword lines in the client file, mirror them here (or vice-versa). Deno deploys
// only the functions/ tree, so it can't import from src/.
//
// House style: unhinged-budget-app energy, profanity allowed, emoji encouraged —
// the roast is aimed at the SPENDING, never at your body. Keep it that way.

export const MESSAGES: Record<string, any> = {
  category: {
    Food: [
      "bro put the FORK down 🍔 your food budget is toast and it's not even payday",
      "the kitchen is closed 🔒 you've inhaled {amount} over your food pool",
      "you really said 'one more lalamove' huh 🛵 food budget = obliterated",
    ],
    Transport: [
      "where are you even GOING 🚌 you've blown the transport budget by {amount}",
      "walk. it's free. transport pool is GONE 👟",
    ],
    Shopping: [
      "girl who is she 🛍️ your shopping pool is dead, over by {amount}",
      "cart = closed 🚫 you've shopped {amount} past the line",
      "add to cart? add to BANKRUPTCY 💀 shopping budget's done",
    ],
    Bills: [
      "the bills said {amount} more than you planned 🧾 oof",
      "utilities really ate today huh ⚡ bills are over budget",
    ],
    Entertainment: [
      "touch grass (it's free) 🌱 fun budget's blown by {amount}",
      "the streaming-snack-arcade arc is OVER 🎬 entertainment pool's gone",
    ],
    Health: ["health budget's over by {amount} 💊 ok but this one's allowed tbh"],
    Housing: ["housing pool's over by {amount} 🏡 the walls are expensive apparently"],
    _default: [
      "{cat} budget = annihilated 💥 over by {amount}",
      "the {cat} pool said goodbye 👋 you went {amount} past it",
      "not the {cat} budget too 😭 over by {amount}",
    ],
  },
  dailyOver: [
    "it's giving BROKE 💸 today's allowance is gone and then some",
    "slow DOWN it's still early ⏰ you've spent past today's limit by {amount}",
    "today's pace check: failed ❌ you're {amount} over for the day",
  ],
  weeklyOver: [
    "this week went CRAZY 📉 you're {amount} over the weekly pace",
    "weekly allowance? never heard of her 🤷 over by {amount}",
  ],
  periodOver: [
    "the budget said no and you said 🤪 anyway. over by {amount}",
    "running on FUMES until payday ⛽ you're {amount} past the plan",
    "respectfully, the wallet is crying 😮‍💨 {amount} over for the period",
  ],
  payday: [
    "PAYDAY 🤑 go log that bread before you forget like last time",
    "money just landed 💰 record your salary so the budget actually works",
    "it's payday bestie 🎉 don't let future-you guess what you earned",
  ],
}

export function pickFrom(list: string[] | undefined, seed = 0): string {
  if (!list || list.length === 0) return ""
  return list[Math.abs(Math.floor(seed)) % list.length]
}

export function fill(template: string, vars: { amount?: string; cat?: string } = {}): string {
  return String(template)
    .replaceAll("{amount}", vars.amount ?? "")
    .replaceAll("{cat}", vars.cat ?? "")
}

export function categoryMessage(cat: string, amountText: string, seed = 0): string {
  const list = MESSAGES.category[cat] || MESSAGES.category._default
  return fill(pickFrom(list, seed), { amount: amountText, cat })
}
