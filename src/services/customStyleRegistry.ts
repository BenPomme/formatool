import { StyleExtractionResult } from '../types/styleAttributes';

const CUSTOM_STYLE_REGISTRY = new Map<string, StyleExtractionResult>();

export function registerCustomStyle(styleId: string, extraction: StyleExtractionResult): void {
  CUSTOM_STYLE_REGISTRY.set(styleId, extraction);
}

export function getCustomStyle(styleId: string): StyleExtractionResult | undefined {
  return CUSTOM_STYLE_REGISTRY.get(styleId);
}

export function clearCustomStyle(styleId: string): void {
  CUSTOM_STYLE_REGISTRY.delete(styleId);
}
