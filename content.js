(function() {
    let isExtensionActive = false;
    let listenersAdded = false;
    let selectedEvents = [];
    let initialEventTimes = {};
    const calendarId = "a2eb75b2bf42cbd0d0b3eb1ee00463bd13ae5a1cba129cb7659b6e1b5dcfaf9c@group.calendar.google.com";
  

    chrome.runtime.onMessage.addListener((request) => {
        console.log("Message received in content.js:", request);

        if (request.action === "showAlert") {
            alert(request.message);
        }

        if (request.action === "toggleExtensionState") {
            isExtensionActive = request.active;
            console.log("Extension state updated, active:", isExtensionActive);

            if (isExtensionActive) {
                if (!listenersAdded) {
                    addEventListeners();
                }
            } else {
                removeEventListeners();
                selectedEvents = [];
                initialEventTimes = {};
            }
        }
    });
  

    function addEventListeners() {
        if (!listenersAdded) {
            document.addEventListener("mousedown", handleMouseDown);
            document.addEventListener("mouseup", handleMouseUp);
            listenersAdded = true;
            console.log('Event listeners added'); // Debugging statement
        }
    }


    function removeEventListeners() {
        if (listenersAdded) {
            document.removeEventListener("mousedown", handleMouseDown);
            document.removeEventListener("mouseup", handleMouseUp);
            listenersAdded = false;
            console.log('Event listeners removed'); // Debugging statement
        }
    }


    function handleMouseDown(e) {
        if (!isExtensionActive || !e.ctrlKey) return;
        const eventElement = e.target.closest("[role='button']");
        if (eventElement) {
            toggleSelection(eventElement);
        }
    }


    function handleMouseUp(e) {
        if (!isExtensionActive || selectedEvents.length === 0) return;
        const eventElement = e.target.closest("[role='button']");
        if (!eventElement) return;

        const eventId = fetchEventId(eventElement);
        if (!eventId || !initialEventTimes[eventId]) return;

        fetchEventDetails(eventId).then(event => {
            const currentStartTime = new Date(event.start.dateTime);
            const initialStartTime = initialEventTimes[eventId].start;

            if (currentStartTime.getTime() !== initialStartTime.getTime()) {
                const timeDifference = currentStartTime.getTime() - initialStartTime.getTime();
                selectedEvents.forEach(({ id }) => {
                    if (id !== eventId && initialEventTimes[id]) {
                        const initialEventTime = initialEventTimes[id];
                        if (!initialEventTime) return;

                        const newStartTime = new Date(initialEventTime.start.getTime() + timeDifference);
                        const newEndTime = new Date(initialEventTime.end.getTime() + timeDifference);

                        updateEvent(id, newStartTime, newEndTime);
                    }
                });
            }
        }).catch(error => {
            console.error("Error fetching event details:", error);
        });

        console.log("Selected events:", selectedEvents);
        console.log("Initial event times:", initialEventTimes);
    }


    function fetchEventId(element) {
        let jslog = element.getAttribute("jslog");
        if (!jslog) {
            console.log("No jslog found on the element. Likely a wrong element selected.");
            return;
        }

        let match1 = jslog.match(/1:\["([^"]*)"/);
        let selectedEventCalendarId = match1 ? match1[1] : null;
        if (!selectedEventCalendarId) {
            console.error("No calendar ID found on the element.");
            return;
        }
        if (selectedEventCalendarId !== calendarId) { 
            console.error("Selected event does not belong to the correct calendar.");
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
            console.log('Sending message to background script to fetch event details for ID:', eventId); // Debugging statement
            chrome.runtime.sendMessage({ action: 'getEventDetails', eventId }, (response) => {
                if (response.error) {
                    console.error('Error fetching event details:', response.error);
                    reject(response.error);
                } else {
                    resolve(response.event);
                }
            });
        });
    }


    function toggleSelection(element) {
        let eventId = fetchEventId(element);

        console.log("Clicked event:", eventId);
        
        fetchEventDetails(eventId).then(event => {
            if (!event.start.dateTime) {
                console.log("All-day event detected. Ignoring selection.");
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

            console.log("Selected events:", selectedEvents);
            console.log("Initial event times:", initialEventTimes);

        }).catch(error => {
            console.error("Error fetching event details:", error);
        });
    }
    
    
    function updateEvent(eventId, newStartTime, newEndTime) {

        chrome.identity.getAuthToken({ interactive: true }, (token) => {
            if (chrome.runtime.lastError) {
                console.error('Error getting auth token:', chrome.runtime.lastError);
                return;
            }

            const url = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventId}`;
            const eventPatch = {
                start: {
                    dateTime: newStartTime.toISOString()
                },
                end: {
                    dateTime: newEndTime.toISOString()
                }
            };

            fetch(url, {
                method: 'PATCH',
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(eventPatch)
            })
            .then(response => response.json())
            .then(event => {
                console.log("Event updated:", event);
            })
            .catch(error => {
                console.error("Error updating event:", error);
            });
        });
    }

})();