const calendarId = "YOUR_CALENDAR_ID"; // probably your gmail address


chrome.runtime.onInstalled.addListener(() => {
    chrome.action.setBadgeText({
        text: "OFF",
    });
});


chrome.action.onClicked.addListener(async (tab) => {
    if (tab.url.includes("calendar.google.com")) {
        const prevState = await chrome.action.getBadgeText({ tabId: tab.id });
        const nextState = prevState === 'ON' ? 'OFF' : 'ON';

        await chrome.action.setBadgeText({ 
            tabId: tab.id, 
            text: nextState 
        });

        if (nextState === 'ON') {
            chrome.tabs.sendMessage(tab.id, {
                action: "showAlert", 
                message: "Ctrl+Click to select non-All-Day events. Move one of them, then press Ctrl+Enter to move the rest."
            });

            chrome.tabs.sendMessage(tab.id, { 
                action: "toggleExtensionState", 
                active: true
            });

        } else if (nextState === 'OFF') {
            chrome.tabs.sendMessage(tab.id, { 
                action: "toggleExtensionState", 
                active: false
            });
        }
    }
});


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    
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