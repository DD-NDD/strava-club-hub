/**
 * @fileoverview API endpoints for handling event registrations.
 */

/**
 * Gets the list of people registered for a specific event.
 * @param {string|number} eventId The ID of the event.
 * @return {string} A JSON string of the API response.
 */
function getEventRegistrations(eventId) {
    if (!eventId) {
        return JSON.stringify({ success: false, error: "Event ID is required." });
    }
    try {
        const allRegistrations = SheetService.getDataAsObjects(SHEET_NAMES.REGISTRATIONS);
        const eventRegistrations = allRegistrations
            .filter(r => String(r.EventID) === String(eventId))
            .map(r => ({ 
                name: r.Name, 
                type: r.ParticipationType, 
                registeredAt: r.RegisteredAt,
                notes: r.Notes // <-- UPDATED: Now returns notes
            }));

        return JSON.stringify({ success: true, data: eventRegistrations });
    } catch (e) {
        debugLog(`Error in getEventRegistrations: ${e.message}`, 'ERROR');
        return JSON.stringify({ success: false, error: e.message });
    }
}


/**
 * Registers a user for an event. It now checks the event's registration type.
 * For "Public" events, it uses the manually entered name.
 * @param {object} payload - The registration data from the client.
 * @param {string} payload.eventId - The ID of the event to register for.
 * @param {string} payload.name - The user's manually entered name.
 * @param {string} payload.participationType - The type of participation.
 * @param {string} [payload.notes] - Optional notes from the user.
 * @param {string} [payload.stravaLink] - Optional Strava link for challenges.
 * @returns {string} A JSON string indicating success or failure.
 */
function registerForEvent(payload) {
    const { eventId, name, participationType, notes = '', stravaLink = '' } = payload;

    if (!eventId || !name || !participationType) {
        return JSON.stringify({ success: false, error: "Event ID, Name, and Participation Type are required." });
    }

    try {
        const allEvents = SheetService.getDataAsObjects(SHEET_NAMES.EVENTS);
        const event = allEvents.find(e => String(e.ID) === String(eventId));
        
        if (!event) return JSON.stringify({ success: false, error: "Event not found." });
        if (event.Status !== 'Active') return JSON.stringify({ success: false, error: "Registration for this event is closed." });

        if (event.RegistrationType !== 'Public') {
            return JSON.stringify({ success: false, error: "This event does not allow public registration." });
        }

        const allRegistrations = SheetService.getDataAsObjects(SHEET_NAMES.REGISTRATIONS);
        const eventRegistrations = allRegistrations.filter(r => String(r.EventID) === String(eventId));

        if (event.MaxParticipants && eventRegistrations.length >= event.MaxParticipants) {
            return JSON.stringify({ success: false, error: "Sorry, this event is already full." });
        }
        
        const isAlreadyRegistered = eventRegistrations.some(r => r.Name.trim().toLowerCase() === name.trim().toLowerCase());
        if (isAlreadyRegistered) {
            return JSON.stringify({ success: false, error: `The name "${name}" is already registered for this event.` });
        }

        const newRegistration = {
            EventID: eventId,
            Name: name.trim(),
            ParticipationType: participationType,
            RegisteredAt: new Date(),
            Notes: notes,
            StravaLink: stravaLink
        };

        SheetService.appendObjects(SHEET_NAMES.REGISTRATIONS, [newRegistration]);
        AppCache.remove(CACHE_KEYS.ALL_EVENTS);

        return JSON.stringify({ success: true, message: `Successfully registered "${name}" for "${event.Title}"!` });

    } catch (e) {
        debugLog(`Error in registerForEvent: ${e.message}`, 'ERROR');
        return JSON.stringify({ success: false, error: e.message });
    }
}


/**
 * Deletes/cancels a registration for a given event and name.
 * @param {object} payload - The cancellation data.
 * @param {string} payload.eventId - The ID of the event.
 * @param {string} payload.name - The name on the registration to delete.
 * @returns {string} A JSON string indicating success or failure.
 */
function deleteRegistration(payload) {
    const { eventId, name } = payload;
    if (!eventId || !name) {
        return JSON.stringify({ success: false, error: "Event ID and Name are required." });
    }
    
    try {
        const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.REGISTRATIONS);
        const data = sheet.getDataRange().getValues();
        const headers = data[0];
        const eventIdCol = headers.indexOf('EventID');
        const nameCol = headers.indexOf('Name');

        if (eventIdCol === -1 || nameCol === -1) {
            throw new Error("Could not find required columns (EventID, Name) in Registrations sheet.");
        }
        
        for (let i = data.length - 1; i > 0; i--) {
            const row = data[i];
            if (String(row[eventIdCol]) === String(eventId) && row[nameCol].trim().toLowerCase() === name.trim().toLowerCase()) {
                sheet.deleteRow(i + 1);
                AppCache.remove(CACHE_KEYS.ALL_EVENTS);
                return JSON.stringify({ success: true, message: `Registration for "${name}" has been cancelled.` });
            }
        }
        
        return JSON.stringify({ success: false, error: `Registration for "${name}" not found.` });

    } catch (e) {
        debugLog(`Error in deleteRegistration: ${e.message}`, 'ERROR');
        return JSON.stringify({ success: false, error: e.message });
    }
}