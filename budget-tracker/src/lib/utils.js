import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

// shadcn's class helper: merges conditional classes (clsx) and resolves
// conflicting Tailwind utilities so the last one wins (twMerge).
export function cn(...inputs) {
  return twMerge(clsx(inputs))
}
