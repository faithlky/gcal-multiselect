(function() {
    let isExtensionActive = false;
    let listenersAdded = false;
    let selectedEvents = [];
    let initialEventTimes = {};
    let observer = null;
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
  

    function addEventListeners() {
        if (!listenersAdded) {
            document.addEventListener("mousedown", handleMouseDown);
            // document.addEventListener("mouseup", handleMouseUp);
            listenersAdded = true;
            console.log('Event listeners added'); // Debugging statement
        }
    }


    function removeEventListeners() {
        if (listenersAdded) {
            document.removeEventListener("mousedown", handleMouseDown);
            // document.removeEventListener("mouseup", handleMouseUp);
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


    // function handleMouseUp(e) {
    //     console.log("MOUSE UP EVENT DETECTED."); // Debugging statement

    //     if (!isExtensionActive || selectedEvents.length === 0) return;
    //     const eventElement = e.target.closest("[role='button']");
    //     if (!eventElement) return;

    //     const eventId = fetchEventId(eventElement);
    //     if (!eventId || !initialEventTimes[eventId]) return;

    //     console.log("Fetching event details for mouseUp on event:", eventId); // Debugging statement

    //     let currentStartTime = null;
    //     let initialStartTime = initialEventTimes[eventId].start;

    //     fetchEventDetails(eventId).then(event => {
    //         currentStartTime = new Date(event.start.dateTime);
    //         console.log("Current start time (fetched):", currentStartTime);
    //     })
    //     .then(() => {
    //         console.log("Current start time:", currentStartTime);
    //         console.log("Initial start time:", initialStartTime);

    //         if (currentStartTime.getTime() !== initialStartTime.getTime()) {
    //             const timeDifference = currentStartTime.getTime() - initialStartTime.getTime();
    //             selectedEvents.forEach(({ id }) => {
    //                 if (id !== eventId && initialEventTimes[id]) {
    //                     const initialEventTime = initialEventTimes[id];
    //                     if (!initialEventTime) return;

    //                     const newStartTime = new Date(initialEventTime.start.getTime() + timeDifference);
    //                     const newEndTime = new Date(initialEventTime.end.getTime() + timeDifference);

    //                     updateEvent(id, newStartTime, newEndTime);
    //                 }
    //             });

    //             console.log("Selected events:", selectedEvents);
    //             console.log("Initial event times:", initialEventTimes);
    //         } else {
    //             console.log("No change in event start time detected. Not an event drag operation.");
    //         }
    //     })
    //     .catch(error => {
    //         console.error("Error fetching event details:", error);
    //     });
    // }


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

        console.log("Clicked event:", eventId); // Debugging statement
        
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
        chrome.runtime.sendMessage({
            action: "updateEvent",
            eventId, 
            newStartTime: newStartTime.toISOString(), 
            newEndTime: newEndTime.toISOString()
        }, (response) => {
            if (response.error) {
                console.error('Error updating event:', response.error);
            }
        });
    }


    function observeDOMChanges() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList' || mutation.type === 'attributes') {
                    // Reapply border style to all selected events when GCal rerenders the events after you click them
                    selectedEvents.forEach(({ element }) => {
                        element.style.border = "2px solid black";
                    });

                    // Check if any selected event has been moved
                    selectedEvents.forEach(({ id }) => {
                        const eventId = id;
                        const initialStartTime = initialEventTimes[eventId].start;
                        let currentStartTime = null;

                        fetchEventDetails(eventId)
                        .then(event => {
                            currentStartTime = new Date(event.start.dateTime);
                        })
                        .then(() => {
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
                        })
                        .catch(error => {
                            console.error("Error fetching event details:", error);
                        });
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

})();