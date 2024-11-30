(function() {
    let isExtensionActive = false;
    let selectedEvents = [];
    let initialEventTimes = {};
    let listenersAdded = false;
  

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
        if (eventElement) {
            handleEventMove(eventElement);
        }
    }

/* 
ChatGPT prompt:

I am adding selected events into an array and adding their timings into a dictionary.
let selectedEvents = [];
let initialEventTimes = {};

I am adding an event listener for mouseup. 
document.addEventListener("mouseup", handleMouseUp);

function handleMouseUp(e) will check the eventElement's current time
const eventElement = e.target.closest("[role='button']");
and if the current time is in the initialEventTimes dictionary 
and is different from that eventElement's initial time, 
the time difference between its initial time and its current time will be calculated,
and the rest of the events in selectedEvents and their timings in initialEventTimes
will all be updated to reflect the new time difference,
and this update will be saved to the calendar using Google Calendar APIs.
*/

    function toggleSelection(element) {
        const eventId = element.getAttribute("data-eventid");
        console.log("Clicked event:", eventId);
        
        if (!eventId) {
            console.error("No event ID found on the element.");
            return;
        }

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
        }).catch(error => {
            console.error("Error fetching event details:", error);
        });
    }


    function fetchEventDetails(eventId) {
        console.log("Fetching event details for event ID:", eventId); // Debugging statement
        return new Promise((resolve, reject) => {
            chrome.identity.getAuthToken({ interactive: true }, (token) => {
                if (chrome.runtime.lastError) {
                    console.error('Error getting auth token:', chrome.runtime.lastError);
                    reject(chrome.runtime.lastError.message);
                    return;
                }

                console.log('Auth token acquired:', token); // Debugging statement

                const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`;
                console.log('Fetching event details:', url); // Debugging statement

                fetch(url, {
                    method: 'GET',
                    headers: {
                        'Authorization': 'Bearer ' + token,
                        'Content-Type': 'application/json'
                    },
                })
                .then(response => {
                    console.log('Fetch response status:', response.status);
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    return response.json();
                })
                .then(event => {
                    console.log('Event details:', event);
                    // if (!event.start || !event.end) {
                    //     throw new Error('Invalid event data');
                    // }
    
                    // initialEventTimes[eventId] = {
                    //     start: new Date(event.start.dateTime),
                    //     end: new Date(event.end.dateTime),
                    // };
                    // console.log('Fetched event time response:', event);
    
                    resolve(event);
                })
                .catch(error => {
                    console.error('Error fetching event time:', error);
                    reject(error.toString());
                });
            });

            
            // chrome.runtime.sendMessage({ action: 'getEventTime', eventId }, (response) => {
            //     console.log('Response received in content.js:', response);
                
            //     if (chrome.runtime.lastError) {
            //         console.error('Error sending message:', chrome.runtime.lastError);
            //         reject(chrome.runtime.lastError.message);
            //         return;
            //     }
    
            //     if (response.error) {
            //         console.error('Error in getEventTime response:', response.error);
            //         reject(response.error);
            //         return;
            //     }
    
            //     initialEventTimes[eventId] = {
            //         start: new Date(response.start),
            //         end: new Date(response.end),
            //     };
            //     console.log('Fetched event time response:', response);
    
            //     resolve(response);
            //     // resolve();
            // });
        });
    }
    

    function handleEventMove(element) {

    }


    function handleEventDrop(element) {
      const eventId = element.getAttribute('data-eventid');
      if (!eventId || !initialEventTimes[eventId]) return;
  
      fetchEventTime(eventId).then(() => {
        const newEventTime = initialEventTimes[eventId];
        const initialEventTime = initialEventTimes[eventId];
        if (!newEventTime || !initialEventTime) return;
  
        const timeDifference = newEventTime.start - initialEventTime.start;
  
        selectedEvents.forEach(({ id }) => {
          if (id !== eventId) {
            const eventTime = initialEventTimes[id];
            if (!eventTime) return;
            const newStart = new Date(eventTime.start.getTime() + timeDifference);
            const newEnd = new Date(eventTime.end.getTime() + timeDifference);
            updateEvent(id, newStart, newEnd);
          }
        });
  
        // Clear the initial times after the move
        initialEventTimes = {};
      }).catch(error => {
        console.error('Error handling event drop:', error);
      });
    }
  
    function updateEvent(eventId) {
        chrome.identity.getAuthToken({ interactive: true }, (token) => {
            if (chrome.runtime.lastError) {
                console.error('Error getting auth token:', chrome.runtime.lastError);
                return;
            }

            fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': 'Bearer ' + token,
                },
            })
            .then(event => {
                console.log('API Response:', event); // Debugging statement
                if (event.error) {
                    console.error('Error fetching event:', event.error.message);
                    return;
                }
            
                console.log('Event start:', new Date(event.start.dateTime || event.start.date));
                console.log('Event end:', new Date(event.end.dateTime || event.end.date));
            })
            .catch(error => {
                console.error('Error updating event:', error);
            });
        })
    }

})();