import { Request } from "express";

/**
 * Claude Opus 4.1 and newer models has stricter API validation that doesn't allow both temperature 
 * and top_p parameters to be specified simultaneously. This function validates and 
 * adjusts the request parameters for Claude Opus 4.1 and newer models ONLY.
 * 
 * Rules:
 * - If both parameters are at default values (1.0), omit top_p
 * - If only one parameter is at default, omit the default one
 * - If both are non-default, throw an error
 */
export function validateSupportForTopPAndTemp(req: Request): void {
  const model = req.body.model;
  
  // Only apply this validation to Claude Opus 4.1 models
  if (!isTopPAndTempNotSupported(model)) {
    return;
  }
  
  let temperature = req.body.temperature;
  let topP = req.body.top_p;
  
  // If neither parameter is specified, no validation needed
  if (temperature === undefined && topP === undefined) {
    return;
  }

  // Handle string numbers
  if (temperature !== undefined) temperature = Number(temperature);
  if (topP !== undefined) topP = Number(topP);
  
  // Default values for Claude API
  const DEFAULT_TEMPERATURE = 1.0;
  const DEFAULT_TOP_P = 1.0;
  
  const tempIsDefault = temperature === undefined || temperature === DEFAULT_TEMPERATURE;
  const topPIsDefault = topP === undefined || topP === DEFAULT_TOP_P;
  
  // If both are at default values, omit top_p (keep temperature)
  if (tempIsDefault && topPIsDefault) {
    delete req.body.top_p;
    (req as any).log?.info("Claude Opus 4.1: Both temperature and top_p at default, omitting top_p");
    return;
  }
  
  // If only one is at default, omit the default one
  if (tempIsDefault && !topPIsDefault) {
    delete req.body.temperature;
    (req as any).log?.info("Claude Opus 4.1: Temperature at default, omitting temperature");
    return;
  }
  
  if (!tempIsDefault && topPIsDefault) {
    delete req.body.top_p;
    (req as any).log?.info("Claude Opus 4.1: top_p at default, omitting top_p");
    return;
  }
  
  // If both are non-default, throw an error
  if (!tempIsDefault && !topPIsDefault) {
    throw new Error(
      "Claude 4 does not support both temperature and top_p parameters being set to non-default values simultaneously. " +
      "Please specify only one of these parameters or set one to its default value (1.0)."
    );
  }
}

/**
 * Checks if the given model is a Claude Opus 4.1 model.
 * This includes all provider formats for Claude Opus 4.1 ONLY.
 */
function isTopPAndTempNotSupported(model: string): boolean {
  if (!model) return false;
  
  const normalizedModel = model.toLowerCase().trim();

  // opus
  if (normalizedModel.includes("claude-opus-4-1")) return true;

  // opus 4.5
  if (normalizedModel.includes("claude-opus-4-5")) return true;

  // opus 4.6
  if (normalizedModel.includes("claude-opus-4-6")) return true;

  // opus 4.7
  if (normalizedModel.includes("claude-opus-4-7")) return true;

  // opus 4.8
  if (normalizedModel.includes("claude-opus-4-8")) return true;

  // sonnet45
  if (normalizedModel.includes("claude-sonnet-4-5")) return true;
  
  // haiku45
  if (normalizedModel.includes("claude-haiku-4-5")) return true;
  
  return false;
}
