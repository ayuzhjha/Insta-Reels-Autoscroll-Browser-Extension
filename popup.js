document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('toggle');
    const statusText = document.getElementById('statusText');
    const container = document.querySelector('.container');

    // Update UI Helper
    const updateUI = (isEnabled) => {
        statusText.textContent = isEnabled ? 'Active' : 'Disabled';
        statusText.style.color = isEnabled ? '#333' : '#999';
        if (isEnabled) {
            container.classList.add('active-status');
        } else {
            container.classList.remove('active-status');
        }
    };

    // Load defaults
    chrome.storage.local.get(['enabled'], (result) => {
        const isEnabled = result.enabled !== false;
        toggle.checked = isEnabled;
        updateUI(isEnabled);
    });

    // Save changes
    toggle.addEventListener('change', () => {
        const isEnabled = toggle.checked;
        chrome.storage.local.set({ enabled: isEnabled });
        updateUI(isEnabled);
    });
});
