# Google Calendar Event Multiselect Mode

## Objective:
This is meant for people who use Google Calendar for time boxing. I would personally use this extension almost every day, because I usually have my whole schedule for the day planned out, but then some delay happens (whoops), so I'd need to shift all the rest of the day's events backwards. In Google Calendar, you have to click, drag and drop each event individually in order to adjust its timing, which I find very tedious to do if there are many events to move.

## How to set up and use this:
NOTE: Please tell me if you want to test this and I'll add your email to the test users :-D
1. Download the gcal-multiselect folder and its contents on your computer. 
2. Replace YOUR_CALENDAR_ID at the top of background.js and content.js with your calendar ID, which can be found from your calendar settings. The calendar ID for your primary calendar is just your gmail address.
3. Go to chrome://extensions/ in Google Chrome and turn on Developer Mode at the top right.
4. Click Load Unpacked and select the gcal-multiselect folder.
5. Go to calendar.google.com and click the extension icon to turn it ON.
6. Use Ctrl+Click to select individual (non "All day") events. If you have a block of back-to-back events you'd like to move, select the first event in the block, then Shift+Click the last event to select all the events in between as well.
7. Move one of the selected events, then press **Ctrl+Enter** to move the rest.

(Please be patient, it takes a while for the selection borders and event changes to appear.)

## Future improvements (maybe):
* Autofill the calendar ID
* Bulk delete events
* It would be really nice if all the selected events would just shift together once one is shifted, without having to press Ctrl+Enter, but unfortunately, it seems like Google Calendar does something when events are dragged & dropped which prevents the dropping of events from registering as mouseups. I'd like to try and find an alternative solution if possible.
* Everything is kind of very slow... 🐌... Gotta try and fix that, though I'm not sure how I might approach this problem, since Google Calendar itself already lags when moving one event.