/**
 * @fileoverview This file contains generic utility and helper functions
 * that are used across the project and are not specific to any business logic.
 */

/**
 * Enhanced logging function that respects the global DEBUG_MODE flag.
 * It now has an integrated option to write logs to a dedicated Google Sheet
 * for persistent, reliable debugging of background processes like webhooks.
 *
 * @param {string|object} message The message or object to log.
 * @param {string} [level='INFO'] The log level (e.g., INFO, DEBUG, ERROR, CRITICAL).
 * @param {boolean} [writeToSheet=false] If true, and if DEBUG_MODE is also true, the log will be written to the 'DebugLogs' sheet.
 */
function debugLog(message, level = 'INFO', writeToSheet = false) {
  // First, always handle the standard Logger.log functionality (respecting DEBUG_MODE).
  // This is useful for quick debugging in the Executions panel.
  if (DEBUG_MODE || level !== 'DEBUG') {
    const timestamp = new Date().toISOString();
    // Ensure the message for the standard logger is a primitive string.
    const logMessageForLogger = (typeof message === 'object') ? JSON.stringify(message) : message;
    const formattedMessage = `[${timestamp}] [${level}] ${logMessageForLogger}`;
    Logger.log(formattedMessage);
  }

  // Second, if the 'writeToSheet' flag is true AND DEBUG_MODE is on, call our robust sheet logging function.
  // This provides a persistent and reliable log record only when needed.
  if (writeToSheet === true && DEBUG_MODE) {
    // The sheetLog function handles its own timestamping and formatting.
    sheetLog(message, level);
  }
}

/**
 * Writes a log message to a dedicated Google Sheet named 'DebugLogs'.
 * This is a robust helper function for debugLog.
 * It automatically creates the sheet if it doesn't exist, uses LockService
 * to prevent race conditions, and now CLEARS LOGS OLDER THAN 7 DAYS.
 *
 * @param {string|object} message The message or object to log.
 * @param {string} [level='INFO'] The log level (e.g., INFO, DEBUG, ERROR).
 */
function sheetLog(message, level = 'INFO') {
  // If debug mode is off, do not log messages with the 'DEBUG' level.
  if (!DEBUG_MODE && level === 'DEBUG') {
    return; // Exit the function immediately, nothing is logged.
  }
  
  // Use LockService to prevent multiple simultaneous writes from corrupting the sheet.
  const lock = LockService.getScriptLock();
  lock.waitLock(15000); // Wait up to 15 seconds for other processes to finish.

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET_NAMES.DEBUG_LOGS);

    // If the log sheet doesn't exist, create it and add headers.
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAMES.DEBUG_LOGS, 0); // Insert as the first sheet
      sheet.appendRow(['Timestamp', 'Level', 'Message']);
      sheet.setFrozenRows(1);
      sheet.getRange("A:A").setNumberFormat("yyyy-mm-dd hh:mm:ss");
      sheet.getRange("C:C").setWrap(true);
    }

    // --- NEW: LOG DELETION LOGIC ---
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) { // Check if there are any logs to potentially delete
        const range = sheet.getRange(`A2:A${lastRow}`);
        const timestamps = range.getValues();
        const now = new Date().getTime();
        const sevenDaysInMillis = 7 * 24 * 60 * 60 * 1000;
        let rowsToDelete = 0;

        for (let i = 0; i < timestamps.length; i++) {
            const logTime = new Date(timestamps[i][0]).getTime();
            if ((now - logTime) > sevenDaysInMillis) {
                rowsToDelete++;
            } else {
                // Since logs are appended chronologically, we can stop when we find a recent one.
                break;
            }
        }

        if (rowsToDelete > 0) {
            // +1 because row indices are 1-based, and we start from row 2.
            sheet.deleteRows(2, rowsToDelete);
            Logger.log(`[sheetLog] Cleared ${rowsToDelete} old log entries.`);
        }
    }
    // --- END: LOG DELETION LOGIC ---


    const timestamp = new Date();
    // If the message is an object (like 'e.postData'), stringify it for logging.
    const messageStr = (typeof message === 'object') ? JSON.stringify(message, null, 2) : message;

    // Append the new log entry as a row.
    sheet.appendRow([timestamp, level, messageStr]);

  } catch (e) {
    // If logging to the sheet fails for any reason, fall back to the standard logger.
    Logger.log(`FATAL: Could not write to log sheet. Error: ${e.message}`);
  } finally {
    // Always release the lock to allow other processes to run.
    lock.releaseLock();
  }
}

/**
 * A utility function to include HTML content from another file into a template.
 * @param {string} filename The name of the HTML file to include (without extension).
 * @return {string} The content of the HTML file.
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Encodes data using a simple Caesar cipher shift.
 * This is not for security, but for simple obfuscation as in the original code.
 * It only shifts alphabetic characters.
 *
 * @param {string} data The data to encode.
 * @return {string} The encoded data.
 */
function encodeData(data) {
  if (!data) return '';
  const shift = 3;
  let encodedData = "";
  for (let i = 0; i < data.length; i++) {
    let charCode = data.charCodeAt(i);
    if (charCode >= 65 && charCode <= 90) { // Uppercase letters
      charCode = ((charCode - 65 + shift) % 26) + 65;
    } else if (charCode >= 97 && charCode <= 122) { // Lowercase letters
      charCode = ((charCode - 97 + shift) % 26) + 97;
    }
    encodedData += String.fromCharCode(charCode);
  }
  return encodedData;
}

/**
 * Decodes data that was encoded with `encodeData`.
 *
 * @param {string} encodedData The data to decode.
 * @return {string} The decoded data.
 */
function decodeData(encodedData) {
  if (!encodedData) return '';
  const shift = 3;
  let decodedData = "";
  for (let i = 0; i < encodedData.length; i++) {
    let charCode = encodedData.charCodeAt(i);
    if (charCode >= 65 && charCode <= 90) { // Uppercase letters
      charCode = ((charCode - 65 - shift + 26) % 26) + 65;
    } else if (charCode >= 97 && charCode <= 122) { // Lowercase letters
      charCode = ((charCode - 97 - shift + 26) % 26) + 97;
    }
    decodedData += String.fromCharCode(charCode);
  }
  return decodedData;
}

/**
 * Parses a date string in "dd/MM/yyyy HH:mm:ss" format into a Date object.
 * This is more reliable than new Date() for non-standard formats.
 * @param {string} ddmmyyyyStr The date string to parse.
 * @return {Date|null} The parsed Date object or null if the format is invalid.
 */
function parseCustomDateString(ddmmyyyyStr) {
  if (!ddmmyyyyStr || typeof ddmmyyyyStr !== 'string') {
    return null;
  }
  
  // Regex to capture parts of the date string
  const parts = ddmmyyyyStr.match(/(\d{2})\/(\d{2})\/(\d{4})\s(\d{2}):(\d{2}):(\d{2})/);
  
  if (!parts) {
    // If format doesn't match, try parsing as ISO as a fallback
    const isoDate = new Date(ddmmyyyyStr);
    return isNaN(isoDate) ? null : isoDate;
  }
  
  // parts[1] is day, [2] is month, [3] is year, etc.
  // The month in JavaScript's Date constructor is 0-indexed (0-11).
  return new Date(parts[3], parts[2] - 1, parts[1], parts[4], parts[5], parts[6]);
}

/**
 * Converts an ISO 8601 date string or an array of strings (in UTC) 
 * to a specific timezone and returns a valid Date object or an array of dates.
 *
 * @param {string|string[][]} input The ISO 8601 string or a range of cells containing strings.
 * @param {string} timezone The target timezone (e.g., "Asia/Ho_Chi_Minh").
 * @return {Date|Date[][]} A single Date object or a 2D array of dates for Google Sheets.
 * @customfunction
 */
function ConvertIsoToTimezone(input, timezone) {
  // If the input is a single cell (string), process it directly.
  if (typeof input === 'string') {
    return convertSingleIso(input, timezone);
  }

  // If the input is a range (array of arrays), process each cell.
  if (Array.isArray(input)) {
    return input.map(function(row) {
      return row.map(function(cell) {
        return convertSingleIso(cell, timezone);
      });
    });
  }
}

/**
 * Helper function to convert a single ISO string.
 * @param {string} isoString The ISO string.
 * @param {string} timezone The target timezone.
 * @return {Date|string|null} The converted Date object or null/error.
 */
function convertSingleIso(isoString, timezone) {
  if (typeof isoString !== 'string' || isoString === "") {
    return null; // Return empty if the cell is empty.
  }
  if (typeof timezone !== 'string' || timezone === "") {
    return "Missing timezone";
  }

  try {
    const utcDate = new Date(isoString);
    const newDateString = Utilities.formatDate(utcDate, timezone, "yyyy-MM-dd HH:mm:ss");
    return new Date(newDateString);
  } catch (e) {
    return "Invalid format"; // Return error text for the specific cell.
  }
}

