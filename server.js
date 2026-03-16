const express = require("express");
const cors = require("cors");
const puppeteer = require("puppeteer");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// Serve the frontend
app.use(express.static(path.join(__dirname, "public")));

app.post("/api/update-account", async (req, res) => {
    const { cookie, password, email } = req.body;

    if (!cookie || !password || !email) {
        return res.status(400).json({ success: false, error: "Missing cookie, password, or email" });
    }

    console.log("\n=========================================");
    console.log("🚀 STARTING AUTOMATED SEQUENCE...");
    console.log("=========================================");

    let browser;
    try {
        console.log("🌐 Launching headless browser...");
        browser = await puppeteer.launch({
            headless: "new",
            // Optimized for Railway's container limits
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox', 
                '--disable-dev-shm-usage',
                '--disable-gpu', 
                '--no-zygote', 
                '--single-process'
            ]
        });

        const page = await browser.newPage();

        // RAM SAVER: Block heavy assets
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) req.abort();
            else req.continue();
        });

        await page.setCookie({
            name: ".ROBLOSECURITY",
            value: cookie.replace('.ROBLOSECURITY=', ''),
            domain: ".roblox.com", path: "/", httpOnly: true, secure: true
        });

        console.log("🌍 Navigating to Settings page...");
        await page.goto('https://www.roblox.com/my/account#!/info', { waitUntil: 'domcontentloaded' });
        await new Promise(r => setTimeout(r, 2000));

        // ==========================================
        // PHASE 1: CHANGE BIRTHDATE (Jan 1, 2015)
        // ==========================================
        console.log("\n🔹 [PHASE 1] Executing Birthdate Script...");
        let phase1Success = false;

        try {
            await page.evaluate(async (userPassword) => {
                const findVisibleClickablesByText = (text, exactMatch = true) => {
                    const elements = Array.from(document.querySelectorAll('button, a, [role="button"]'));
                    return elements.filter(el => {
                        if (!el.innerText || el.offsetParent === null) return false;
                        const elText = el.innerText.trim().toLowerCase();
                        const targetText = text.toLowerCase();
                        return exactMatch ? elText === targetText : elText.includes(targetText);
                    });
                };
                const forceClick = (element) => ['mouseover', 'mousedown', 'mouseup', 'click'].forEach(e => element.dispatchEvent(new MouseEvent(e, { bubbles: true, cancelable: true, view: window })));

                const labels = Array.from(document.querySelectorAll('*')).filter(el => el.textContent && el.textContent.trim() === 'Birthday' && el.children.length === 0);
                if (labels.length > 0) {
                    const editBtn = (labels[labels.length - 1].closest('[class*="row"], [class*="section"]') || labels[labels.length - 1].parentElement.parentElement).querySelector('button, [role="button"], svg');
                    if (editBtn) forceClick(editBtn.closest('button') || editBtn.closest('[role="button"]') || editBtn);
                }
                await new Promise(r => setTimeout(r, 1000));

                const selects = Array.from(document.querySelectorAll('select'));
                let month, day, year;
                selects.forEach(s => {
                    const txt = Array.from(s.options).map(o => o.text).join(' ');
                    if (txt.includes('Jan') || txt.includes('Feb')) month = s;
                    if (txt.includes('31') && !txt.includes('2000')) day = s;
                    if (txt.includes('2010') || s.options.length > 50) year = s;
                });

                if (month && day && year) {
                    const setVal = (el, val) => { Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set.call(el, val); el.dispatchEvent(new Event('change', { bubbles: true })); };
                    setVal(month, "1"); setVal(day, "1"); setVal(year, "2015");
                    
                    const saveBtns = findVisibleClickablesByText('save');
                    if (saveBtns.length > 0) forceClick(saveBtns[saveBtns.length - 1]);

                    for (let i = 0; i < 40; i++) {
                        const btns = findVisibleClickablesByText('continue');
                        if (btns.length > 0) {
                            forceClick(btns[btns.length - 1]);
                            for (let j = 0; j < 20; j++) { if (btns[btns.length - 1].offsetParent === null) break; await new Promise(r => setTimeout(r, 250)); }
                            break;
                        }
                        await new Promise(r => setTimeout(r, 500));
                    }
                    for (let i = 0; i < 40; i++) {
                        const btns = findVisibleClickablesByText('continue');
                        if (btns.length > 0) { forceClick(btns[btns.length - 1]); break; }
                        await new Promise(r => setTimeout(r, 500));
                    }
                }

                let passInput = null; let anotherMethodBtn = null;
                for (let i = 0; i < 30; i++) { 
                    const passInputs = Array.from(document.querySelectorAll('input[type="password"], input[placeholder*="Password" i]'));
                    passInput = passInputs.find(el => el.offsetParent !== null);
                    if (passInput) break; 
                    const altBtns = findVisibleClickablesByText('use another verification method', false);
                    if (altBtns.length > 0) { anotherMethodBtn = altBtns[altBtns.length - 1]; break; }
                    await new Promise(r => setTimeout(r, 500));
                }

                if (anotherMethodBtn) {
                    forceClick(anotherMethodBtn);
                    let passwordOptionBtn = null;
                    for (let i = 0; i < 20; i++) {
                        const passBtns = findVisibleClickablesByText('password', false).filter(b => !b.innerText.toLowerCase().includes('another'));
                        if (passBtns.length > 0) { passwordOptionBtn = passBtns[passBtns.length - 1]; break; }
                        await new Promise(r => setTimeout(r, 500));
                    }
                    if (passwordOptionBtn) {
                        forceClick(passwordOptionBtn);
                        for (let i = 0; i < 20; i++) {
                            passInput = Array.from(document.querySelectorAll('input[type="password"], input[placeholder*="Password" i]')).find(el => el.offsetParent !== null);
                            if (passInput) break;
                            await new Promise(r => setTimeout(r, 500));
                        }
                    }
                }

                if (passInput) {
                    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(passInput, userPassword);
                    passInput.dispatchEvent(new Event('input', { bubbles: true }));
                    await new Promise(r => setTimeout(r, 500)); 
                    passInput.focus(); 
                    passInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter', keyCode: 13 }));
                    passInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: 'Enter', keyCode: 13 }));
                    return "SUBMITTED";
                }
                throw new Error("Password modal never appeared");
            }, password);
            
            phase1Success = true;

        } catch (error) {
            // Catch the auto-reload trap!
            if (error.message.includes("Execution context was destroyed") || error.message.includes("Target closed")) {
                console.log("✅ [PHASE 1] Auto-reload caught! Birthdate submitted.");
                phase1Success = true;
            } else {
                console.error("❌ Phase 1 Error:", error.message);
            }
        }

        if (!phase1Success) throw new Error("Birthdate automation failed.");

        console.log("⏳ Waiting 5 seconds for page to settle after auto-reload...");
        await new Promise(r => setTimeout(r, 5000));

        // ==========================================
        // PHASE 2: UPDATE EMAIL
        // ==========================================
        console.log("\n🔹 [PHASE 2] Executing Email Update Script...");
        let phase2Success = false;

        try {
            await page.evaluate(async (userEmail, userPassword) => {
                const findVisibleClickablesByText = (text, exactMatch = true) => {
                    const elements = Array.from(document.querySelectorAll('button, a, [role="button"]'));
                    return elements.filter(el => {
                        if (!el.innerText || el.offsetParent === null) return false;
                        const elText = el.innerText.trim().toLowerCase();
                        const targetText = text.toLowerCase();
                        return exactMatch ? elText === targetText : elText.includes(targetText);
                    });
                };
                const forceClick = (element) => ['mouseover', 'mousedown', 'mouseup', 'click'].forEach(e => element.dispatchEvent(new MouseEvent(e, { bubbles: true, cancelable: true, view: window })));

                let editBtn = null;
                const labels = Array.from(document.querySelectorAll('*')).filter(el => el.textContent && el.textContent.trim() === 'Email' && el.children.length === 0);
                if (labels.length > 0) {
                    let parent = labels[labels.length - 1].parentElement;
                    while (parent && parent !== document.body) {
                        if (parent.textContent.includes('Display Name') || parent.textContent.includes('Username')) break;
                        const clickables = Array.from(parent.querySelectorAll('button, [role="button"], svg')).filter(el => el.offsetParent !== null);
                        if (clickables.length > 0) {
                            editBtn = clickables[clickables.length - 1]; 
                            if (editBtn.closest('button')) editBtn = editBtn.closest('button');
                            break;
                        }
                        parent = parent.parentElement;
                    }
                }

                if (editBtn) forceClick(editBtn);
                else throw new Error("Email edit button not found");
                
                await new Promise(r => setTimeout(r, 1500)); 

                let emailInput;
                for (let i = 0; i < 20; i++) {
                    emailInput = document.querySelector('input[placeholder="Enter email"], input[type="email"]');
                    if (emailInput && emailInput.offsetParent !== null) break;
                    await new Promise(r => setTimeout(r, 500));
                }

                if (emailInput) {
                    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(emailInput, userEmail);
                    emailInput.dispatchEvent(new Event('input', { bubbles: true }));
                    emailInput.dispatchEvent(new Event('change', { bubbles: true })); 
                    await new Promise(r => setTimeout(r, 1000)); 

                    let changeBtn;
                    for (let i = 0; i < 10; i++) {
                        const btns = findVisibleClickablesByText('change email');
                        if (btns.length > 0) { changeBtn = btns[btns.length - 1]; break; }
                        await new Promise(r => setTimeout(r, 500));
                    }
                    if (changeBtn) {
                        if (changeBtn.disabled) changeBtn.removeAttribute('disabled');
                        forceClick(changeBtn);
                    }
                }

                await new Promise(r => setTimeout(r, 2000)); 

                let passInput = null; let anotherMethodBtn = null;
                for (let i = 0; i < 30; i++) { 
                    const passInputs = Array.from(document.querySelectorAll('input[type="password"], input[placeholder*="Password" i]'));
                    passInput = passInputs.find(el => el.offsetParent !== null);
                    if (passInput) break; 
                    const altBtns = findVisibleClickablesByText('use another verification method', false);
                    if (altBtns.length > 0) { anotherMethodBtn = altBtns[altBtns.length - 1]; break; }
                    await new Promise(r => setTimeout(r, 500));
                }

                if (anotherMethodBtn) {
                    forceClick(anotherMethodBtn);
                    let passwordOptionBtn = null;
                    for (let i = 0; i < 20; i++) {
                        const passBtns = findVisibleClickablesByText('password', false).filter(b => !b.innerText.toLowerCase().includes('another'));
                        if (passBtns.length > 0) { passwordOptionBtn = passBtns[passBtns.length - 1]; break; }
                        await new Promise(r => setTimeout(r, 500));
                    }
                    if (passwordOptionBtn) {
                        forceClick(passwordOptionBtn);
                        for (let i = 0; i < 20; i++) {
                            passInput = Array.from(document.querySelectorAll('input[type="password"], input[placeholder*="Password" i]')).find(el => el.offsetParent !== null);
                            if (passInput) break;
                            await new Promise(r => setTimeout(r, 500));
                        }
                    }
                }

                if (passInput) {
                    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(passInput, userPassword);
                    passInput.dispatchEvent(new Event('input', { bubbles: true }));
                    await new Promise(r => setTimeout(r, 500)); 
                    passInput.focus(); 
                    passInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter', keyCode: 13 }));
                    passInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: 'Enter', keyCode: 13 }));
                    return "SUBMITTED";
                }
                throw new Error("Password modal never appeared");
            }, email, password);

            phase2Success = true;

        } catch (error) {
            if (error.message.includes("Execution context was destroyed") || error.message.includes("Target closed")) {
                console.log("✅ [PHASE 2] Auto-reload caught! Email submitted.");
                phase2Success = true;
            } else {
                console.error("❌ Phase 2 Error:", error.message);
            }
        }

        if (!phase2Success) throw new Error("Email automation failed.");

        console.log("🎉 ALL PHASES COMPLETE! Closing browser.");
        await browser.close();

        return res.json({ 
            success: true, 
            message: "Birthdate and Email successfully updated!"
        });

    } catch (error) {
        if (browser) await browser.close();
        console.error("💥 Server Error:", error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => console.log(`🚀 Railway Server running on port ${PORT}`));
                
