import { Generator, getConfig } from "@tanstack/router-generator";
const config = await getConfig(undefined, process.cwd());
const gen = new Generator({ config, root: process.cwd() });
await gen.run();
console.log("Routes regenerated.");
