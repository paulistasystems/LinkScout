// LinkScout Content Script
// Extracts actual href links from selected elements

console.log("🔗 LinkScout: Content script loaded!");

// Fixed: Store listener reference for potential cleanup
const messageListener = (message, sender, sendResponse) => {
    console.log("📨 LinkScout content: Received message:", message);

    if (message.action === "getSelectedLinks") {
        const selection = window.getSelection();
        console.log("📝 Selection object:", selection);

        if (!selection || selection.rangeCount === 0) {
            console.log("⚠️ No selection found");
            sendResponse({ links: [], pageTitle: document.title });
            return true;
        }

        const links = new Set();

        // Iterate through ALL selection ranges (supports multiple selections with Ctrl+click)
        console.log("📝 Selection has", selection.rangeCount, "range(s)");

        for (let i = 0; i < selection.rangeCount; i++) {
            const range = selection.getRangeAt(i);
            const container = range.commonAncestorContainer;

            console.log(`📦 Range ${i + 1} container:`, container);

            // Get the element that contains the selection
            const element = container.nodeType === Node.TEXT_NODE
                ? container.parentElement
                : container;

            if (element) {
                // Find all anchor elements within or containing the selection
                const anchors = element.querySelectorAll('a[href]');
                console.log(`🔗 Found anchors in range ${i + 1}:`, anchors.length);

                anchors.forEach(anchor => {
                    // Check if the anchor is within the selection
                    if (selection.containsNode(anchor, true)) {
                        const href = anchor.href;
                        // Fixed: Add null check before startsWith
                        if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
                            links.add(href);
                            console.log("✅ Added link:", href);
                        }
                    }
                });

                // Also check if any parent of the selection container is an anchor
                // Fixed: Add depth limit to prevent infinite loops
                let parent = element;
                let depth = 0;
                const MAX_DEPTH = 50;

                while (parent && parent !== document.body && depth < MAX_DEPTH) {
                    depth++;
                    if (parent.tagName === 'A' && parent.href) {
                        const href = parent.href;
                        // Fixed: Add null check before startsWith
                        if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
                            links.add(href);
                            console.log("✅ Added parent link:", href);
                        }
                    }
                    parent = parent.parentElement;
                }
            }

            // Also try to extract URLs from this range's selected text
            const rangeText = range.toString();
            const urlRegex = /(https?:\/\/[^\s<>"']+)/g;
            const textMatches = rangeText.match(urlRegex);
            if (textMatches) {
                textMatches.forEach(url => {
                    // Clean URL - remove trailing punctuation
                    const cleanUrl = url.replace(/[.,;:!?)]+$/, '');
                    links.add(cleanUrl);
                    console.log("✅ Added text URL:", cleanUrl);
                });
            }
        }

        const result = {
            links: Array.from(links),
            pageTitle: document.title
        };

        console.log("📤 Sending response:", result);
        sendResponse(result);
        return true;
    }

    return false;
};

browser.runtime.onMessage.addListener(messageListener);
