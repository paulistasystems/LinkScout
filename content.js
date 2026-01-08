// LinkScout Content Script
// Extracts actual href links from selected elements

console.log("🔗 LinkScout: Content script loaded!");

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
        const range = selection.getRangeAt(0);
        const container = range.commonAncestorContainer;

        console.log("📦 Selection container:", container);

        // Get the element that contains the selection
        const element = container.nodeType === Node.TEXT_NODE
            ? container.parentElement
            : container;

        if (element) {
            // Find all anchor elements within or containing the selection
            const anchors = element.querySelectorAll('a[href]');
            console.log("🔗 Found anchors in container:", anchors.length);

            anchors.forEach(anchor => {
                // Check if the anchor is within the selection
                if (selection.containsNode(anchor, true)) {
                    const href = anchor.href;
                    // Only add http/https links
                    if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
                        links.add(href);
                        console.log("✅ Added link:", href);
                    }
                }
            });

            // Also check if any parent of the selection container is an anchor
            let parent = element;
            while (parent && parent !== document.body) {
                if (parent.tagName === 'A' && parent.href) {
                    const href = parent.href;
                    if (href.startsWith('http://') || href.startsWith('https://')) {
                        links.add(href);
                        console.log("✅ Added parent link:", href);
                    }
                }
                parent = parent.parentElement;
            }
        }

        // Also try to extract URLs from the selected text itself
        const selectedText = selection.toString();
        const urlRegex = /(https?:\/\/[^\s<>"']+)/g;
        const textMatches = selectedText.match(urlRegex);
        if (textMatches) {
            textMatches.forEach(url => {
                // Clean URL - remove trailing punctuation
                const cleanUrl = url.replace(/[.,;:!?)]+$/, '');
                links.add(cleanUrl);
                console.log("✅ Added text URL:", cleanUrl);
            });
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
});
