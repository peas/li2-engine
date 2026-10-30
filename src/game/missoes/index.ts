// The quests without three.js or the DOM (the `li2-engine/game/missoes` export): schema, interpreter, repeatables and
// the text helpers. A 2D game imports this instead of `li2-engine/game`, which also brings npc.ts and bichos/ (three).
export * from "./schema";
export * from "./missoes";
export * from "./repetiveis";
export * from "./texto";
