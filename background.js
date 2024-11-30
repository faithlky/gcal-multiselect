let accessToken = null;


chrome.runtime.onInstalled.addListener(() => {
    chrome.action.setBadgeText({
        text: "OFF",
    });
});


chrome.identity.getAuthToken({ interactive: true }, (token) => {
    if (chrome.runtime.lastError) {
        console.error('Error getting auth token on install:', chrome.runtime.lastError);
        return;
    }
    console.log('Token acquired on install:', token);
    accessToken = token;
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
            // await chrome.scripting.executeScript({
            //     files: ["content.js"],
            //     target: { tabId: tab.id },
            // });

            chrome.tabs.sendMessage(tab.id, {
                action: "showAlert", 
                message: "Multiselect mode is now active. Use Ctrl+Click or drag to select events."
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


// chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
//     console.log('Message received:', request);

//     if (request.action === 'getEventTime') {
//         const eventId = request.eventId;
//         console.log('Attempting to fetch event time for ID:', eventId);        

//         chrome.identity.getAuthToken({ interactive: true }, (token) => {
//             if (chrome.runtime.lastError) {
//                 console.error('Error getting auth token:', chrome.runtime.lastError);
//                 sendResponse({ error: 'Failed to obtain authentication token' });
//                 return;
//             }

//             console.log('Auth token acquired successfully:', token); // Debugging statement

//             const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`;
//             console.log('Fetching event:', url); // Debugging statement

//             fetch(url, {
//                 method: 'GET',
//                 headers: { 
//                     'Authorization': 'Bearer ' + token,
//                     'Content-Type': 'application/json'
//                 },
//             })
//             .then(response => {
//                 console.log('Fetch response status:', response.status);
//                 if (!response.ok) {
//                     throw new Error(`HTTP error! status: ${response.status}`);
//                 }
//                 return response.json();
//             })
//             .then(event => {
//                 console.log('Event details:', event);
//                 if (!event.start || !event.end) {
//                     throw new Error('Invalid event data');
//                 }
                
//                 sendResponse({
//                     start: event.start.dateTime || event.start.date,
//                     end: event.end.dateTime || event.end.date
//                 });
//             })
//             .catch(error => {
//                 console.error('Error fetching event time:', error);
//                 sendResponse({ error: error.toString() });
//             });

//             return true; // Indicates an async response
//         });

//         return true;
//     }
// });