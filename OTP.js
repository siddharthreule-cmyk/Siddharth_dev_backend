const crypto = require('crypto');

// Temporary storage for testing (use a database later)
const otpStorage = new Map(); 

// Simple helper to check valid structure and block fake domains
function isRealEmail(email) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!regex.test(email)) return false;
    
    const domain = email.split('@')[1].toLowerCase();
    const fakeDomains = ['test.com', 'fake.com', 'abc.com', 'temp.com', 'asdf.com'];
    return !fakeDomains.includes(domain);
}

app.post('/api/send-otp', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });

    if (!isRealEmail(email)) {
        return res.status(400).json({ error: "That email address looks fake or invalid. Please use a real email." });
    }

    // Generate a 6-digit OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    
    // Save it temporarily
    otpStorage.set(email.toLowerCase(), otp);

    try {
        const mailOptions = {
            from: '"Swapify Support" <swapifysupport@gmail.com>',
            to: email,
            subject: 'Your Swapify Verification Code',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #1e293b;">
                    <h2 style="color: #1e3a8a;">Swapify Verification</h2>
                    <p>Your verification code is:</p>
                    <h1 style="background: #f1f5f9; padding: 10px 20px; display: inline-block; letter-spacing: 5px; color: #3b82f6;">${otp}</h1>
                    <p>This code will let you complete your registration.</p>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        res.json({ success: true, message: "OTP sent successfully!" });
    } catch (error) {
        console.error("Email send error:", error);
        // If Gmail SMTP rejects the address because the inbox doesn't exist
        res.status(400).json({ error: "This email address does not exist or cannot receive mail." });
    }
});