(() => {
    // --- User Settings ---
    let isEnabled = true;
    let scrollDelay = 1000;

    // vibe check variables
    let currentVideo = null;
    let previousTime = 0;
    let isScrolling = false;
    let userScrolled = false;

    // pullin settings from local storage
    chrome.storage.local.get(['enabled', 'delay'], (result) => {
        if (result.enabled !== undefined) isEnabled = result.enabled;
        if (result.delay !== undefined) scrollDelay = result.delay;
    });

    // real-time listener incase user toggles switch
    chrome.storage.onChanged.addListener((changes) => {
        if (changes.enabled) isEnabled = changes.enabled.newValue;
        if (changes.delay) scrollDelay = changes.delay.newValue;
    });

    // --- the sauce (core logic) ---

    // 1. Where's the reel container at??
    const getReelContainer = (video) => {
        // ig obfuscates everything so we gotta be sneaky.
        // finding the parent that is fully taking up the screen (100vh check)
        let candidate = video.parentElement;
        const viewportHeight = window.innerHeight;

        // checking up to 15 levels up cuz the dom is deep af
        for (let i = 0; i < 15; i++) {
            if (!candidate) break;
            const rect = candidate.getBoundingClientRect();

            // is this div HUGE? like full screen huge?
            const isViewportHeight = (rect.height > viewportHeight * 0.8) && (rect.height < viewportHeight * 1.5);
            if (isViewportHeight) {
                // double check if it's actually part of a list (has siblings)
                if (candidate.nextElementSibling || candidate.previousElementSibling) {
                    console.log("caught the container via height hack:", candidate);
                    return candidate;
                }
            }
            candidate = candidate.parentElement;
        }

        // fallback to role="group" if height hack fails (acc sometimes this works)
        const group = video.closest('[role="group"]');
        if (group) {
            console.log("caught container via role='group':", group);
            return group;
        }
        return null; // rip nothing found
    };

    // Helper: Find the element that's actually doing the scrolling
    const getScrollParent = (node) => {
        if (!node) return null;
        let parent = node.parentElement;
        while (parent) {
            const style = window.getComputedStyle(parent);
            const overflowY = style.overflowY;
            // looking for overflow-y: scroll or auto
            const isScrollable = (overflowY === 'auto' || overflowY === 'scroll') && parent.scrollHeight > parent.clientHeight;
            if (isScrollable) return parent;
            parent = parent.parentElement;
        }
        // catch-all: just return the doc if no specific parent
        return document.scrollingElement || document.documentElement;
    };

    // 2. Next slide please
    const triggerScroll = () => {
        if (!isEnabled || isScrolling) return;

        console.log("Reel done. Moving on...");
        isScrolling = true;

        let container = getReelContainer(currentVideo);
        // if we couldn't find the container, just use the video itself and pray
        if (!container) container = currentVideo;

        // 1. Find who is controlling the scroll
        const scrollParent = getScrollParent(container);
        console.log("found the scroll boss (parent):", scrollParent);

        // 2. Find the next reel in the dom
        let nextReelElement = null;
        let candidate = container;

        // logic correction for start point
        if (candidate === currentVideo) {
            const likelyContainer = getReelContainer(currentVideo);
            if (likelyContainer) candidate = likelyContainer;
        }

        // looking for the nearest sibling that exists
        for (let i = 0; i < 6; i++) {
            if (!candidate) break;
            if (candidate.nextElementSibling) {
                nextReelElement = candidate.nextElementSibling;
                console.log(`Found next target at level ${i}:`, nextReelElement);
                break;
            }
            candidate = candidate.parentElement;
        }

        if (nextReelElement) {
            // Strategy: Calculate diff and yeet the scroll position manually
            // this bypasses blocking scripts usually
            if (scrollParent && scrollParent !== document.documentElement) {
                const parentRect = scrollParent.getBoundingClientRect();
                const targetRect = nextReelElement.getBoundingClientRect();
                const relativeTop = targetRect.top - parentRect.top;

                console.log(`Yeeting scrollParent by ${relativeTop}px`);
                scrollParent.scrollBy({ top: relativeTop, behavior: 'smooth' });
            } else {
                // fall back to window scroll
                const targetRect = nextReelElement.getBoundingClientRect();
                console.log(`Yeeting Window to: ${window.scrollY + targetRect.top}`);
                window.scrollTo({
                    top: window.scrollY + targetRect.top,
                    behavior: 'smooth'
                });
            }
        } else {
            console.warn("No next sibling found. Forcing blind scroll.");
            // panic mode: just scroll 1vh and hope
            if (scrollParent && scrollParent !== document.documentElement) {
                scrollParent.scrollBy({ top: window.innerHeight, behavior: 'smooth' });
            } else {
                window.scrollBy({ top: window.innerHeight, behavior: 'smooth' });
            }
        }

        // debouncing so we don't double scroll
        setTimeout(() => {
            isScrolling = false;
        }, 1500);
    };

    // 3. Watch for the loop or end
    const handleTimeUpdate = (e) => {
        if (!isEnabled || isScrolling || userScrolled) return;

        const video = e.target;
        if (!video.duration) return;

        const currentTime = video.currentTime;
        const duration = video.duration;

        // Loop Logic: if time jumps from end (>80%) to start (<0.5s)
        // basically if previousTime was near end and curr is near 0
        if (previousTime > duration * 0.8 && currentTime < 0.5) {
            // caught in 4k (it looped)
            triggerScroll();
        }
        previousTime = currentTime;
    };

    const attachListener = (video) => {
        if (video.dataset.igAttached) return;

        // marking it so we don't attach listeners twice
        video.dataset.igAttached = "true";
        console.log("Locked onto new video:", video);

        // reset timer
        previousTime = 0;
        video.addEventListener("timeupdate", handleTimeUpdate);

        // backup: if it actually ends without looping (rare but happens)
        video.addEventListener("ended", () => {
            triggerScroll();
        });
    };

    // 4. Find the active vid (playing + centered)
    const scanForActiveVideo = () => {
        const videos = document.querySelectorAll('video');
        for (const v of videos) {
            if (!v.paused) {
                const rect = v.getBoundingClientRect();
                const viewportCenter = window.innerHeight / 2;
                const videoCenter = rect.top + (rect.height / 2);

                // tolerance check (is it roughly in the middle?)
                if (Math.abs(videoCenter - viewportCenter) < 300) {
                    if (currentVideo !== v) {
                        console.log("New Main Character detected:", v);
                        currentVideo = v;
                        userScrolled = false; // reset lock
                        previousTime = 0;
                        attachListener(v);
                    }
                    return;
                }
            }
        }
    };

    // 5. Observer stuff
    const observer = new MutationObserver((mutations) => {
        // running scan whenever dom changes
        scanForActiveVideo();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Manual scroll handling (User took the wheel)
    window.addEventListener('scroll', () => {
        if (!isScrolling) {
            userScrolled = true;
            // clear timeout, wait for settle
            clearTimeout(window.scrollTimeout);
            window.scrollTimeout = setTimeout(() => {
                userScrolled = false; // ok they stopped
                scanForActiveVideo(); // see where we landed
            }, 300);
        }
    }, { passive: true });

    // backup poller just in case
    setInterval(scanForActiveVideo, 1000);
})();
