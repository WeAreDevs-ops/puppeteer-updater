const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, "public")));

app.post("/api/login", async (req, res) => {
    // 🔥 NEW: We now accept the csrfToken from the frontend to keep the session alive!
    const { username, password, captchaToken, challengeId, csrfToken: providedCsrf } = req.body;
    
    // 🔥 NEW: We steal the frontend's exact browser signature to bypass Arkose's check
    const userAgent = req.headers['user-agent'] || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

    console.log(`\n🚀 [SERVER] Attempting login for: ${username}`);
    const loginUrl = "https://auth.roblox.com/v2/login";
    const payload = { ctype: "Username", cvalue: username, password: password };

    try {
        let csrfToken = providedCsrf;

        // Only do the dummy request if we don't already have a saved CSRF token
        if (!csrfToken) {
            let initialReq = await fetch(loginUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json", "User-Agent": userAgent },
                body: JSON.stringify(payload)
            });

            csrfToken = initialReq.headers.get('x-csrf-token');
            if (!csrfToken) {
                console.log("❌ [SERVER] Failed to get CSRF token.");
                return res.status(initialReq.status).json(await initialReq.json());
            }
            console.log(`✅ [SERVER] Got Fresh CSRF Token: ${csrfToken.substring(0, 10)}...`);
        } else {
            console.log(`♻️ [SERVER] Reusing saved CSRF Token: ${csrfToken.substring(0, 10)}...`);
        }

        const headers = { 
            "Content-Type": "application/json",
            "User-Agent": userAgent, // Fool Arkose into thinking this is a real browser
            "x-csrf-token": csrfToken 
        };

        if (captchaToken && challengeId) {
            console.log("🧩 [SERVER] Attaching Solved CAPTCHA to headers...");
            headers['rblx-challenge-type'] = 'captcha';
            headers['rblx-challenge-id'] = challengeId;
            
            const metadataJson = JSON.stringify({
                unifiedCaptchaId: challengeId,
                captchaToken: captchaToken,
                actionType: "Login"
            });
            headers['rblx-challenge-metadata'] = Buffer.from(metadataJson).toString('base64');
        }

        const loginReq = await fetch(loginUrl, {
            method: "POST",
            headers: headers,
            body: JSON.stringify(payload)
        });

        const loginData = await loginReq.json();

        if (!loginReq.ok) {
            const challengeType = loginReq.headers.get('rblx-challenge-type');
            
            if (challengeType) {
                console.log(`⚠️ [SERVER] Intercepted ${challengeType} challenge!`);
                return res.status(403).json({
                    status: "CHALLENGE_REQUIRED",
                    type: challengeType,
                    id: loginReq.headers.get('rblx-challenge-id'),
                    metadata: loginReq.headers.get('rblx-challenge-metadata'),
                    csrfToken: csrfToken, // 🔥 NEW: Send the CSRF token to the frontend so it can save it!
                    robloxResponse: loginData
                });
            }
            return res.status(loginReq.status).json(loginData);
        }

        const setCookieHeader = loginReq.headers.get('set-cookie');
        let robloxCookie = null;
        if (setCookieHeader) {
            const match = setCookieHeader.match(/\.ROBLOSECURITY=(_\|WARNING:-DO-NOT-SHARE-THIS\.--[^;]+)/);
            if (match) robloxCookie = match[0];
        }

        console.log("✅ [SERVER] Login successful! Cookie extracted.");
        return res.json({ success: true, cookie: robloxCookie });

    } catch (error) {
        console.error("❌ [SERVER] Internal Error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 API Server running on port ${PORT}`);
});
        
