document.addEventListener("DOMContentLoaded", () => {
    const toggleExtension = document.getElementById("toggleExtension");
    const calendarNameInput = document.getElementById("calendarName");
    const calendarIdInput = document.getElementById("calendarId");
    const addCalendarButton = document.getElementById("addCalendarButton");
    const selectCalendarSelect = document.getElementById("selectCalendarSelect");
    const removeCalendarSelect = document.getElementById("removeCalendarSelect");
    const removeCalendarButton = document.getElementById("removeCalendarButton");

    chrome.storage.sync.get(["isExtensionActive", "selectedCalendarId", "calendars"], (data) => {
        toggleExtension.checked = data.isExtensionActive || false;
        selectCalendarSelect.value = data.selectedCalendarId || "";
        loadCalendars(data.calendars || []);
    });

    toggleExtension.addEventListener("change", () => {
        const isExtensionActive = toggleExtension.checked;
        chrome.storage.sync.set({ isExtensionActive }, () => {
            chrome.runtime.sendMessage({ action: "toggleExtensionState", active: isExtensionActive });
        });
    });

    addCalendarButton.addEventListener("click", () => {
        const calendarName = calendarNameInput.value;
        const calendarId = calendarIdInput.value;
        if (!calendarName) {
            alert("Please enter a calendar name.");
            return;
        }
        if (!calendarId) {
            alert("Please enter a valid calendar ID.");
            return;
        }
        chrome.storage.sync.get("calendars", (data) => {
            const calendars = data.calendars || [];
            calendars.push({ name: calendarName, id: calendarId });
            chrome.storage.sync.set({ calendars }, () => {
                loadCalendars(calendars);
                alert("Calendar added.");
            });
        });
    });

    selectCalendarSelect.addEventListener("change", () => {
        const selectedCalendarId = selectCalendarSelect.value;
        console.log("selectedCalendarId:", selectedCalendarId);
        chrome.storage.sync.set({ selectedCalendarId }, () => {
            chrome.runtime.sendMessage({ action: "selectedCalendarChanged", selectedCalendarId });
        });
    });

    removeCalendarButton.addEventListener("click", () => {
        const calendarIdToRemove = removeCalendarSelect.value;
        if (!calendarIdToRemove) {
            alert("Please select a calendar to remove.");
            return;
        }
        chrome.storage.sync.get(["calendars", "selectedCalendarId"], (data) => {
            let calendars = data.calendars || [];
            calendars = calendars.filter(calendar => calendar.id !== calendarIdToRemove);
            const updatedSelectedCalendarId = (calendarIdToRemove === data.selectedCalendarId) ? null : data.selectedCalendarId;
            chrome.storage.sync.set({ calendars, selectedCalendarId: updatedSelectedCalendarId }, () => {
                loadCalendars(calendars);
                alert("Calendar removed.");
            });
        });
    });

    function loadCalendars(calendars) {
        selectCalendarSelect.innerHTML = '<option disabled selected>Select a calendar</option>';
        removeCalendarSelect.innerHTML = '<option disabled selected>Select calendar to remove</option>';

        if (calendars.length > 0) {
            calendars.forEach((calendar) => {
                const selectOption = document.createElement("option");
                selectOption.value = calendar.id;
                selectOption.innerText = `${calendar.name} (${calendar.id})`;
                selectCalendarSelect.appendChild(selectOption);
                
                const removeOption = document.createElement("option");
                removeOption.value = calendar.id;
                removeOption.innerText = `${calendar.name} (${calendar.id})`;
                removeCalendarSelect.appendChild(removeOption);
            });
        } else {
            selectCalendarSelect.querySelector("option:disabled").innerHTML = "Add a calendar below first";
            removeCalendarSelect.querySelector("option:disabled").innerHTML = "No calendars to remove";
        }

        chrome.storage.sync.get("selectedCalendarId", (data) => {
            if (data.selectedCalendarId) {
                selectCalendarSelect.value = data.selectedCalendarId;
            } else {
                selectCalendarSelect.querySelector("option:disabled").selected = true;
            }
        });
    }
});
