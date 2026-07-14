/**
 * Gemini AI Client
 * Path: src/lib/ai/gemini.ts
 *
 * Uses @google/genai (Google Gen AI SDK v1+).
 * Install: npm install @google/genai
 *
 * Model: gemini-2.5-flash
 *   - Best balance of speed, cost, and reasoning for financial analysis
 *   - Supports responseMimeType: "application/json" for guaranteed JSON output
 *   - 1M token context window (more than enough for full transaction history)
 *
 * Configuration:
 *   - temperature 0.2 — low randomness for deterministic financial analysis
 *   - maxOutputTokens 8192 — large enough for comprehensive insights
 *   - responseMimeType "application/json" — eliminates JSON parsing failures
 *
 * Safety: All HARM categories set to BLOCK_NONE because financial data
 *   about spending/debt can false-trigger content filters.
 */

import { GoogleGenAI, HarmBlockThreshold, HarmCategory } from "@google/genai"

const apiKey = process.env.GEMINI_API_KEY || "dummy-key-for-build"

// ── Singleton ─────────────────────────────────────────────────

const globalForAI = globalThis as unknown as { genAI: GoogleGenAI | undefined }

export const genAI: GoogleGenAI =
  globalForAI.genAI ?? new GoogleGenAI({ apiKey })

if (process.env.NODE_ENV !== "production") globalForAI.genAI = genAI

// ── Model identifier ──────────────────────────────────────────

export const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash"

// ── Default generation config ─────────────────────────────────

export const INSIGHTS_GEN_CONFIG = {
  responseMimeType: "application/json" as const,
  temperature:      0.2,           // near-deterministic for financial data
  maxOutputTokens:  8192,
  topP:             0.8,
  topK:             20,
}

// ── Safety settings ───────────────────────────────────────────
// Financial terms (debt, loss, bankruptcy) can trip default filters.
// We disable blocking for all categories for this internal tool.
export const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT,        threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,       threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
]

// ── Helper: generate with retry ───────────────────────────────

/**
 * Calls Gemini with exponential back-off on 429 (rate-limit) errors.
 * Returns the raw text content of the first candidate.
 */
export async function generateWithRetry(
  systemInstruction: string,
  userPrompt:        string,
  maxRetries = 3
): Promise<string> {
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "dummy-key-for-build") {
    throw new Error(
      "GEMINI_API_KEY is not set. Add it to .env.local.\n" +
      "Get a key at: https://aistudio.google.com/app/apikey"
    )
  }

  let lastError: unknown

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await genAI.models.generateContent({
        model:   GEMINI_MODEL,
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        config: {
          ...INSIGHTS_GEN_CONFIG,
          systemInstruction,
          safetySettings: SAFETY_SETTINGS,
        },
      })

      const text = response.text ?? ""
      if (!text) throw new Error("Gemini returned an empty response.")
      return text

    } catch (err: unknown) {
      lastError = err
      const isRateLimit =
        err instanceof Error &&
        (err.message.includes("429") || err.message.includes("RESOURCE_EXHAUSTED"))

      if (isRateLimit && attempt < maxRetries) {
        // Exponential back-off: 2s → 4s → 8s
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt))
        continue
      }
      break
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Gemini API call failed after retries.")
}