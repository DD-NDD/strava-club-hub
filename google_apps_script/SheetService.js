/**
 * @fileoverview This service handles all direct interactions with Google Sheets.
 * No other module should call SpreadsheetApp directly. This centralizes I/O operations
 * for easier maintenance and performance optimization. It uses a row-based object
 * approach for all data manipulations.
 */

class SheetService {
  /**
   * Gets all data from a sheet and converts it into an array of objects.
   * The first row is assumed to be the header. Caching is recommended
   * at a higher level service that uses this method.
   *
   * @param {string} sheetName The name of the sheet to read.
   * @return {Array<Object>} An array of objects representing the sheet data.
   */
  static getDataAsObjects(sheetName) {
    try {
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
      if (!sheet) {
        throw new Error(`Sheet "${sheetName}" not found.`);
      }
      
      const dataRange = sheet.getDataRange();
      const values = dataRange.getValues();
      
      if (values.length <= 1) return []; // No data other than header
      
      const headers = values[0].map(header => String(header).trim());
      
      return values.slice(1).map(row => {
        const obj = {};
        headers.forEach((header, index) => {
          if (header) { // Only map columns with a header
             obj[header] = row[index];
          }
        });
        return obj;
      });
      
    } catch (error) {
      debugLog(`Error in SheetService.getDataAsObjects for sheet "${sheetName}": ${error.message}`, 'ERROR');
      throw error; // Re-throw the error to be handled by the calling function
    }
  }

  /**
   * Appends an array of objects as new rows to the specified sheet.
   * This is highly efficient as it uses a single `setValues` call.
   *
   * @param {string} sheetName The name of the sheet to append to.
   * @param {Array<Object>} objectsToAppend The array of objects to convert into rows.
   * @return {{success: boolean, error?: string}}
   */
  static appendObjects(sheetName, objectsToAppend) {
    if (!objectsToAppend || objectsToAppend.length === 0) {
      return { success: true }; // Nothing to append
    }

    try {
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
      if (!sheet) throw new Error(`Sheet "${sheetName}" not found.`);
      
      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h).trim());
      
      const newRows = objectsToAppend.map(obj => 
        headers.map(header => obj.hasOwnProperty(header) ? obj[header] : '')
      );

      sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, headers.length).setValues(newRows);
      
      return { success: true };
    } catch (error) {
      debugLog(`Error in SheetService.appendObjects for sheet "${sheetName}": ${error.message}`, 'ERROR');
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Updates a single row found by its ID.
   *
   * @param {string} sheetName The name of the sheet.
   * @param {string|number} id The ID of the row to update.
   * @param {Object} objectToUpdate An object containing the new values. Keys must match headers.
   * @param {string} [idColumn='ID'] The header name of the ID column.
   * @return {{success: boolean, error?: string}}
   */
  static updateObjectById(sheetName, id, objectToUpdate, idColumn = 'ID') {
    try {
        const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
        if (!sheet) throw new Error(`Sheet "${sheetName}" not found.`);

        const data = sheet.getDataRange().getValues();
        const headers = data[0].map(h => String(h).trim());
        const idColIndex = headers.indexOf(idColumn);
        if (idColIndex === -1) throw new Error(`ID column "${idColumn}" not found in sheet "${sheetName}".`);

        const rowIndex = data.findIndex((row, index) => index > 0 && row[idColIndex] == id);

        if (rowIndex === -1) {
            return { success: false, error: `Row with ID "${id}" not found in sheet "${sheetName}".` };
        }

        const rowToUpdate = data[rowIndex];
        headers.forEach((header, index) => {
            if (objectToUpdate.hasOwnProperty(header)) {
                rowToUpdate[index] = objectToUpdate[header];
            }
        });

        // +1 because sheet ranges are 1-indexed.
        sheet.getRange(rowIndex + 1, 1, 1, rowToUpdate.length).setValues([rowToUpdate]);
        return { success: true };

    } catch (error) {
        debugLog(`Error in SheetService.updateObjectById for sheet "${sheetName}": ${error.message}`, 'ERROR');
        return { success: false, error: error.message };
    }
  }

  /**
   * Removes duplicate rows from a sheet based on a specific column.
   *
   * @param {string} sheetName The name of the sheet.
   * @param {number} columnNumber The 1-based index of the column to check for duplicates.
   */
  static removeDuplicates(sheetName, columnNumber) {
    try {
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
      if (!sheet) throw new Error(`Sheet "${sheetName}" not found.`);
      
      sheet.getDataRange().removeDuplicates([columnNumber]);
    } catch (error) {
      debugLog(`Error in SheetService.removeDuplicates for sheet "${sheetName}": ${error.message}`, 'ERROR');
    }
  }

  /**
   * Removes all activities that are not of type 'Swim' from the Activities sheet.
   * It reads all data, filters it, and overwrites the sheet with the cleaned data.
   * This is more efficient than deleting rows one by one.
   *
   * @return {{success: boolean, removedCount: number, error?: string}} An object indicating success,
   * the number of rows removed, and an error message if one occurred.
   */
  static removeNonSwimActivities() {
    const sheetName = SHEET_NAMES.ACTIVITIES;
    try {
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
      if (!sheet) {
        throw new Error(`Sheet "${sheetName}" not found.`);
      }

      const allData = sheet.getDataRange().getValues();
      if (allData.length <= 1) {
        debugLog('No data to process in the Activities sheet.', 'INFO');
        return { success: true, removedCount: 0 };
      }

      const headers = allData[0];
      const typeColumnIndex = headers.indexOf('type');

      if (typeColumnIndex === -1) {
        throw new Error("A 'type' column is required in the Activities sheet.");
      }

      // Keep the header row and all rows where the type is 'Swim'.
      const swimActivities = allData.filter((row, index) => {
        return index === 0 || row[typeColumnIndex] === STRAVA_SETTINGS.ACTIVITY_TYPE_TO_SYNC;
      });

      const originalRowCount = allData.length;
      const finalRowCount = swimActivities.length;
      const removedCount = originalRowCount - finalRowCount;

      if (removedCount > 0) {
        // Clear the entire sheet first.
        sheet.clearContents();
        
        // Write the filtered data (headers + swim activities) back to the sheet.
        sheet.getRange(1, 1, swimActivities.length, headers.length).setValues(swimActivities);
        
        debugLog(`Successfully removed ${removedCount} non-swim activities.`, 'INFO');
        
        // Since activities were removed, it's crucial to invalidate caches.
        AppCache.invalidateActivityCaches();
      } else {
        debugLog('No non-swim activities found to remove.', 'INFO');
      }

      return { success: true, removedCount: removedCount };

    } catch (error) {
      debugLog(`Error in SheetService.removeNonSwimActivities: ${error.message}`, 'ERROR');
      return { success: false, removedCount: 0, error: error.message };
    }
  }
}

