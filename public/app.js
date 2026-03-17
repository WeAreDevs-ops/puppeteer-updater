document.getElementById('login-btn').addEventListener('click', async () => {
    const userInp = document.getElementById('username').value;
    const passInp = document.getElementById('password').value;
    const btn = document.getElementById('login-btn');
    const logs = document.getElementById('log-container');
    const captchaContainer = document.getElementById('captcha-container');

    if (!userInp || !passInp) return alert("Please enter both username and password!");

    // UI Reset
    btn.disabled = true;
    btn.innerText = "Connecting to API...";
    logs.style.display = "block";
    logs.innerHTML = `<span style="color:#aaa;">Sending credentials to proxy server...</span>\n`;
    captchaContainer.innerHTML = ""; // Clear old captchas

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: userInp, password: passInp })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            logs.innerHTML += `<span class="success">✅ SUCCESS! Cookie Acquired:</span>\n`;
            logs.innerHTML += JSON.stringify(data, null, 2);
            btn.innerText = "Logged In!";
            
        } else if (data.status === "CHALLENGE_REQUIRED") {
            logs.innerHTML += `<span class="warning">⚠️ CAPTCHA Triggered! Rendering puzzle...</span>\n`;

            try {
                // 1. Decode the Base64 Metadata to get the Arkose Blob
                const decodedString = atob(data.metadata);
                const metadataJson = JSON.parse(decodedString);
                const dataExchangeBlob = metadataJson.dataExchangeBlob;

                // 2. Setup the Arkose (Funcaptcha) Configuration
                window.setupArkose = function(enforcement) {
                    enforcement.setConfig({
                        selector: '#captcha-container',
                        data: { blob: dataExchangeBlob },
                        onCompleted: async function(arkoseResponse) {
                            // 🔥 THE NEW AUTO-SUBMIT LOGIC 🔥
                            logs.innerHTML += `\n<span class="success">✅ CAPTCHA Solved! Token Acquired.</span>\n`;
                            btn.innerText = "Finalizing Login...";

                            try {
                                const finalResponse = await fetch('/api/login', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ 
                                        username: userInp, 
                                        password: passInp,
                                        captchaToken: arkoseResponse.token, // The solved puzzle token!
                                        challengeId: data.id                // The ID Roblox gave us earlier!
                                    })
                                });

                                const finalData = await finalResponse.json();

                                if (finalResponse.ok && finalData.success) {
                                    logs.innerHTML += `\n<span class="success">🎉 FINAL SUCCESS! Cookie Acquired:</span>\n`;
                                    logs.innerHTML += `<span style="color:#3498db;">${finalData.cookie.substring(0, 100)}...</span>\n`;
                                    btn.innerText = "Logged In!";
                                } else {
                                    logs.innerHTML += `\n<span class="error">❌ FINAL LOGIN ERROR:</span>\n`;
                                    logs.innerHTML += JSON.stringify(finalData, null, 2);
                                    btn.innerText = "Login Failed";
                                }
                            } catch (finalErr) {
                                logs.innerHTML += `<span class="error">❌ FINAL NETWORK ERROR: ${finalErr.message}</span>`;
                                btn.innerText = "Login Failed";
                            }
                        },
                        onReady: function() {
                            // Force the puzzle to display
                            enforcement.run(); 
                            logs.innerHTML += `<span style="color:#aaa;">Puzzle loaded on screen.</span>\n`;
                        }
                    });
                };

                // 3. Inject Roblox's Official Arkose Script
                const script = document.createElement('script');
                // This is Roblox's official Arkose Public Key for Web Login
                script.src = "https://roblox-api.arkoselabs.com/v2/476068BF-9607-4799-B53D-966BE98E2B81/api.js";
                script.setAttribute('data-callback', 'setupArkose');
                document.body.appendChild(script);

            } catch (decodeErr) {
                logs.innerHTML += `<span class="error">❌ Failed to decode CAPTCHA data: ${decodeErr.message}</span>\n`;
            }

        } else {
            // Standard errors (like wrong password)
            logs.innerHTML += `<span class="error">❌ API ERROR:</span>\n`;
            logs.innerHTML += JSON.stringify(data, null, 2);
            btn.disabled = false;
            btn.innerText = "Secure Login";
        }

    } catch (err) {
        logs.innerHTML += `<span class="error">❌ NETWORK ERROR: ${err.message}</span>`;
        btn.disabled = false;
        btn.innerText = "Secure Login";
    }
});
                                        
