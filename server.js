const express = require("express");
const cors = require("cors");
const puppeteer = require("puppeteer");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ==========================================
// DEBUG LOGGER UTILITY
// ==========================================
const DEBUG = {
    log: (step, message, data = null) => {
        const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
        console.log(`[${timestamp}] 🔍 [${step}] ${message}`);
        if (data) console.log(`[${timestamp}] 📊 Data:`, JSON.stringify(data, null, 2));
    },
    success: (step, message) => {
        const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
        console.log(`[${timestamp}] ✅ [${step}] ${message}`);
    },
    error: (step, message, error = null) => {
        const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
        console.log(`[${timestamp}] ❌ [${step}] ${message}`);
        if (error) console.log(`[${timestamp}] 💥 Error Details:`, error.message || error);
    },
    warn: (step, message) => {
        const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
        console.log(`[${timestamp}] ⚠️ [${step}] ${message}`);
    }
};

// ==========================================
// HELPER: Launch browser & setup page
// ==========================================
async function createRobloxSession(cookie) {
    DEBUG.log("SESSION", "Launching browser...");
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-zygote', '--single-process']
    });
    const page = await browser.newPage();
    DEBUG.success("SESSION", "Browser launched successfully");
    
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) req.abort();
        else req.continue();
    });

    DEBUG.log("SESSION", "Setting cookie...");
    await page.setCookie({
        name: ".ROBLOSECURITY",
        value: cookie.replace('.ROBLOSECURITY=', ''),
        domain: ".roblox.com", path: "/", httpOnly: true, secure: true
    });
    DEBUG.success("SESSION", "Cookie set successfully");

    DEBUG.log("SESSION", "Navigating to account info page...");
    await page.goto('https://www.roblox.com/my/account#!/info', { waitUntil: 'networkidle2', timeout: 60000 });
    DEBUG.success("SESSION", "Page loaded successfully");
    
    return { browser, page };
}

// ==========================================
// HELPER: Find and click button by exact text
// ==========================================
async function findAndClickButton(page, buttonText, exactMatch = true, timeout = 10000) {
    DEBUG.log("BUTTON", `Looking for button with text: "${buttonText}" (exact: ${exactMatch})`);
    
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
        const button = await page.evaluateHandle((text, exact) => {
            const elements = Array.from(document.querySelectorAll('button, a, [role="button"], input[type="button"], input[type="submit"]'));
            return elements.find(el => {
                if (el.offsetParent === null) return false;
                const elText = (el.innerText || el.value || el.textContent || '').trim();
                if (exact) return elText === text;
                return elText.toLowerCase().includes(text.toLowerCase());
            });
        }, buttonText, exactMatch);
        
        const exists = await button.asElement();
        if (exists) {
            DEBUG.success("BUTTON", `Found button: "${buttonText}"`);
            await button.click();
            DEBUG.success("BUTTON", `Clicked button: "${buttonText}"`);
            await button.dispose();
            return true;
        }
        await button.dispose();
        await new Promise(r => setTimeout(r, 500));
    }
    
    DEBUG.error("BUTTON", `Button "${buttonText}" not found within ${timeout}ms`);
    return false;
}

// ==========================================
// HELPER: Wait for element by selector
// ==========================================
async function waitForElement(page, selector, timeout = 30000, visible = true) {
    DEBUG.log("ELEMENT", `Waiting for element: ${selector} (timeout: ${timeout}ms)`);
    try {
        const element = await page.waitForSelector(selector, { 
            visible: visible, 
            timeout: timeout 
        });
        DEBUG.success("ELEMENT", `Element found: ${selector}`);
        return element;
    } catch (error) {
        DEBUG.error("ELEMENT", `Element not found: ${selector}`, error);
        return null;
    }
}

// ==========================================
// HELPER: Handle 2-Step Verification
// ==========================================
async function handleTwoStepVerification(page, password) {
    DEBUG.log("2FA", "Starting 2-Step Verification handling...");
    
    // Wait 20-30 seconds for 2FA modal to fully load
    DEBUG.log("2FA", "Waiting 25 seconds for 2FA modal to load...");
    await new Promise(r => setTimeout(r, 25000));
    
    // Check if password input is already visible
    DEBUG.log("2FA", "Checking for password input...");
    const passwordInput = await page.$('input[type="password"]:not([disabled])');
    
    if (passwordInput) {
        DEBUG.success("2FA", "Password input found directly");
        await passwordInput.type(password);
        DEBUG.success("2FA", "Password entered");
        
        // Click Verify button
        const verifyClicked = await findAndClickButton(page, "Verify", true, 5000);
        if (verifyClicked) {
            DEBUG.success("2FA", "Verify button clicked");
            return { success: true, method: "direct_password" };
        }
    }
    
    DEBUG.warn("2FA", "Password input not found directly, checking for alternative methods...");
    
    // Click "Use another verification method"
    const altMethodClicked = await findAndClickButton(page, "Use another verification method", false, 15000);
    if (!altMethodClicked) {
        DEBUG.error("2FA", "Could not find 'Use another verification method' button");
        return { success: false, error: "No alternative verification method option found" };
    }
    
    // Wait for options to appear
    DEBUG.log("2FA", "Waiting for verification options to appear...");
    await new Promise(r => setTimeout(r, 3000));
    
    // Look for Password option
    DEBUG.log("2FA", "Looking for Password option...");
    const passwordOption = await page.evaluateHandle(() => {
        const elements = Array.from(document.querySelectorAll('button, a, [role="button"], div[role="button"]'));
        return elements.find(el => {
            if (el.offsetParent === null) return false;
            const text = (el.innerText || el.textContent || '').trim();
            return text === "Password" && !text.toLowerCase().includes("another");
        });
    });
    
    const passwordExists = await passwordOption.asElement();
    await passwordOption.dispose();
    
    if (!passwordExists) {
        DEBUG.error("2FA", "Password option not found in verification methods");
        return { success: false, error: "No password option" };
    }
    
    DEBUG.success("2FA", "Password option found, clicking...");
    await findAndClickButton(page, "Password", true, 5000);
    
    // Wait for password input to appear
    DEBUG.log("2FA", "Waiting for password input after selecting Password method...");
    await new Promise(r => setTimeout(r, 3000));
    
    const passInput = await waitForElement(page, 'input[type="password"]:not([disabled])', 15000);
    if (!passInput) {
        DEBUG.error("2FA", "Password input not found after selecting Password method");
        return { success: false, error: "Password input not found" };
    }
    
    await passInput.type(password);
    DEBUG.success("2FA", "Password entered");
    
    // Click Verify
    const verifyResult = await findAndClickButton(page, "Verify", true, 5000);
    if (verifyResult) {
        DEBUG.success("2FA", "Verify button clicked successfully");
        return { success: true, method: "alternative_password" };
    }
    
    return { success: false, error: "Failed to click Verify button" };
}

// ==========================================
// SERVICE 1: BIRTHDATE CHANGER
// ==========================================
app.post("/api/update-birthdate", async (req, res) => {
    const { cookie, password } = req.body;
    if (!cookie || !password) {
        DEBUG.error("BIRTHDATE", "Missing cookie or password");
        return res.status(400).json({ success: false, error: "Missing cookie or password" });
    }

    DEBUG.log("BIRTHDATE", "========================================");
    DEBUG.log("BIRTHDATE", "Starting Birthdate Update Service");
    DEBUG.log("BIRTHDATE", "Target: January 1, 2015");
    
    let session;
    try {
        session = await createRobloxSession(cookie);
        const { browser, page } = session;

        // Step 1: Find and click the Birthday edit button
        DEBUG.log("BIRTHDATE", "Step 1: Looking for Birthday edit button...");
        const birthdayEditClicked = await page.evaluate(async () => {
            const findVisibleClickablesByText = (text, exactMatch = true) => 
                Array.from(document.querySelectorAll('button, a, [role="button"], svg')).filter(el => {
                    if (!el.innerText || el.offsetParent === null) return false;
                    return exactMatch ? el.innerText.trim() === text : el.innerText.trim().toLowerCase().includes(text.toLowerCase());
                });
            
            const forceClick = (element) => {
                ['mouseover', 'mousedown', 'mouseup', 'click'].forEach(e => 
                    element.dispatchEvent(new MouseEvent(e, { bubbles: true, cancelable: true, view: window }))
                );
            };

            // Find Birthday label
            const labels = Array.from(document.querySelectorAll('*')).filter(el => 
                el.textContent && el.textContent.trim() === 'Birthday' && el.children.length === 0
            );
            
            if (labels.length > 0) {
                const container = labels[labels.length - 1].closest('[class*="row"], [class*="section"]') || 
                                  labels[labels.length - 1].parentElement.parentElement;
                const editBtn = container.querySelector('button, [role="button"], svg');
                if (editBtn) {
                    forceClick(editBtn.closest('button') || editBtn.closest('[role="button"]') || editBtn);
                    return true;
                }
            }
            return false;
        });
        
        if (!birthdayEditClicked) {
            throw new Error("Could not find Birthday edit button");
        }
        DEBUG.success("BIRTHDATE", "Birthday edit button clicked");
        
        // Step 2: Wait for modal and set birthdate values
        DEBUG.log("BIRTHDATE", "Step 2: Waiting for birthdate modal...");
        await new Promise(r => setTimeout(r, 2000));
        
        DEBUG.log("BIRTHDATE", "Setting birthdate to January 1, 2015...");
        const dateSet = await page.evaluate(() => {
            const selects = Array.from(document.querySelectorAll('select'));
            let month, day, year;
            
            selects.forEach(s => {
                const options = Array.from(s.options).map(o => o.text);
                const optionText = options.join(' ');
                if (options.some(o => o.includes('Jan') || o.includes('Feb'))) month = s;
                if (options.some(o => o === '31') && !optionText.includes('2000')) day = s;
                if (options.some(o => o.includes('2010')) || s.options.length > 50) year = s;
            });

            if (month && day && year) {
                const setVal = (el, val) => {
                    Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set.call(el, val);
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                };
                setVal(month, "1");
                setVal(day, "1");
                setVal(year, "2015");
                return true;
            }
            return false;
        });
        
        if (!dateSet) {
            throw new Error("Could not set birthdate values");
        }
        DEBUG.success("BIRTHDATE", "Birthdate values set: Jan 1, 2015");
        
        // Step 3: Click Continue (first modal)
        DEBUG.log("BIRTHDATE", "Step 3: Clicking Continue on birthdate modal...");
        const firstContinue = await findAndClickButton(page, "Continue", true, 10000);
        if (!firstContinue) {
            throw new Error("Could not click first Continue button");
        }
        DEBUG.success("BIRTHDATE", "First Continue clicked");
        
        // Step 4: Wait for confirmation modal and click Continue
        DEBUG.log("BIRTHDATE", "Step 4: Waiting for confirmation modal...");
        await new Promise(r => setTimeout(r, 3000));
        
        DEBUG.log("BIRTHDATE", "Clicking Continue on confirmation modal...");
        const secondContinue = await findAndClickButton(page, "Continue", true, 15000);
        if (!secondContinue) {
            throw new Error("Could not click second Continue button");
        }
        DEBUG.success("BIRTHDATE", "Second Continue clicked (confirmation)");
        
        // Step 5: Handle 2-Step Verification
        DEBUG.log("BIRTHDATE", "Step 5: Handling 2-Step Verification...");
        const twoFAResult = await handleTwoStepVerification(page, password);
        
        if (!twoFAResult.success) {
            await browser.close();
            DEBUG.error("BIRTHDATE", "2FA failed", twoFAResult.error);
            return res.status(400).json({ success: false, error: twoFAResult.error });
        }
        
        DEBUG.success("BIRTHDATE", "2FA completed successfully");
        
        // Wait for page reload (success indicator)
        DEBUG.log("BIRTHDATE", "Waiting for page reload (success indicator)...");
        await new Promise(r => setTimeout(r, 5000));
        
        await browser.close();
        DEBUG.success("BIRTHDATE", "========================================");
        DEBUG.success("BIRTHDATE", "Birthdate successfully updated to Jan 1, 2015!");
        DEBUG.success("BIRTHDATE", "========================================");
        
        return res.json({ success: true, message: "Birthdate successfully set to Jan 1, 2015!" });

    } catch (error) {
        if (session && session.browser) await session.browser.close();
        DEBUG.error("BIRTHDATE", "Process failed", error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// ==========================================
// SERVICE 2: EMAIL CHANGER
// ==========================================
app.post("/api/update-email", async (req, res) => {
    const { cookie, password, email } = req.body;
    if (!cookie || !password || !email) {
        DEBUG.error("EMAIL", "Missing cookie, password, or email");
        return res.status(400).json({ success: false, error: "Missing cookie, password, or email" });
    }

    DEBUG.log("EMAIL", "========================================");
    DEBUG.log("EMAIL", "Starting Email Update Service");
    DEBUG.log("EMAIL", `Target email: ${email}`);
    
    let session;
    try {
        session = await createRobloxSession(cookie);
        const { browser, page } = session;

        // Step 1: Find and click the Email/Parental Recovery Email edit button
        DEBUG.log("EMAIL", "Step 1: Looking for Email edit button...");
        const emailEditClicked = await page.evaluate(async () => {
            const findVisibleClickablesByText = (text, exactMatch = true) => 
                Array.from(document.querySelectorAll('button, a, [role="button"], svg')).filter(el => {
                    if (!el.innerText || el.offsetParent === null) return false;
                    return exactMatch ? el.innerText.trim() === text : el.innerText.trim().toLowerCase().includes(text.toLowerCase());
                });
            
            const forceClick = (element) => {
                ['mouseover', 'mousedown', 'mouseup', 'click'].forEach(e => 
                    element.dispatchEvent(new MouseEvent(e, { bubbles: true, cancelable: true, view: window }))
                );
            };

            // Look for Email or Parental Recovery Email labels
            const labels = Array.from(document.querySelectorAll('*')).filter(el => {
                if (!el.textContent) return false;
                const txt = el.textContent.trim();
                return (txt === 'Email' || txt === 'Parental Recovery Email') && el.children.length === 0;
            });
            
            if (labels.length > 0) {
                let parent = labels[labels.length - 1].parentElement;
                while (parent && parent !== document.body) {
                    if (parent.textContent.includes('Display Name') || parent.textContent.includes('Username')) break;
                    const clickables = Array.from(parent.querySelectorAll('button, [role="button"], svg')).filter(el => el.offsetParent !== null);
                    if (clickables.length > 0) {
                        const editBtn = clickables[clickables.length - 1];
                        forceClick(editBtn.closest('button') || editBtn.closest('[role="button"]') || editBtn);
                        return true;
                    }
                    parent = parent.parentElement;
                }
            }
            return false;
        });
        
        if (!emailEditClicked) {
            throw new Error("Could not find Email edit button");
        }
        DEBUG.success("EMAIL", "Email edit button clicked");
        
        // Step 2: Wait for modal and enter email
        DEBUG.log("EMAIL", "Step 2: Waiting for email modal...");
        await new Promise(r => setTimeout(r, 2500));
        
        DEBUG.log("EMAIL", `Entering email: ${email}`);
        const emailEntered = await page.evaluate((userEmail) => {
            // Find email input - check multiple possible selectors
            const selectors = [
                'input[type="email"]',
                'input[placeholder*="email" i]',
                'input[placeholder*="Email" i]',
                'input[placeholder*="Parental" i]'
            ];
            
            for (const selector of selectors) {
                const input = document.querySelector(selector);
                if (input && input.offsetParent !== null) {
                    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(input, userEmail);
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    return true;
                }
            }
            return false;
        }, email);
        
        if (!emailEntered) {
            throw new Error("Could not find or fill email input");
        }
        DEBUG.success("EMAIL", "Email entered successfully");
        
        // Step 3: Click Change Email button
        DEBUG.log("EMAIL", "Step 3: Clicking Change Email button...");
        await new Promise(r => setTimeout(r, 1500));
        
        const changeEmailClicked = await findAndClickButton(page, "Change Email", true, 10000);
        if (!changeEmailClicked) {
            throw new Error("Could not click Change Email button");
        }
        DEBUG.success("EMAIL", "Change Email button clicked");
        
        // Step 4: Handle 2-Step Verification
        DEBUG.log("EMAIL", "Step 4: Handling 2-Step Verification...");
        const twoFAResult = await handleTwoStepVerification(page, password);
        
        if (!twoFAResult.success) {
            await browser.close();
            DEBUG.error("EMAIL", "2FA failed", twoFAResult.error);
            return res.status(400).json({ success: false, error: twoFAResult.error });
        }
        
        DEBUG.success("EMAIL", "2FA completed successfully");
        
        // Wait for page reload (success indicator)
        DEBUG.log("EMAIL", "Waiting for page reload (success indicator)...");
        await new Promise(r => setTimeout(r, 5000));
        
        await browser.close();
        DEBUG.success("EMAIL", "========================================");
        DEBUG.success("EMAIL", "Email successfully updated!");
        DEBUG.success("EMAIL", "========================================");
        
        return res.json({ success: true, message: "Email successfully updated!" });

    } catch (error) {
        if (session && session.browser) await session.browser.close();
        DEBUG.error("EMAIL", "Process failed", error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`\n🚀 ========================================`);
    console.log(`🚀 Roblox Account Automation API Server`);
    console.log(`🚀 Running on port ${PORT}`);
    console.log(`🚀 ========================================\n`);
});
