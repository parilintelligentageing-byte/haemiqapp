import Anthropic from "@anthropic-ai/sdk";

// This module must only ever be imported from "use server" files
// (lib/actions/*.ts). Importing it from a client component would try to
// bundle the Anthropic SDK — and this key — into browser JS.
export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});
