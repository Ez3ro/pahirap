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
      "{amount} over on FOOD?? you don't have a budget you have a feeding schedule 🐷🍔",
      "every peso you own goes in your mouth. {amount} over and still hungry, embarrassing 🍔",
      "you can't afford this and you ordered it anyway 🛵 {amount} over. broke AND greedy",
      "the food budget filed a restraining order. {amount} over, you menace 🍜",
      "imagine being {amount} over on FOOD. your bank account is starving so you don't have to 💀",
    ],
    Transport: [
      "{amount} over on transport. for WHAT. you have nowhere important to be 🚌",
      "gas, fares, grabs — {amount} over to go places nobody invited you to 🚘",
      "walk. you clearly can't be trusted with a budget OR a vehicle. {amount} over 👟",
      "you burned {amount} just MOVING AROUND. sit down. literally. save money 🪑",
    ],
    Shopping: [
      "{amount} over on shopping. retail therapy isn't working, you're still like this 🛍️",
      "buying junk you'll forget by Friday. {amount} over, congrats on the clutter 🗑️",
      "your cart is full and your account is empty 💀 {amount} over, priorities immaculate",
      "another haul nobody asked for. {amount} over. this is a problem, seek help 🛒",
      "you'd rather be broke than bored huh. {amount} over on stuff you don't need 💸",
    ],
    Bills: [
      "{amount} over on bills you KNEW were coming. shocked? you shouldn't be 🧾",
      "the bills hit and you fumbled it anyway. {amount} over. zero excuse ⚡",
      "you had one job: pay the predictable thing. {amount} over. unbelievable 🧾",
    ],
    Entertainment: [
      "{amount} over on FUN while broke. the funniest thing here is your finances 🤡",
      "subscriptions, snacks, nonsense — {amount} over. entertained AND poor 🎬",
      "you bought a good time you couldn't afford. {amount} over. touch grass, it's free 🌱",
    ],
    Health: [
      "{amount} over on health — fine, this one I'll allow. barely. don't push it 💊",
      "ok health's over by {amount}, that's the one acceptable L. everything else? no.",
    ],
    Housing: [
      "{amount} over on housing. paying premium to be miserable indoors I see 🏡",
      "the walls cost {amount} more than you had. shelter shouldn't be a flex you can't afford 🧱",
    ],
    // Used for any custom category with no bespoke lines.
    _default: [
      "{amount} over on {cat}. you really found a new way to be broke huh 💥",
      "the {cat} budget is dead and you killed it. {amount} over, murderer 🔪",
      "{cat}: {amount} over. is there a single category you DON'T ruin? 😒",
      "not {cat} too. {amount} over. you're not budgeting, you're just announcing purchases 📢",
    ],
  },

  // Daily ring: spent more than today's safe allowance. {amount} = how far over.
  dailyOver: [
    "it's not even bedtime and you're {amount} over for the day. unhinged behaviour 💸",
    "blew today's allowance AND borrowed from tomorrow. {amount} over. no self control 💀",
    "{amount} over already today. do you hear money or does it just whisper 'spend me' 🫠",
    "one day. you couldn't last ONE day. {amount} over. pathetic, lovingly ⏰",
  ],

  // Weekly ring blown.
  weeklyOver: [
    "{amount} over this week and it's not even over. impressive failure, truly 📉",
    "weekly budget didn't stand a chance against you. {amount} over, serial offender 🔁",
    "you treat the weekly limit like a suggestion. {amount} over. it was a RULE 🚨",
  ],

  // Whole-period / overall overspend (monthly ring or total).
  periodOver: [
    "{amount} over for the whole period. you're not bad with money, money is bad WITH you 😮‍💨",
    "running on fumes till payday and it's YOUR fault. {amount} over ⛽ enjoy the rice arc 🍚",
    "the budget begged and you ignored it. {amount} over. future-you is going to cry 😭",
    "{amount} over. genuinely how. you had a plan and chose violence against it 🔪",
  ],

  // Payday reminders (no overspend — just a nudge).
  payday: [
    "PAYDAY 🤑 go log that bread before you forget like last time",
    "money just landed 💰 record your salary so the budget actually works",
    "it's payday bestie 🎉 don't let future-you guess what you earned",
  ],

  // Snarky / passive-aggressive "you're actually doing fine" lines. Sent at most
  // once a day when you're NOT over budget. Keep the backhanded-compliment energy.
  praise: [
    "wow. under budget. who ARE you 😶 keep it up i guess",
    "not you being financially responsible today 🙄 proud, weirdly",
    "look at you NOT spending. groundbreaking. 👏 slow clap",
    "still under budget huh. must be nice to have self control 💅",
    "no overspending today? in THIS economy? suspicious but ok 🕵️",
    "the budget remains unbothered. moisturised. thriving. 🧘",
    "didn't blow the budget today. low bar, but you cleared it 🏆",
    "restraint? from you?? 😮 write it in the history books",
    "wallet's still intact. shocking development honestly 💸✋",
    "you spent like an adult today. don't let it go to your head 🎩",
    "no roast for you today. annoying. be over budget so i can be mean 😈",
    "fine. you did fine. happy now? 🙄 (i am, a little)",
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
