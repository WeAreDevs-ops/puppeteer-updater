const express = require("express");
const cors = require("cors");
const path = require("path");
const { chromium } = require("playwright");
const crypto = require("crypto");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// The Global Memory Bank: Keeps browsers open while waiting for the user
const activeSessions = new Map();

let globalBrowser;
// Launch the main Playwright engine when the server starts
(async () => {
    console.log("⚙️ Booting Playwright Engine...");
    globalBrowser = await chromium.launch({ 
        headless: true,
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage'
        ]
    });
    console.log("✅ Playwright Engine Ready!");
})();

// ==========================================
// ROUTE 1: Start Login (Triggers CAPTCHA)
// ==========================================
app.post("/api/login", async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Missing credentials" });

    const sessionId = crypto.randomUUID();
    console.log(`\n🚀 [SESSION ${sessionId}] Booting isolated context for: ${username}`);

    try {
        // Spin up a brand new, isolated browser window
        const context = await globalBrowser.newContext();
        const page = await context.newPage();
        
        // Save it to memory so it doesn't close!
        activeSessions.set(sessionId, { context, page });

        await page.goto("https://www.roblox.com/Login", { waitUntil: "networkidle" });

        // Setup a listener to catch Roblox's API response
        const loginResponsePromise = page.waitForResponse(response => 
            response.url().includes("auth.roblox.com/v2/login") && response.request().method() === "POST"
        );

        // Inject the exact React script you tested in DevTools!
        await page.evaluate(({ usr, pwd }) => {
            const setReactValue = (el, val) => {
                const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                nativeSetter.call(el, val);
                el.dispatchEvent(new Event("input", { bubbles: true }));
            };

            setReactValue(document.getElementById("login-username"), usr);
            setReactValue(document.getElementById("login-password"), pwd);
            
            setTimeout(() => {
                document.getElementById("login-button").removeAttribute("disabled");
                document.getElementById("login-button").click();
            }, 500);
        }, { usr: username, pwd: password });

        // Wait for Roblox to reply...
        const loginResponse = await loginResponsePromise;
        const responseData = await loginResponse.json();

        // If it throws a challenge, extract it and send it to the frontend
        if (!loginResponse.ok() && loginResponse.headers()['rblx-challenge-type']) {
            console.log(`⚠️ [SESSION ${sessionId}] CAPTCHA Intercepted! Pausing browser...`);
            return res.status(403).json({
                status: "CHALLENGE_REQUIRED",
                type: loginResponse.headers()['rblx-challenge-type'],
                id: loginResponse.headers()['rblx-challenge-id'],
                metadata: loginResponse.headers()['rblx-challenge-metadata'],
                sessionId: sessionId // Send the ID so frontend can resume it later!
            });
        }

        // If no Captcha, grab the cookie immediately!
        const cookies = await context.cookies();
        const robloxCookie = cookies.find(c => c.name === ".ROBLOSECURITY");

        await context.close();
        activeSessions.delete(sessionId);

        if (robloxCookie) {
            console.log(`✅ [SESSION ${sessionId}] Login successful on first try!`);
            return res.json({ success: true, cookie: robloxCookie.value });
        } else {
            return res.status(loginResponse.status()).json(responseData);
        }

    } catch (err) {
        console.error("❌ Server Error:", err);
        return res.status(500).json({ error: "Internal Server Error" });
    }
});

// ==========================================
// ROUTE 2: Resume Login (Injects CAPTCHA Token)
// ==========================================
app.post("/api/submit-captcha", async (req, res) => {
    const { sessionId, captchaToken } = req.body;
    
    // Find the exact paused browser window!
    const session = activeSessions.get(sessionId);
    if (!session) return res.status(400).json({ error: "Session expired or invalid" });

    console.log(`\n🧩 [SESSION ${sessionId}] Injecting solved token into paused browser...`);
    const { context, page } = session;

    try {
        // Setup listener for the FINAL login response
        const finalResponsePromise = page.waitForResponse(response => 
            response.url().includes("auth.roblox.com/v2/login") && response.request().method() === "POST"
        );

        // Fake the Arkose "Solved" message to trigger Roblox's internal React logic
        await page.evaluate((token) => {
            window.postMessage(JSON.stringify({
                eventId: "challenge-complete",
                payload: { sessionToken: token }
            }), "*");
        }, captchaToken);

        const finalResponse = await finalResponsePromise;
        const finalData = await finalResponse.json();

        // Grab the holy grail
        const cookies = await context.cookies();
        const robloxCookie = cookies.find(c => c.name === ".ROBLOSECURITY");

        // Clean up the RAM!
        await context.close();
        activeSessions.delete(sessionId);

        if (robloxCookie) {
            console.log(`✅ [SESSION ${sessionId}] FINAL SUCCESS! Cookie acquired.`);
            return res.json({ success: true, cookie: `.ROBLOSECURITY=${robloxCookie.value}` });
        } else {
            console.log(`❌ [SESSION ${sessionId}] Final login failed.`);
            return res.status(finalResponse.status()).json(finalData);
        }

    } catch (err) {
        await context.close();
        activeSessions.delete(sessionId);
        return res.status(500).json({ error: "Failed to inject token." });
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 API Server running on port ${PORT}`);
});
                              
