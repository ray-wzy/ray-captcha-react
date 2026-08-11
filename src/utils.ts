// cn: className merge helper (depends only on clsx, not on tailwind)
import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}
