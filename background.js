let calendarId = "";
let isExtensionActive = false;


chrome.runtime.onInstalled.addListener(() => {
    chrome.action.setBadgeText({ text: "OFF" });
    chrome.storage.sync.set({ isExtensionActive: false });

    chrome.storage.sync.get("calendarId", (data) => {
        calendarId = data.calendarId || "primary";
    });
});


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    
    if (request.action === "toggleExtensionState") {
        isExtensionActive = request.active;
        const badgeText = isExtensionActive ? "ON" : "OFF";
        chrome.action.setBadgeText({ text: badgeText });

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0].id) {
                chrome.tabs.sendMessage(tabs[0].id, { action: "toggleExtensionState", active: isExtensionActive });
            }
        });
    }

    if (request.action === "updateCalendarId") {
        calendarId = request.calendarId;
        sendResponse({ success: true });
    }

    if (request.action === "getEventsList") {
        const { timeMin, timeMax } = request;

        chrome.identity.getAuthToken({ interactive: true }, (token) => {
            if (chrome.runtime.lastError) {
                console.error("Error getting auth token:", chrome.runtime.lastError);
                sendResponse({ error: chrome.runtime.lastError.message });
                return;
            }

            const url = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime`;
            
            fetch(url, {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
            })
            .then(response => {
                if (!response.ok) {
                    return response.json().then(error => {
                        console.error("Error response from API:", error);
                        throw new Error(`HTTP error! status: ${response.status}, message: ${error.message}`);
                    });
                }
                return response.json();
            })
            .then(data => {
                sendResponse({ events: data.items });
            })
            .catch(error => {
                console.error("Error fetching events:", error);
                sendResponse({ error: error.toString() });
            });

            return true;
        });

        return true;
    }

    if (request.action === "getEventDetails") {
        const eventId = request.eventId;

        chrome.identity.getAuthToken({ interactive: true }, (token) => {
            if (chrome.runtime.lastError) {
                console.error("Error getting auth token:", chrome.runtime.lastError);
                sendResponse({ error: chrome.runtime.lastError.message });
                return;
            }

            const url = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventId}`;
            fetch(url, {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
            })
            .then(response => {
                if (!response.ok) {
                    return response.json().then(error => {
                        console.error("Error response from API:", error);
                        throw new Error(`HTTP error! status: ${response.status}, message: ${error.message}`);
                    });
                }
                return response.json();
            })
            .then(event => {
                sendResponse({ event });
            })
            .catch(error => {
                console.error("Error fetching event details:", error);
                sendResponse({ error: error.toString() });
            });

            return true;
        });

        return true;
    }

    
    if (request.action === "updateEvent") {
        const { eventId, newStartTime, newEndTime } = request;

        chrome.identity.getAuthToken({ interactive: true }, (token) => {
            if (chrome.runtime.lastError) {
                console.error("Error getting auth token:", chrome.runtime.lastError);
                sendResponse({ error: chrome.runtime.lastError.message });
                return;
            }

            const url = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventId}`;
            const eventPatch = {
                start: {
                    dateTime: newStartTime
                },
                end: {
                    dateTime: newEndTime
                }
            };

            fetch(url, {
                method: "PATCH",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(eventPatch)
            })
            .then(response => response.json())
            .then(event => {
                sendResponse({ event });
            })
            .catch(error => {
                console.error("Error updating event:", error);
                sendResponse({ error: error.toString() });
            });

            return true;
        });

        return true;
    }
});