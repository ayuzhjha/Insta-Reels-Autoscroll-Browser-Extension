(() => {
    // --- User Settings ---
    let isEnabled = true;
    let scrollDelay = 1000;

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

    // --- the core logic ---

    //reel container 
    const getReelContainer = (video) => {
        let candidate = video.parentElement;
        const viewportHeight = window.innerHeight;
        for (let i = 0; i < 15; i++) {
            if (!candidate) break;
            const rect = candidate.getBoundingClientRect();

            const isViewportHeight = (rect.height > viewportHeight * 0.8) && (rect.height < viewportHeight * 1.5);
            if (isViewportHeight) {
                if (candidate.nextElementSibling || candidate.previousElementSibling) {
                    console.log("caught the container via height hack:", candidate);
                    return candidate;
                }
            }
            candidate = candidate.parentElement;
        }

        const group = video.closest('[role="group"]');
        if (group) {
            console.log("caught container via role='group':", group);
            return group;
        }
        return null; 
    };

    
    const getScrollParent = (node) => {
        if (!node) return null;
        let parent = node.parentElement;
        while (parent) {
            const style = window.getComputedStyle(parent);
            const overflowY = style.overflowY;
            const isScrollable = (overflowY === 'auto' || overflowY === 'scroll') && parent.scrollHeight > parent.clientHeight;
            if (isScrollable) return parent;
            parent = parent.parentElement;
        }
        return document.scrollingElement || document.documentElement;
    };
//nxt slide
    const triggerScroll = () => {
        if (!isEnabled || isScrolling) return;

        console.log("Reel done. Moving on...");
        isScrolling = true;

        let container = getReelContainer(currentVideo);
        if (!container) container = currentVideo;

        const scrollParent = getScrollParent(container);
        console.log("found the scroll boss (parent):", scrollParent);

        let nextReelElement = null;
        let candidate = container;

        if (candidate === currentVideo) {
            const likelyContainer = getReelContainer(currentVideo);
            if (likelyContainer) candidate = likelyContainer;
        }

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
            if (scrollParent && scrollParent !== document.documentElement) {
                const parentRect = scrollParent.getBoundingClientRect();
                const targetRect = nextReelElement.getBoundingClientRect();
                const relativeTop = targetRect.top - parentRect.top;

                console.log(`Yeeting scrollParent by ${relativeTop}px`);
                scrollParent.scrollBy({ top: relativeTop, behavior: 'smooth' });
            } else {
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

        setTimeout(() => {
            isScrolling = false;
        }, 1500);
    };

    const handleTimeUpdate = (e) => {
        if (!isEnabled || isScrolling || userScrolled) return;

        const video = e.target;
        if (!video.duration) return;

        const currentTime = video.currentTime;
        const duration = video.duration;
        if (previousTime > duration * 0.8 && currentTime < 0.5) {
            triggerScroll();
        }
        previousTime = currentTime;
    };

    const attachListener = (video) => {
        if (video.dataset.igAttached) return;
        video.dataset.igAttached = "true";
        console.log("Locked onto new video:", video);
        previousTime = 0;
        video.addEventListener("timeupdate", handleTimeUpdate);
        video.addEventListener("ended", () => {
            triggerScroll();
        });
    };

    const scanForActiveVideo = () => {
        const videos = document.querySelectorAll('video');
        for (const v of videos) {
            if (!v.paused) {
                const rect = v.getBoundingClientRect();
                const viewportCenter = window.innerHeight / 2;
                const videoCenter = rect.top + (rect.height / 2);

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

    const observer = new MutationObserver((mutations) => {
        // running scan whenever dom changes
        scanForActiveVideo();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Manual scroll handling 
    window.addEventListener('scroll', () => {
        if (!isScrolling) {
            userScrolled = true;
            // clear timeout, wait for settle
            clearTimeout(window.scrollTimeout);
            window.scrollTimeout = setTimeout(() => {
                userScrolled = false; // ok they stopped
                scanForActiveVideo(); 
            }, 300);
        }
    }, { passive: true });

    // backup poller just in case
    setInterval(scanForActiveVideo, 1000);
})();
