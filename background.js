let selectedCalendarId = "";
let isExtensionActive = false;
let authToken = null;


chrome.runtime.onInstalled.addListener(() => {
    chrome.action.setBadgeText({ text: "OFF" });
    chrome.storage.sync.set({ isExtensionActive: false });
    chrome.storage.sync.get("selectedCalendarId", (data) => {
        selectedCalendarId = data.selectedCalendarId || "";
    });
});


chrome.runtime.onStartup.addListener(() => {
    chrome.storage.sync.get(["isExtensionActive", "selectedCalendarId"], (data) => {
        isExtensionActive = data.isExtensionActive || false;
        let badgeText = isExtensionActive ? "ON" : "OFF";
        chrome.action.setBadgeText({ text: badgeText });
        selectedCalendarId = data.selectedCalendarId || "";
    });
});


// When page is reloaded
chrome.webNavigation.onCommitted.addListener(() => {
    chrome.storage.sync.get(["isExtensionActive", "selectedCalendarId"], (data) => {
        if (isExtensionActive) {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0].id) {
                    let promise = checkAndInjectContentScript(tabs[0].id);
                    promise.then(
                        chrome.tabs.sendMessage(tabs[0].id, { action: "toggleExtensionState", active: isExtensionActive })
                    )
                }
            });
        }
        selectedCalendarId = data.selectedCalendarId || "";
    });
}, {
    url: [{ hostContains: "calendar.google.com/calendar" }]
});


// When user switches to a different week/day, which changes the tab's url
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url && tab.url.startsWith("https://calendar.google.com/calendar/")) {
        chrome.storage.sync.get(["isExtensionActive", "selectedCalendarId"], (data) => {
            if (isExtensionActive && selectedCalendarId) {
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    chrome.tabs.sendMessage(tabs[0].id, { action: "deselectAllEvents", newSelectedCalendarId: data.selectedCalendarId })
                });
            }
        });
    }
});


function checkAndInjectContentScript(tabId) {
    return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, { action: "isContentScriptRunning"}, (response) => {
            if (chrome.runtime.lastError || !response || !response.running) {
                chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    files: ["content.js"]
                }, () => {
                    if (chrome.runtime.lastError) {
                        console.error("Failed to inject content script:", chrome.runtime.lastError);
                        reject(chrome.runtime.lastError);
                    } else {
                        console.log("Content script injected successfully.");
                        resolve();
                    }
                });
            } else {
                console.log("Content script is already running.");
                resolve();
            }
        })
    })
}


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
        let badgeText = isExtensionActive ? "ON" : "OFF";        
        chrome.action.setBadgeText({ text: badgeText });
        chrome.storage.sync.set({ isExtensionActive });
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0].url.includes("calendar.google.com")) {
                checkAndInjectContentScript(tabs[0].id).then(() => {
                    chrome.tabs.sendMessage(tabs[0].id, { action: "toggleExtensionState", active: isExtensionActive });
                });
            }
        });
    }

    if (request.action === "updateSelectedCalendarId") {
        const newSelectedCalendarId = request.selectedCalendarId;
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0].url.includes("calendar.google.com")) {
                chrome.tabs.sendMessage(tabs[0].id, { action: "updateSelectedCalendarId", newSelectedCalendarId });
            }
        });
        // const listener = (contentRequest) => {
        //     if (contentRequest.action === "deselectedAllEvents") {
        //         selectedCalendarId = contentRequest.selectedCalendarId;
        //         chrome.runtime.onMessage.removeListener(listener);
        //     }
        // };
        // chrome.runtime.onMessage.addListener(listener);
        return true;
    }

    if (request.action === "deselectedAllEvents") {
        selectedCalendarId = request.selectedCalendarId;
        return true;
    }

    if (request.action === "getEventsList") {
        const { timeMin, timeMax } = request;
        getAuthToken().then((token) => {
            const url = `https://www.googleapis.com/calendar/v3/calendars/${selectedCalendarId}/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime`;
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
            const url = `https://www.googleapis.com/calendar/v3/calendars/${selectedCalendarId}/events/${eventId}`;
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
            const url = `https://www.googleapis.com/calendar/v3/calendars/${selectedCalendarId}/events/${eventId}`;
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
            const url = `https://www.googleapis.com/calendar/v3/calendars/${selectedCalendarId}/events/${eventId}`;
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

    if (request.action === "deleteRecurringEventInstance") {
        const instanceId = request.instanceId;
        getAuthToken().then((token) => {
            const url = `https://www.googleapis.com/calendar/v3/calendars/${selectedCalendarId}/events/${instanceId}`;
            const eventPatch = {
                status: "cancelled"
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
                console.error("Error cancelling event:", error);
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


function handleSwitchToCalendarTab(tabId, url) {
    if (url.includes("calendar.google.com")) {
        chrome.storage.sync.get(["isExtensionActive", "selectedCalendarId"], (data) => {
            const { isExtensionActive = false, selectedCalendarId = "" } = data;
            checkAndInjectContentScript(tabId).then(() => {
                chrome.tabs.sendMessage(tabId, { action: "toggleExtensionState", active: isExtensionActive });
                chrome.tabs.sendMessage(tabId, { action: "updateSelectedCalendarId", newSelectedCalendarId: selectedCalendarId });
            }).catch((error) => console.error("Failed to inject content script:", error));
        });
    }
}


chrome.tabs.onActivated.addListener((activeInfo) => {
    chrome.tabs.get(activeInfo.tabId, (tab) => {
        if (tab.url) {
            handleSwitchToCalendarTab(tab.id, tab.url);
        }
    });
});

// Listener for tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === "complete" && tab.url) {
        handleSwitchToCalendarTab(tabId, tab.url);
    }
});
