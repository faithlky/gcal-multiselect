let calendarId = "";
let isExtensionActive = false;
let listenersAdded = false;
let selectedEvents = [];
let initialEventTimes = {};
let observer = null;


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

    if (request.action === "showAlert") {
        alert(request.message);
    }

    if (request.action === "updateCalendarId") {
        const deselectPromises = selectedEvents.map(({ element }) => toggleSelection(element));

        Promise.all(deselectPromises).then(() => {
            calendarId = request.calendarId;
        }).catch(error => {
            console.error("Error deselecting events:", error);
        });
    }

    if (request.action === "toggleExtensionState") {
        isExtensionActive = request.active;

        if (isExtensionActive) {
            if (!listenersAdded) {
                addEventListeners();
                observeDOMChanges();
            }
        } else {
            removeEventListeners();
            selectedEvents = [];
            initialEventTimes = {};
            if (observer) {
                observer.disconnect();
                observer = null;
            }
        }
    }
});

    
chrome.storage.sync.get("calendarId", (data) => {
    if (data.calendarId) {
        calendarId = data.calendarId;
    }
});


function addEventListeners() {
    if (!listenersAdded) {
        document.addEventListener("mousedown", handleMouseDown);
        document.addEventListener("keydown", handleKeyDown);
        listenersAdded = true;
    }
}


function removeEventListeners() {
    if (listenersAdded) {
        document.removeEventListener("mousedown", handleMouseDown);
        document.removeEventListener("keydown", handleKeyDown);
        listenersAdded = false;
    }
}


function handleMouseDown(e) {
    if (!isExtensionActive) return;
    if (e.ctrlKey) {
        const eventElement = e.target.closest("[role='button']");
        if (eventElement) {
            toggleSelection(eventElement);
        }
    } else if (e.shiftKey) {
        const eventElement = e.target.closest("[role='button']");
        if (eventElement) {
            toggleSelection(eventElement);

            const sortedInitialEventTimesArray = sortInitialEventTimes();
            if (sortedInitialEventTimesArray.length === 0) {
                return;
            }

            const latestSelectedEvent = sortedInitialEventTimesArray[sortedInitialEventTimesArray.length - 1];
            const latestSelectedEventStartTime = latestSelectedEvent[1].start.toISOString();

            const eventId = fetchEventId(eventElement);
            fetchEventDetails(eventId).then(event => {
                const eventElementStartTime = new Date(event.start.dateTime).toISOString();

                getEventsList(latestSelectedEventStartTime, eventElementStartTime).then(events => {
                    const elements = document.querySelectorAll("[jslog]");

                    events.forEach(event => {                            
                        let eventElement = null;
                        for (const element of elements) {
                            const jslog = element.getAttribute("jslog");
                            if (jslog && jslog.includes(event.id)) {
                                eventElement = element;
                            }
                        }
                        if (eventElement) {
                            const alreadySelected = selectedEvents.some(selectedEvent => selectedEvent.id === event.id);
                            if (!alreadySelected) {
                                toggleSelection(eventElement);
                            }
                        }
                    });
                }).catch(error => {
                    console.error("Error fetching events list:", error);
                });
            }).catch(error => {
                console.error("Error fetching event details:", error);
            });
        }
    }
}


function sortInitialEventTimes() {
    const initialEventTimesArray = Object.entries(initialEventTimes);
    const sortedArray = initialEventTimesArray.sort((a, b) => {
        const startTimeA = a[1].start.getTime();
        const startTimeB = b[1].start.getTime();
        return startTimeA - startTimeB;
    });
    return sortedArray;
}


function getEventsList(timeMin, timeMax) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: "getEventsList", timeMin, timeMax }, (response) => {
            if (response.error) {
                console.error("Error fetching events list:", response.error);
                reject(response.error);
            } else {
                resolve(response.events);
            }
        });
    });
}


function handleKeyDown(e) {
    if (!isExtensionActive || e.key !== "Enter" || !e.ctrlKey || selectedEvents.length === 0) return;

    let differenceCount = 0;
    let differences = [];

    const fetchPromises = [];

    selectedEvents.forEach(({ id }) => {
        const fetchPromise = fetchEventDetails(id)
        .then(event => {
            const initialStartTime = initialEventTimes[id].start;
            const currentStartTime = new Date(event.start.dateTime);
            if (currentStartTime.getTime() !== initialStartTime.getTime()) {
                differenceCount++;
                const timeDifference = currentStartTime.getTime() - initialStartTime.getTime();
                differences.push({ id: id, timeDifference: timeDifference });
            }
        })
        .catch(error => {
            console.error("Error fetching event details:", error);
        });

        fetchPromises.push(fetchPromise);
    });

    Promise.all(fetchPromises).then(() => {
        if (differenceCount === 0) {
            console.log("No events have been moved. Ignoring key press.");
            return;
        } else if (differenceCount === 1) {
            const timeDifference = differences[0].timeDifference;
            selectedEvents.forEach(({ id }) => {
                if (id !== differences[0].id && initialEventTimes[id]) {
                    const initialEventTime = initialEventTimes[id];
                    if (!initialEventTime) return;
    
                    const newStartTime = new Date(initialEventTime.start.getTime() + timeDifference);
                    const newEndTime = new Date(initialEventTime.end.getTime() + timeDifference);
    
                    updateEvent(id, newStartTime, newEndTime);
                } else if (id === differences[0].id && initialEventTimes[id]) {
                    toggleSelection(selectedEvents.find(event => event.id === id).element);
                }
            });
            alert("Events have been moved successfully. Please wait a moment or refresh the page to see the changes reflected in the calendar.");
        } else if (differenceCount > 1) {
            console.log("Multiple events have been moved. Ignoring key press.");
            alert("Multiple events have been moved. Please move only one event at a time.");
            return;
        }
    });

}


function fetchEventId(element) {
    /* Note: This is how to get the event ID from the element! 
    Not the data-eventid attribute, which I was misled by :( 
    The data-eventid attribute is not the event ID, it's from the event's htmlLink */

    let jslog = element.getAttribute("jslog");
    if (!jslog) {
        console.warn("No jslog found on the element. Likely a wrong element selected.");
        return;
    }

    let match1 = jslog.match(/1:\["([^"]*)"/);
    let selectedEventCalendarId = match1 ? match1[1] : null;
    if (!selectedEventCalendarId) {
        console.error("No calendar ID found on the element.");
        return;
    }
    if (selectedEventCalendarId !== calendarId) {
        console.warn("Selected event does not belong to the correct calendar.");
        return;
    }

    let match2 = jslog.match(/2:\["([^"]*)"/);
    let eventId = match2 ? match2[1] : null;
    if (!eventId) {
        console.error("No event ID found on the element.");
        return;
    }

    return eventId;
}


function fetchEventDetails(eventId) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: "getEventDetails", eventId }, (response) => {
            if (response.error) {
                console.error("Error fetching event details:", response.error);
                reject(response.error);
            } else {
                resolve(response.event);
            }
        });
    });
}


function toggleSelection(element) {
    let eventId = fetchEventId(element);
    
    fetchEventDetails(eventId).then(event => {
        if (!event.start.dateTime) {
            console.warn("All-day event detected. Ignoring selection.");
            return;
        }

        const index = selectedEvents.findIndex(event => event.id === eventId);
        if (index === -1) {
            selectedEvents.push({ id: eventId, element });
            element.style.border = "2px solid black";
            
            initialEventTimes[eventId] = {
                start: new Date(event.start.dateTime),
                end: new Date(event.end.dateTime),
            };

        } else {
            selectedEvents.splice(index, 1);
            element.style.border = "";
            delete initialEventTimes[eventId];
        }

    }).catch(error => {
        console.error("Error fetching event details:", error);
    });
}


function updateEvent(eventId, newStartTime, newEndTime) {
    chrome.runtime.sendMessage({
        action: "updateEvent",
        eventId, 
        newStartTime: newStartTime.toISOString(), 
        newEndTime: newEndTime.toISOString()
    }, (response) => {
        if (response.error) {
            console.error("Error updating event:", response.error);
        }
    });
    toggleSelection(selectedEvents.find(event => event.id === eventId).element);
}


function observeDOMChanges() {
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === "childList" || mutation.type === "attributes") {
                // Reapply border style to all selected events when GCal rerenders the events after you click them
                selectedEvents.forEach(({ element }) => {
                    element.style.border = "2px solid black";
                });
            }
        });
    });

    observer.observe(document.body, {
        attributes: true,
        childList: true,
        subtree: true
    });
}