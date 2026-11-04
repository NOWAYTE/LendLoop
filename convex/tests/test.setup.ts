/// <reference types="vite/client" />
// Every Convex module, for convex-test. Files with two dots (tests, this file) are excluded.
export const modules = import.meta.glob("../**/!(*.*.*)*.*s");
