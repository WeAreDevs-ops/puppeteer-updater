const express = require("express");
const cors = require("cors");
const path = require("path");
const { chromium } = require("playwright");
const crypto = require("crypto");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const activeSessions = new Map();

let globalBrowser;
(async () => {
    console.log("⚙️ Booting Playwright Engine...");
    globalBrowser = await chromium.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
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
        const context = await globalBrowser.newContext();
        const page = await context.newPage();
        
        // 🔥 FIX: We now save the username and password in RAM so we can re-type them later!
        activeSessions.set(sessionId, { context, page, username, password });

        await page.goto("https://www.roblox.com/Login", { waitUntil: "networkidle" });

        const loginResponsePromise = page.waitForResponse(response => 
            response.url().includes("auth.roblox.com/v2/login") && response.request().method() === "POST"
        );

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

        const loginResponse = await loginResponsePromise;
        const responseData = await loginResponse.json();

        if (!loginResponse.ok() && loginResponse.headers()['rblx-challenge-type']) {
            console.log(`⚠️ [SESSION ${sessionId}] CAPTCHA Intercepted! Pausing browser...`);
            return res.status(403).json({
                status: "CHALLENGE_REQUIRED",
                type: loginResponse.headers()['rblx-challenge-type'],
                id: loginResponse.headers()['rblx-challenge-id'],
                metadata: loginResponse.headers()['rblx-challenge-metadata'],
                sessionId: sessionId 
            });
        }

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
// ROUTE 2: Resume Login (Network Interception)
// ==========================================
app.post("/api/submit-captcha", async (req, res) => {
    const { sessionId, captchaToken, challengeId } = req.body;
    
    const session = activeSessions.get(sessionId);
    if (!session) return res.status(400).json({ error: "Session expired or invalid" });

    console.log(`\n🧩 [SESSION ${sessionId}] Injecting token via Network Interception...`);
    
    // 🔥 FIX: Pull the saved credentials back out of RAM!
    const { context, page, username, password } = session;

    try {
        await page.route("**/v2/login", async (route) => {
            const headers = route.request().headers();
            const metadataJson = JSON.stringify({
                unifiedCaptchaId: challengeId,
                captchaToken: captchaToken,
                actionType: "Login"
            });
            
            headers['rblx-challenge-type'] = 'captcha';
            headers['rblx-challenge-id'] = challengeId;
            headers['rblx-challenge-metadata'] = Buffer.from(metadataJson).toString('base64');

            console.log(`🚀 [SESSION ${sessionId}] Headers injected! Forwarding to Roblox...`);
            await route.continue({ headers });
        });

        const finalResponsePromise = page.waitForResponse(response => 
            response.url().includes("auth.roblox.com/v2/login") && response.request().method() === "POST"
        );

        // 🔥 FIX: Re-type the username and password before clicking the button!
        await page.evaluate(({ usr, pwd }) => {
            const setReactValue = (el, val) => {
                if (!el) return;
                const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                nativeSetter.call(el, val);
                el.dispatchEvent(new Event("input", { bubbles: true }));
            };
            
            setReactValue(document.getElementById("login-username"), usr);
            setReactValue(document.getElementById("login-password"), pwd);
            
            setTimeout(() => {
                const btn = document.getElementById("login-button");
                if (btn) {
                    btn.removeAttribute("disabled");
                    btn.click();
                }
            }, 500);
        }, { usr: username, pwd: password });

        const finalResponse = await Promise.race([
            finalResponsePromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error("Roblox API Timeout - React refused to send request")), 15000))
        ]);

        const finalData = await finalResponse.json();
        const cookies = await context.cookies();
        const robloxCookie = cookies.find(c => c.name === ".ROBLOSECURITY");

        await context.close();
        activeSessions.delete(sessionId);

        if (robloxCookie) {
            console.log(`✅ [SESSION ${sessionId}] FINAL SUCCESS! Cookie acquired.`);
            return res.json({ success: true, cookie: `.ROBLOSECURITY=${robloxCookie.value}` });
        } else {
            console.log(`❌ [SESSION ${sessionId}] Final login failed. Roblox replied:`, finalData);
            return res.status(finalResponse.status()).json(finalData);
        }

    } catch (err) {
        console.error(`❌ [SESSION ${sessionId}] Injection Error:`, err.message);
        await context.close();
        activeSessions.delete(sessionId);
        return res.status(500).json({ error: "Failed to inject token: " + err.message });
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 API Server running on port ${PORT}`);
});
                
