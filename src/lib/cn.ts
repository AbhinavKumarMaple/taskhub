import { clsx, type ClassValue } from "clsx";

/** Join class names (clsx). */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}
