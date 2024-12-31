let selectedCalendarId = "";
let isExtensionActive = false;
let authToken = null;
let previousCalendarUrl = {};

chrome.runtime.onInstalled.addListener(() => {
    chrome.action.setIcon({ path: "/images/icon-16-off.png" });
    chrome.storage.sync.set({ isExtensionActive: false });
    chrome.storage.sync.get("selectedCalendarId", (data) => {
        selectedCalendarId = data.selectedCalendarId || "";
    });
});

chrome.runtime.onStartup.addListener(() => {
    chrome.storage.sync.get(["isExtensionActive", "selectedCalendarId"], (data) => {
        isExtensionActive = data.isExtensionActive || false;
        let iconPath = isExtensionActive ? "/images/icon-16.png" : "/images/icon-16-off.png";
        chrome.action.setIcon({ path: iconPath });
        selectedCalendarId = data.selectedCalendarId || "";
    });
});

function checkAndInjectContentScript(tabId) {
    return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, { action: "isContentScriptRunning" }, (response) => {
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

// When user switches to a different week/day, which changes the tab's url, or enters GCal from the current tab
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url && tab.url.startsWith("https://calendar.google.com/calendar/")) {
        if (previousCalendarUrl[tabId] !== changeInfo.url) {
            previousCalendarUrl[tabId] = changeInfo.url;
            checkAndInjectContentScript(tabId);
            chrome.tabs.sendMessage(tabId, { action: "deselectAllEvents" });
        }
    }
});

// When user switches from a different tab to the GCal tab
chrome.tabs.onActivated.addListener((activeInfo) => {
    chrome.tabs.get(activeInfo.tabId, (tab) => {
        if (tab.url && tab.url.startsWith("https://calendar.google.com/calendar/")) {
            checkAndInjectContentScript(tab.id);
        }
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
        let iconPath = isExtensionActive ? "/images/icon-16.png" : "/images/icon-16-off.png";
        chrome.action.setIcon({ path: iconPath });
        chrome.storage.sync.set({ isExtensionActive });
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0].url.includes("calendar.google.com")) {
                checkAndInjectContentScript(tabs[0].id).then(() => {
                    chrome.tabs.sendMessage(tabs[0].id, { action: "toggleExtensionState", active: isExtensionActive });
                });
            }
        });
    }

    if (request.action === "selectedCalendarChanged") {
        const newSelectedCalendarId = request.selectedCalendarId;
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0].url.includes("calendar.google.com")) {
                chrome.tabs.sendMessage(tabs[0].id, { action: "updateSelectedCalendarId", newSelectedCalendarId });
            }
        });
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
        handleUpdateEvent(request, sendResponse);
        return true;
    }

    if (request.action === "deleteEvent") {
        handleDeleteEvent(request, sendResponse);
        return true;
    }

    if (request.action === "deleteRecurringEventInstance") {
        handleDeleteRecurringEventInstance(request, sendResponse);
        return true;
    }
});


// updateEvent

function handleUpdateEvent(request, sendResponse) {
    updateEventApiCall(request)
        .then(() => {
            sendResponse({ success: true });
        })
        .catch(error => {
            console.error("Error updating event:", error);
            sendResponse({ error: error.toString() });
        });
    return true;
}

async function updateEventApiCall(request) {
    const { eventId, newStartTime, newEndTime } = request;
    try {
        const token = await getAuthToken();
        const url = `https://www.googleapis.com/calendar/v3/calendars/${selectedCalendarId}/events/${eventId}`;
        const eventPatch = {
            start: {
                dateTime: newStartTime
            },
            end: {
                dateTime: newEndTime
            }
        };
        const response = await fetch(url, {
            method: "PATCH",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(eventPatch)
        });
        if (!response.ok) {
            if (response.status === 403) {
                retry(
                    () => updateEventApiCall(eventId)
                );
            }
        }
        return response;
    }
    catch (error) {
        console.error("Error in updateEventApiCall:", error);
        throw error;
    }
}


// deleteEvent

function handleDeleteEvent(request, sendResponse) {
    const eventId = request.eventId;
    deleteEventApiCall(eventId)
        .then(() => {
            sendResponse({ success: true });
        })
        .catch(error => {
            console.error("Error deleting event:", error);
            sendResponse({ error: error.toString() });
        });
    return true;
}

async function deleteEventApiCall(eventId) {
    try {
        const token = await getAuthToken();
        const url = `https://www.googleapis.com/calendar/v3/calendars/${selectedCalendarId}/events/${eventId}`;
        const response = await fetch(url, {
            method: "DELETE",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        });
        if (!response.ok) {
            if (response.status === 403) {
                retry(
                    () => deleteEventApiCall(eventId)
                );
            }
        }
        return response;
    }
    catch (error) {
        console.error("Error in deleteEventApiCall:", error);
        throw error;
    }
}


// deleteRecurringEventInstance

function handleDeleteRecurringEventInstance(request, sendResponse) {
    const instanceId = request.instanceId;
    deleteRecurringEventInstanceApiCall(instanceId)
    .then(() => {
        sendResponse({ success: true });
    })
    .catch(error => {
        console.error("Error deleting recurring event instance:", error);
        sendResponse({ error: error.toString() });
    });
    return true;
}

async function deleteRecurringEventInstanceApiCall(instanceId) {
    try {
        const token = await getAuthToken();
        const url = `https://www.googleapis.com/calendar/v3/calendars/${selectedCalendarId}/events/${instanceId}`;
        const eventPatch = {
            status: "cancelled"
        };
        const response = await fetch(url, {
            method: "PATCH",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(eventPatch)
        });
        if (!response.ok) {
            if (response.status === 403) {
                retry(
                    () => deleteRecurringEventInstanceApiCall(instanceId)
                );
            }
        }
        return response;
    }
    catch (error) {
        console.error("Error in deleteRecurringEventInstanceApiCall:", error);
        throw error;
    }
}


// Retry with exponential backoff, based on https://bpaulino.com/entries/retrying-api-calls-with-exponential-backoff

function retry(promiseFn) {
    const maxRetries = 4;
    async function retryWithBackoff(retries) {
        try {
            if (retries > 0) {
                const timeToWait = 2 ** retries * 100;
                console.log(`waiting for ${timeToWait}ms...`);
                await waitFor(timeToWait);
            }
            return await promiseFn();
        } catch (error) {
            if (retries < maxRetries) {
                return retryWithBackoff(retries + 1);
            } else {
                console.warn("Max retries reached. Bubbling the error up");
                throw error;
            }
        }
    }
    return retryWithBackoff(0);
}

function waitFor(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
