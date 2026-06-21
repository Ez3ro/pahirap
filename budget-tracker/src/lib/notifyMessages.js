// The actual words your phone yells at you. Pure data + a tiny picker, no logic —
// edit freely, add your own lines, reorder. Both the client and the Supabase
// Edge Function import this so the voice stays consistent everywhere.
//
// House style: unhinged-budget-app energy, profanity allowed, emoji encouraged —
// but the roast is aimed at the SPENDING, never at your body. Keep it that way.
//
// Placeholders you can use in any line:
//   {amount}  — formatted peso figure (e.g. "₱1,250"), filled in by the caller
//   {cat}     — the category name (e.g. "Food")
//
// Each entry is an array; the caller picks one (seeded, so it can rotate).

export const MESSAGES = {
  // Blew a specific category's pool for the period. {cat}/{amount} available.
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
    Health: [
      "health budget's over by {amount} 💊 ok but this one's allowed tbh",
    ],
    Housing: [
      "housing pool's over by {amount} 🏡 the walls are expensive apparently",
    ],
    // Used for any custom category with no bespoke lines.
    _default: [
      "{cat} budget = annihilated 💥 over by {amount}",
      "the {cat} pool said goodbye 👋 you went {amount} past it",
      "not the {cat} budget too 😭 over by {amount}",
    ],
  },

  // Daily ring: spent more than today's safe allowance. {amount} = how far over.
  dailyOver: [
    "it's giving BROKE 💸 today's allowance is gone and then some",
    "slow DOWN it's still early ⏰ you've spent past today's limit by {amount}",
    "today's pace check: failed ❌ you're {amount} over for the day",
  ],

  // Weekly ring blown.
  weeklyOver: [
    "this week went CRAZY 📉 you're {amount} over the weekly pace",
    "weekly allowance? never heard of her 🤷 over by {amount}",
  ],

  // Whole-period / overall overspend (monthly ring or total).
  periodOver: [
    "the budget said no and you said 🤪 anyway. over by {amount}",
    "running on FUMES until payday ⛽ you're {amount} past the plan",
    "respectfully, the wallet is crying 😮‍💨 {amount} over for the period",
  ],

  // Payday reminders (no overspend — just a nudge).
  payday: [
    "PAYDAY 🤑 go log that bread before you forget like last time",
    "money just landed 💰 record your salary so the budget actually works",
    "it's payday bestie 🎉 don't let future-you guess what you earned",
  ],

  // Gentle nudge when you're close (e.g. 85%+) but not over yet.
  nearLimit: [
    " easy tiger 🐯 you're almost out of {cat} budget for the period",
    "{cat} is at the danger zone ⚠️ pace yourself till payday",
  ],
}

// Deterministic pick from a list using a numeric seed (so the server can rotate
// lines without Math.random, and the same trigger doesn't always say the same
// thing). Falls back gracefully if the list is empty.
export function pickFrom(list, seed = 0) {
  if (!list || list.length === 0) return ""
  const i = Math.abs(Math.floor(seed)) % list.length
  return list[i]
}

// Fill {amount} / {cat} placeholders.
export function fill(template, { amount, cat } = {}) {
  return String(template)
    .replaceAll("{amount}", amount ?? "")
    .replaceAll("{cat}", cat ?? "")
}

// Convenience: build a category-overspend message. `seed` rotates the variant.
export function categoryMessage(cat, amountText, seed = 0) {
  const list = MESSAGES.category[cat] || MESSAGES.category._default
  return fill(pickFrom(list, seed), { amount: amountText, cat })
}
