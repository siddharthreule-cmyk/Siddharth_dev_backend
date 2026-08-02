app.post('/api/verify-otp', (req, res) => {
    const { email, code } = req.body;
    const storedOtp = otpStorage.get(email);

    if (storedOtp && storedOtp === code) {
        otpStorage.delete(email); // Clear it after successful verification
        res.json({ success: true, message: "Email verified successfully!" });
    } else {
        res.status(400).json({ success: false, error: "Invalid or expired verification code." });
    }
});