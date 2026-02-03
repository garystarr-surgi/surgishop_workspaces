/**
 * SurgiShop ERP Scanner - GS1 Barcode Parsing Utilities
 * Inspired by bark.js - Properly handles GS1 Application Identifiers
 * Supports alphanumeric lot numbers and variable-length fields
 */

// Namespace for GS1 utilities
if (typeof window.surgishop === "undefined") {
  window.surgishop = {};
}

/**
 * GS1 Application Identifier Definitions
 * Based on GS1 General Specifications
 * Inspired by bark.js implementation
 */
surgishop.GS1_AI_DEFINITIONS = {
  "01": { name: "GTIN", length: 14, type: "numeric" },
  10: { name: "LOT", length: "variable", maxLength: 20, type: "alphanumeric" },
  11: { name: "PROD_DATE", length: 6, type: "numeric" },
  15: { name: "BEST_BEFORE", length: 6, type: "numeric" },
  17: { name: "EXPIRY", length: 6, type: "numeric" },
  21: {
    name: "SERIAL",
    length: "variable",
    maxLength: 20,
    type: "alphanumeric",
  },
  30: { name: "COUNT", length: "variable", maxLength: 8, type: "numeric" },
  310: { name: "NET_WEIGHT_KG", length: 6, type: "numeric" },
  37: { name: "QUANTITY", length: "variable", maxLength: 8, type: "numeric" },
};

/**
 * GS1 Barcode Parser (bark.js style)
 * Extracts data from GS1 barcodes with proper AI handling
 */
surgishop.GS1Parser = class GS1Parser {
  /**
   * Parses a GS1 string to extract all Application Identifiers.
   * Handles both fixed-length and variable-length fields.
   * Supports alphanumeric characters in variable fields (e.g., lot numbers).
   *
   * @param {string} gs1_string The raw scanned GS1 barcode string
   * @returns {object|null} Parsed data with extracted AIs or null if parsing fails
   */
  static parse(gs1_string) {
    // Validate input
    if (!gs1_string || typeof gs1_string !== "string") {
      return null;
    }

    const result = {};
    let pos = 0;

    // Keep parsing until we've consumed the entire string
    while (pos < gs1_string.length) {
      // Try to identify the AI (2 or 3 digits)
      let ai = null;
      let aiDef = null;

      // Check for 3-digit AI first
      if (pos + 3 <= gs1_string.length) {
        const threeDigitAI = gs1_string.substr(pos, 3);
        if (surgishop.GS1_AI_DEFINITIONS[threeDigitAI]) {
          ai = threeDigitAI;
          aiDef = surgishop.GS1_AI_DEFINITIONS[ai];
        }
      }

      // If not found, check for 2-digit AI
      if (!ai && pos + 2 <= gs1_string.length) {
        const twoDigitAI = gs1_string.substr(pos, 2);
        if (surgishop.GS1_AI_DEFINITIONS[twoDigitAI]) {
          ai = twoDigitAI;
          aiDef = surgishop.GS1_AI_DEFINITIONS[ai];
        }
      }

      if (!ai) {
        return null;
      }

      // Move position past the AI
      pos += ai.length;

      // Extract the data based on AI definition
      let data = "";

      if (aiDef.length === "variable") {
        // Variable length: read until end of string or until next AI
        let endPos = pos;
        let foundNextAI = false;

        // Scan ahead looking for the next AI
        for (let i = pos; i < gs1_string.length; i++) {
          if (i > pos) {
            const potentialAI2 = gs1_string.substr(i, 2);
            const potentialAI3 = gs1_string.substr(i, 3);
            const isAtMinDistance = i - pos >= 1;

            // Check if this is a valid AI
            if (surgishop.GS1_AI_DEFINITIONS[potentialAI3]) {
              endPos = i;
              foundNextAI = true;
              break;
            } else if (
              surgishop.GS1_AI_DEFINITIONS[potentialAI2] &&
              potentialAI2 !== "01" &&
              isAtMinDistance
            ) {
              endPos = i;
              foundNextAI = true;
              break;
            }
          }

          // Stop if we've reached max length
          if (aiDef.maxLength && i - pos >= aiDef.maxLength) {
            endPos = i;
            break;
          }
        }

        // If no next AI found, read to end of string
        if (!foundNextAI) {
          endPos = gs1_string.length;
        }

        data = gs1_string.substring(pos, endPos);
        pos = endPos;
      } else {
        // Fixed length: read exactly the specified number of characters
        const length = parseInt(aiDef.length);
        if (pos + length > gs1_string.length) {
          return null;
        }
        data = gs1_string.substr(pos, length);
        pos += length;
      }

      // Store the parsed value using the AI name
      result[aiDef.name.toLowerCase()] = data;
    }

    // For backward compatibility, add aliases
    if (result.gtin) result.gtin = result.gtin;
    if (result.expiry) result.expiry = result.expiry;
    if (result.lot) result.lot = result.lot;

    return result;
  }

  /**
   * Validates if a string is likely a GS1 barcode
   * @param {string} input The string to validate
   * @returns {boolean} True if likely a GS1 barcode
   */
  static isGS1(input) {
    if (!input || typeof input !== "string") return false;
    if (input.length < 4) return false;

    const twoDigitAI = input.substr(0, 2);
    const threeDigitAI = input.substr(0, 3);

    return !!(
      surgishop.GS1_AI_DEFINITIONS[twoDigitAI] ||
      surgishop.GS1_AI_DEFINITIONS[threeDigitAI]
    );
  }

  /**
   * Formats a GS1 barcode for display (with parentheses around AIs)
   * @param {object} parsed The parsed GS1 data
   * @returns {string} Formatted string like (01)12345678901234(17)250101(10)LOT123
   */
  static format(parsed) {
    if (!parsed || typeof parsed !== "object") return "";

    let formatted = "";

    if (parsed.gtin) formatted += `(01)${parsed.gtin}`;
    if (parsed.expiry) formatted += `(17)${parsed.expiry}`;
    if (parsed.best_before) formatted += `(15)${parsed.best_before}`;
    if (parsed.prod_date) formatted += `(11)${parsed.prod_date}`;
    if (parsed.lot) formatted += `(10)${parsed.lot}`;
    if (parsed.serial) formatted += `(21)${parsed.serial}`;
    if (parsed.quantity) formatted += `(37)${parsed.quantity}`;

    return formatted;
  }

  /**
   * Converts parsed data back to raw GS1 string (without parentheses)
   * @param {object} parsed The parsed GS1 data
   * @returns {string} Raw GS1 string
   */
  static stringify(parsed) {
    if (!parsed || typeof parsed !== "object") return "";

    let raw = "";

    if (parsed.gtin) raw += `01${parsed.gtin}`;
    if (parsed.expiry) raw += `17${parsed.expiry}`;
    if (parsed.best_before) raw += `15${parsed.best_before}`;
    if (parsed.prod_date) raw += `11${parsed.prod_date}`;
    if (parsed.lot) raw += `10${parsed.lot}`;
    if (parsed.serial) raw += `21${parsed.serial}`;
    if (parsed.quantity) raw += `37${parsed.quantity}`;

    return raw;
  }
};

// Export for use in other modules
window.surgishop.GS1Parser = surgishop.GS1Parser;
