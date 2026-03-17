const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// Serve the frontend UI
app.use(express.static(path.join(__dirname, "public")));

// ==========================================
// ROBLOX API LOGIN PROXY
// ==========================================
app.post("/api/login", async (req, res) => {
    // We now accept the captchaToken and challengeId from the frontend!
    const { username, password, captchaToken, challengeId } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: "Username and password required" });
    }

    console.log(`\n🚀 [SERVER] Attempting login for: ${username}`);
    const loginUrl = "https://auth.roblox.com/v2/login";
    
    const payload = {
        ctype: "Username",
        cvalue: username,
        password: password
    };

    try {
        // STEP 1: The Dummy Request to get the x-csrf-token
        let initialReq = await fetch(loginUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        let csrfToken = initialReq.headers.get('x-csrf-token');
        
        if (!csrfToken) {
            console.log("❌ [SERVER] Failed to get CSRF token.");
            const errData = await initialReq.json();
            return res.status(initialReq.status).json(errData);
        }

        console.log(`✅ [SERVER] Got CSRF Token: ${csrfToken.substring(0, 10)}...`);

        // 🔥 STEP 1.5: Build the Headers (Injecting the Solved CAPTCHA!)
        const headers = { 
            "Content-Type": "application/json",
            "x-csrf-token": csrfToken 
        };

        // If the frontend sent us a solved token, we inject it into the Roblox headers here
        if (captchaToken && challengeId) {
            console.log("🧩 [SERVER] Attaching Solved CAPTCHA to headers...");
            headers['rblx-challenge-type'] = 'captcha';
            headers['rblx-challenge-id'] = challengeId;
            
            // Roblox expects this exact JSON object encoded in Base64
            const metadataJson = JSON.stringify({
                unifiedCaptchaId: challengeId,
                captchaToken: captchaToken,
                actionType: "Login"
            });
            headers['rblx-challenge-metadata'] = Buffer.from(metadataJson).toString('base64');
        }

        // STEP 2: The Real Request with the token and headers
        const loginReq = await fetch(loginUrl, {
            method: "POST",
            headers: headers,
            body: JSON.stringify(payload)
        });

        const loginData = await loginReq.json();

        // STEP 3: Check if Roblox threw a Challenge (CAPTCHA or 2FA)
        if (!loginReq.ok) {
            console.log("⚠️ [SERVER] Roblox threw a challenge.");
            
            // Extract Roblox's hidden challenge headers
            const challengeType = loginReq.headers.get('rblx-challenge-type');
            const challengeIdResponse = loginReq.headers.get('rblx-challenge-id');
            const challengeMetadata = loginReq.headers.get('rblx-challenge-metadata');

            // If headers exist, forward them directly to the frontend
            if (challengeType) {
                console.log(`🧩 [SERVER] Intercepted ${challengeType} challenge! Forwarding to frontend...`);
                return res.status(403).json({
                    status: "CHALLENGE_REQUIRED",
                    type: challengeType,
                    id: challengeIdResponse,
                    metadata: challengeMetadata, // The Arkose Base64 payload
                    robloxResponse: loginData
                });
            }

            // If it's a standard error (wrong password, etc)
            return res.status(loginReq.status).json(loginData);
        }

        // STEP 4: Success! Extract the .ROBLOSECURITY cookie
        const setCookieHeader = loginReq.headers.get('set-cookie');
        let robloxCookie = null;
        
        if (setCookieHeader) {
            const match = setCookieHeader.match(/\.ROBLOSECURITY=(_\|WARNING:-DO-NOT-SHARE-THIS\.--[^;]+)/);
            if (match) robloxCookie = match[0];
        }

        console.log("✅ [SERVER] Login successful! Cookie extracted.");
        
        return res.json({ 
            success: true, 
            message: "Login successful",
            user: loginData.user,
            cookie: robloxCookie 
        });

    } catch (error) {
        console.error("❌ [SERVER] Internal Error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 API Server running on port ${PORT}`);
    console.log(`📱 Frontend available at http://localhost:${PORT}`);
});
                    
