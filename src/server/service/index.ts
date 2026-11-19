/**
 * The service layer: the ONLY code that touches the database.
 * Every function takes an `Access` first and throws NotFound for anything outside its Spaces.
 */
export * from "./spaces";
export * from "./tasks";
export * from "./milestones";
export * from "./documents";
export * from "./decisions";
export * from "./search";
export * from "./statistics";
export * from "./activity";
export { getSettings, updateSettings, DEFAULT_SETTINGS } from "./settings";
export type { Access } from "@/lib/types";
export { loginRetryAfter, recordLoginFailure, clearLoginFailures } from "./login-limit";
