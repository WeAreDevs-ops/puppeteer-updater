document.getElementById('login-btn').addEventListener('click', async () => {
    const userInp = document.getElementById('username').value;
    const passInp = document.getElementById('password').value;
    const btn = document.getElementById('login-btn');
    const logs = document.getElementById('log-container');
    const captchaContainer = document.getElementById('captcha-container');

    if (!userInp || !passInp) return alert("Please enter both username and password!");

    btn.disabled = true;
    btn.innerText = "Booting isolated browser...";
    logs.style.display = "block";
    logs.innerHTML = `<span style="color:#aaa;">Sending credentials to Hybrid Engine...</span>\n`;
    captchaContainer.innerHTML = ""; 

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: userInp, password: passInp })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            logs.innerHTML += `<span class="success">✅ SUCCESS! Cookie Acquired:</span>\n`;
            logs.innerHTML += `<span style="color:#3498db; word-break: break-all;">${data.cookie.substring(0, 80)}...</span>\n`;
            btn.innerText = "Logged In!";
            
        } else if (data.status === "CHALLENGE_REQUIRED") {
            logs.innerHTML += `<span class="warning">⚠️ CAPTCHA Triggered! Rendering puzzle...</span>\n`;
            
            // Save the sessionId!
            const sessionId = data.sessionId; 

            try {
                const decodedString = atob(data.metadata);
                const metadataJson = JSON.parse(decodedString);
                const dataExchangeBlob = metadataJson.dataExchangeBlob;

                window.setupArkose = function(enforcement) {
                    enforcement.setConfig({
                        selector: '#captcha-container',
                        data: { blob: dataExchangeBlob },
                        onCompleted: async function(arkoseResponse) {
                            logs.innerHTML += `\n<span class="success">✅ CAPTCHA Solved! Token Acquired.</span>\n`;
                            btn.innerText = "Injecting Token into Browser...";

                            try {
                                // 🔥 SEND TO THE NEW INJECTION ROUTE 🔥
                                const finalResponse = await fetch('/api/submit-captcha', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ 
                                        sessionId: sessionId,
                                        captchaToken: arkoseResponse.token
                                    })
                                });

                                const finalData = await finalResponse.json();

                                if (finalResponse.ok && finalData.success) {
                                    logs.innerHTML += `\n<span class="success">🎉 FINAL SUCCESS! Cookie Acquired:</span>\n`;
                                    logs.innerHTML += `<span style="color:#3498db; word-break: break-all;">${finalData.cookie.substring(0, 80)}...</span>\n`;
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
                            enforcement.run(); 
                        }
                    });
                };

                const script = document.createElement('script');
                script.src = "https://roblox-api.arkoselabs.com/v2/476068BF-9607-4799-B53D-966BE98E2B81/api.js";
                script.setAttribute('data-callback', 'setupArkose');
                document.body.appendChild(script);

            } catch (decodeErr) {
                logs.innerHTML += `<span class="error">❌ Failed to decode CAPTCHA data: ${decodeErr.message}</span>\n`;
            }
        } else {
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
