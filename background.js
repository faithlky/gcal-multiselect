let calendarId = "";
let isExtensionActive = false;
let authToken = null;


chrome.runtime.onInstalled.addListener(() => {
    chrome.action.setBadgeText({ text: "OFF" });
    chrome.storage.sync.set({ isExtensionActive: false });
    chrome.storage.sync.get("calendarId", (data) => {
        calendarId = data.calendarId || "";
    });
});


chrome.runtime.onStartup.addListener(() => {
    chrome.storage.sync.get(["isExtensionActive", "calendarId"], (data) => {
        isExtensionActive = data.isExtensionActive || false;
        const badgeText = isExtensionActive ? "ON" : "OFF";
        chrome.action.setBadgeText({ text: badgeText });
        calendarId = data.calendarId || "";
    });
});


function getAuthToken() {
    return new Promise((resolve, reject) => {
        if (authToken) {
            resolve(authToken);
        } else {
            chrome.identity.getAuthToken({ interactive: true }, (token) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    authToken = token;
                    resolve(token);
                }
            });
        }
    });
}


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
        const newCalendarId = request.calendarId;
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0].id) {
                chrome.tabs.sendMessage(tabs[0].id, { action: "updateCalendarId", newCalendarId });
            }
        });
        const listener = (contentRequest) => {
            if (contentRequest.action === "deselectedAllEvents") {
                calendarId = contentRequest.calendarId;
                chrome.runtime.onMessage.removeListener(listener);
            }
        };
        chrome.runtime.onMessage.addListener(listener);
        return true;
    }

    if (request.action === "getEventsList") {
        const { timeMin, timeMax } = request;

        getAuthToken().then((token) => {
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
        })
        .catch(error => {
            console.error("Error getting auth token:", error);
            sendResponse({ error: error.message });
        });

        return true;
    }

    if (request.action === "getEventDetails") {
        const eventId = request.eventId;

        getAuthToken().then((token) => {
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
        })
        .catch(error => {
            console.error("Error getting auth token:", error);
            sendResponse({ error: error.message });
        });

        return true;
    }
    
    if (request.action === "updateEvent") {
        const { eventId, newStartTime, newEndTime } = request;

        getAuthToken().then((token) => {
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
        })
        .catch(error => {
            console.error("Error getting auth token:", error);
            sendResponse({ error: error.message });
        });

        return true;
    }

    if (request.action === "deleteEvent") {
        const eventId = request.eventId;

        getAuthToken().then((token) => {
            const url = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventId}`;
            fetch(url, {
                method: "DELETE",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                }
            })
            .then(response => {
                if (!response.ok) {
                    return response.json().then(error => {
                        console.error("Error response from API:", error);
                        throw new Error(`HTTP error! status: ${response.status}, message: ${error.message}`);
                    });
                }
                sendResponse({ success: true });
            })
            .catch(error => {
                console.error("Error deleting event:", error);
                sendResponse({ error: error.toString() });
            });

            return true;
        })
        .catch(error => {
            console.error("Error getting auth token:", error);
            sendResponse({ error: error.message });
        });

        return true;
    }
});
