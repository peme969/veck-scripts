// ==UserScript==
// @name         Veck.io Simple Ad Blocker
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Blocks ads and popups on Veck.io
// @author       Dog the GOD
// @match        *://veck.io/*
// @match        *://www.veck.io/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // 1. Add CSS to hide common ad elements immediately
    const style = document.createElement('style');
    style.innerHTML = `
        div[id*="ad"], div[class*="ad"],
        div[id*="banner"], div[class*="banner"],
        div[id*="popup"], div[class*="popup"],
        iframe[src*="ad"],
        .ad-banner, .ads-box, .ad-container,
        #ad-overlay, #advertisement {
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
            height: 0 !important;
            width: 0 !important;
            position: absolute !important;
            left: -9999px !important;
        }
    `;
    document.head.appendChild(style);

    // 2. Function to physically remove ad elements from the page
    function removeAds() {
        // Select all potential ad elements based on common naming patterns
        const potentialAds = document.querySelectorAll('div, iframe, script, ins');

        potentialAds.forEach(el => {
            const id = el.id ? el.id.toLowerCase() : '';
            const className = el.className ? el.className.toLowerCase() : '';

            // If the ID or Class contains ad-related keywords, remove it
            // (Checks for: ad, banner, sponsor, promo, google)
            if (id.includes('ad') || id.includes('banner') || id.includes('sponsor') ||
                className.includes('ad') || className.includes('banner') || className.includes('promo') ||
                el.tagName === 'INS' || (el.tagName === 'IFRAME' && el.src.includes('ad'))) {

                // Safety check: Don't remove if it's the main game container (unlikely, but safe to check)
                if (!id.includes('game') && !id.includes('canvas')) {
                    el.remove();
                }
            }
        });

        // Remove overlays that block clicks (common in io games)
        const overlays = document.querySelectorAll('.overlay, #overlay, .blocker, [style*="z-index"][style*="999"]');
        overlays.forEach(el => {
            // If an overlay contains an ad or video, remove it.
            // We keep it if it contains the "Start Game" button to prevent breaking the site.
            if (!el.textContent.includes("Start") && !el.textContent.includes("Play") && !el.textContent.includes("Menu")) {
                // Check if it looks like an ad overlay (large, transparent, covering screen)
                const rect = el.getBoundingClientRect();
                if (rect.width > 200 && rect.height > 200 && el.style.position === 'fixed') {
                    el.remove();
                }
            }
        });
    }

    // 3. Run the remover immediately, then every 1 second to catch late-loading ads
    removeAds();
    setInterval(removeAds, 1000);

    // 4. Advanced: Watch for changes in the DOM (MutationObserver)
    const observer = new MutationObserver(() => {
        removeAds();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

})();
