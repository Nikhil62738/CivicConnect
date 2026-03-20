const nodemailer = require('nodemailer');
const https = require('https');

/**
 * Universal Mailer Utility
 * Handles Email and SMS OTP dispatch using Brevo, Nodemailer, or Twilio.
 */

// --- 1. CONFIGURATION ---
const BREVO_API_KEY = process.env.BREVO_API_KEY;
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const MAILTRAP_USER = process.env.MAILTRAP_USER;
const MAILTRAP_PASS = process.env.MAILTRAP_PASS;
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE = process.env.TWILIO_PHONE_NUMBER;

// --- 2. TRANSPORTERS ---
let emailTransporter = null;

if (EMAIL_USER && EMAIL_PASS) {
    console.log(`[Mailer] Initializing Secure SMTPS (Port 465) for: ${EMAIL_USER}`);
    emailTransporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: { user: EMAIL_USER, pass: EMAIL_PASS },
        tls: { rejectUnauthorized: false }
    });

    // Verification check on startup
    emailTransporter.verify((error, success) => {
        if (error) {
            console.error(`[Mailer Error] Transporter Failed: ${error.message}`);
        } else {
            console.log(`[Mailer Success] Server is ready to take our messages!`);
        }
    });
}
// Option B: Mailtrap (Secondary Fallback)
else if (MAILTRAP_USER && MAILTRAP_PASS) {
    console.log(`[Mailer] Initializing Mailtrap Transporter`);
    emailTransporter = nodemailer.createTransport({
        host: "sandbox.smtp.mailtrap.io",
        port: 2525,
        auth: { user: MAILTRAP_USER, pass: MAILTRAP_PASS }
    });
} else {
    console.log(`[Mailer] No Email Transporter configured. Using Fallbacks.`);
}

/**
 * Generates a secure 6-digit OTP
 */
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

/**
 * Sends OTP via Email
 */
const sendEmailOTP = async (email, otp, name = "Citizen") => {
    const subject = "Your Secure Access Code - CivicConnect";
    const html = `
        <div style="font-family: sans-serif; max-width: 400px; padding: 20px; border: 1px solid #eee; border-radius: 12px;">
            <h2 style="color: #6366f1; margin-bottom: 8px;">CivicConnect Auth</h2>
            <p style="color: #666; font-size: 14px;">Hello ${name}, use the code below to sign in:</p>
            <div style="background: #f8fafc; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
                <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #1e293b;">${otp}</span>
            </div>
            <p style="color: #999; font-size: 11px;">This code expires in 5 minutes. Do not share it with anyone.</p>
        </div>
    `;

    // --- 1. PRIORITIZE NODEMAILER ---
    if (emailTransporter) {
        try {
            await emailTransporter.sendMail({ from: `"CivicConnect" <${EMAIL_USER || 'no-reply@civic.gov'}>`, to: email, subject, html });
            console.log(`[Email Sent] Nodemailer SUCCESS to: ${email}`);
            return true;
        } catch (e) {
            console.error("[Email Failed] Nodemailer error:", e.message);
        }
    }

    // --- 2. FALLBACK TO BREVO ---
    if (BREVO_API_KEY) {
        const data = JSON.stringify({
            sender: { name: "CivicConnect", email: EMAIL_USER || "no-reply@civic.gov" },
            to: [{ email }],
            subject,
            htmlContent: html
        });
        const options = {
            hostname: 'api.brevo.com',
            port: 443,
            path: '/v3/smtp/email',
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'api-key': BREVO_API_KEY }
        };
        return new Promise((resolve) => {
            const req = https.request(options, (res) => {
                if (res.statusCode >= 300) {
                    let body = '';
                    res.on('data', chunk => body += chunk);
                    res.on('end', () => console.error(`[Brevo Email OTP Failed] Code: ${res.statusCode} | Error: ${body}`));
                }
                resolve(res.statusCode < 300);
            });
            req.on('error', (e) => { console.error("Brevo Email Request Error:", e.message); resolve(false); });
            req.write(data);
            req.end();
        });
    }

    // Mock Fallback
    console.log(`\n📧 [Email Mock] To: ${email} | Code: ${otp}\n`);
    return true;
};

/**
 * Sends OTP via SMS
 */
const sendSmsOTP = async (phone, otp) => {
    const message = `Your CivicConnect access code is ${otp}. Valid for 5 mins.`;

    // Try Brevo SMS
    if (BREVO_API_KEY) {
        const formattedPhone = phone.startsWith('+') ? phone : `+${phone}`;
        const data = JSON.stringify({ recipient: formattedPhone, content: message, type: 'transactional' });
        const options = {
            hostname: 'api.brevo.com',
            port: 443,
            path: '/v3/transactionalSMS/sms',
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'api-key': BREVO_API_KEY }
        };
        return new Promise((resolve) => {
            const req = https.request(options, (res) => {
                if (res.statusCode >= 300) {
                    let body = '';
                    res.on('data', chunk => body += chunk);
                    res.on('end', () => console.error(`[Brevo SMS Failed] Code: ${res.statusCode} | Error: ${body}`));
                }
                resolve(res.statusCode < 300);
            });
            req.on('error', (e) => { console.error("Brevo SMS Request Error:", e.message); resolve(false); });
            req.write(data);
            req.end();
        });
    }

    // Try Twilio
    if (TWILIO_SID && TWILIO_TOKEN) {
        try {
            const twilio = require('twilio')(TWILIO_SID, TWILIO_TOKEN);
            await twilio.messages.create({ body: message, from: TWILIO_PHONE, to: phone });
            return true;
        } catch (e) {
            console.error("Twilio failed:", e.message);
            return false;
        }
    }

    console.log(`\n📱 [SMS Mock] To: ${phone} | Code: ${otp}\n`);
    return true;
};

/**
 * Sends Status Update Notification to Citizen
 */
/**
 * Sends Rich Status Update Notification to Citizen
 */
const sendStatusUpdateEmail = async (email, complaintId, title, newStatus, remarks, userName = "Citizen", reportDate = "Recently", resolvedDate = null) => {
    const isResolved = newStatus === 'Resolved';
    const subject = `${isResolved ? '✅ Resolved' : '🔄 Update'}: ${title} - CivicConnect`;
    
    const html = `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 550px; padding: 0; border: 1px solid #e2e8f0; border-radius: 16px; background: #ffffff; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
            <div style="background: #4f46e5; padding: 30px; text-align: center;">
                <div style="color: #ffffff; font-size: 28px; font-weight: 900; letter-spacing: -1px; margin-bottom: 5px;">CivicConnect</div>
                <div style="color: rgba(255,255,255,0.7); font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px;">Official Municipal Update</div>
            </div>

            <div style="padding: 35px;">
                <p style="color: #1e293b; font-size: 18px; font-weight: 700; margin-top: 0;">Hello ${userName},</p>
                <p style="color: #64748b; font-size: 14px; line-height: 1.6; margin-bottom: 25px;">Great news! Your civic report has reached a new stage in our resolution pipeline. Thank you for enhancing our city's infrastructure.</p>
                
                <div style="background: #f8fafc; border-radius: 14px; padding: 25px; border: 1px solid #f1f5f9; margin-bottom: 25px;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding-bottom: 12px; width: 40%; font-size: 11px; font-weight: 800; color: #94a3b8; text-transform: uppercase;">Issue Title</td>
                            <td style="padding-bottom: 12px; font-size: 14px; font-weight: 700; color: #1e293b;">${title}</td>
                        </tr>
                        <tr>
                            <td style="padding-bottom: 12px; font-size: 11px; font-weight: 800; color: #94a3b8; text-transform: uppercase;">Status</td>
                            <td style="padding-bottom: 12px;">
                                <span style="background: ${isResolved ? '#dcfce7' : '#e0e7ff'}; color: ${isResolved ? '#166534' : '#3730a3'}; font-size: 11px; font-weight: 800; padding: 4px 12px; rounded: 20px; text-transform: uppercase; border-radius: 20px;">${newStatus}</span>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding-bottom: 12px; font-size: 11px; font-weight: 800; color: #94a3b8; text-transform: uppercase;">Reported On</td>
                            <td style="padding-bottom: 12px; font-size: 13px; color: #475569;">${reportDate}</td>
                        </tr>
                        <tr>
                            <td style="padding-bottom: 0px; font-size: 11px; font-weight: 800; color: ${isResolved ? '#10b981' : '#94a3b8'}; text-transform: uppercase;">Resolved On</td>
                            <td style="padding-bottom: 0px; font-size: 13px; font-weight: 700; color: ${isResolved ? '#059669' : '#475569'};">${resolvedDate || '—'}</td>
                        </tr>
                    </table>
                </div>

                ${remarks ? `
                <div style="padding: 20px; border-left: 4px solid #4f46e5; background: #fdfdfd; border-radius: 0 8px 8px 0; margin-bottom: 30px; box-shadow: inset 0 0 10px rgba(0,0,0,0.02);">
                    <p style="margin: 0; font-size: 11px; color: #4f46e5; text-transform: uppercase; font-weight: 800; margin-bottom: 8px;">Official Admin Remarks</p>
                    <p style="margin: 0; font-size: 14px; color: #334155; line-height: 1.5; font-style: italic;">"${remarks}"</p>
                </div>
                ` : ''}

                <div style="text-align: center; border-t: 1px solid #f1f5f9; padding-top: 30px;">
                    <p style="color: #94a3b8; font-size: 12px; font-style: italic; margin-bottom: 0;">Together, we're building a smarter community.</p>
                </div>
            </div>
            
            <div style="background: #f8fafc; padding: 20px; text-align: center; border-t: 1px solid #f1f5f9;">
                <p style="color: #cbd5e1; font-size: 10px; margin: 0; text-transform: uppercase; font-weight: 700;">© 2026 CivicConnect Municipality Services</p>
            </div>
        </div>
    `;

    if (emailTransporter) {
        try {
            await emailTransporter.sendMail({ from: `"CivicConnect" <${EMAIL_USER || 'no-reply@civic.gov'}>`, to: email, subject, html });
            return;
        } catch (e) {
            console.error("Nodemailer status failed:", e.message);
        }
    }

    if (BREVO_API_KEY) {
        const data = JSON.stringify({
            sender: { name: "CivicConnect", email: EMAIL_USER || "no-reply@civic.gov" },
            to: [{ email }],
            subject,
            htmlContent: html
        });
        const options = {
            hostname: 'api.brevo.com',
            port: 443,
            path: '/v3/smtp/email',
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'api-key': BREVO_API_KEY }
        };
        const req = https.request(options, (res) => {
            if (res.statusCode >= 300) {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => console.error(`[Brevo Status Email Failed] Code: ${res.statusCode} | Error: ${body}`));
            }
        });
        req.write(data);
        req.end();
        return;
    }

    console.log(`\n📧 [Email Status Mock] To: ${email} | ID: ${complaintId} | Status: ${newStatus}\n`);
};

/**
 * Sends Rich Complaint Registration Confirmation to Citizen
 */
const sendComplaintRegistrationEmail = async (email, complaintId, title, category, userName = "Citizen", reportDate = "Recently") => {
    const subject = `📥 Complaint Registered: ${complaintId} - CivicConnect`;
    
    const html = `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 550px; padding: 0; border: 1px solid #e2e8f0; border-radius: 16px; background: #ffffff; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
            <div style="background: #4f46e5; padding: 30px; text-align: center;">
                <div style="color: #ffffff; font-size: 28px; font-weight: 900; letter-spacing: -1px; margin-bottom: 5px;">CivicConnect</div>
                <div style="color: rgba(255,255,255,0.7); font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px;">Issue Received & Logged</div>
            </div>

            <div style="padding: 35px;">
                <p style="color: #1e293b; font-size: 18px; font-weight: 700; margin-top: 0;">Hello ${userName},</p>
                <p style="color: #64748b; font-size: 14px; line-height: 1.6; margin-bottom: 25px;">Your civic report has been successfully registered in our central database. Our municipal team has been notified and will prioritize it according to community impact.</p>
                
                <div style="background: #f8fafc; border-radius: 14px; padding: 25px; border: 1px solid #f1f5f9; margin-bottom: 25px;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding-bottom: 12px; width: 40%; font-size: 11px; font-weight: 800; color: #94a3b8; text-transform: uppercase;">Ticket ID</td>
                            <td style="padding-bottom: 12px; font-size: 14px; font-weight: 900; color: #4f46e5;">#${complaintId}</td>
                        </tr>
                        <tr>
                            <td style="padding-bottom: 12px; width: 40%; font-size: 11px; font-weight: 800; color: #94a3b8; text-transform: uppercase;">Issue Title</td>
                            <td style="padding-bottom: 12px; font-size: 14px; font-weight: 700; color: #1e293b;">${title}</td>
                        </tr>
                        <tr>
                            <td style="padding-bottom: 12px; font-size: 11px; font-weight: 800; color: #94a3b8; text-transform: uppercase;">Category</td>
                            <td style="padding-bottom: 12px;">
                                <span style="background: #e0e7ff; color: #3730a3; font-size: 11px; font-weight: 800; padding: 4px 12px; border-radius: 20px; text-transform: uppercase;">${category}</span>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding-bottom: 0px; font-size: 11px; font-weight: 800; color: #94a3b8; text-transform: uppercase;">Logged On</td>
                            <td style="padding-bottom: 0px; font-size: 13px; color: #475569;">${reportDate}</td>
                        </tr>
                    </table>
                </div>

                <div style="padding: 20px; border-left: 4px solid #10b981; background: #fdfdfd; border-radius: 0 8px 8px 0; margin-bottom: 30px;">
                    <p style="margin: 0; font-size: 11px; color: #059669; text-transform: uppercase; font-weight: 800; margin-bottom: 8px;">🚀 Next Steps</p>
                    <ul style="margin: 0; padding-left: 15px; font-size: 13px; color: #334155; line-height: 1.6;">
                        <li>Our system has calculated the initial <b>priority</b>.</li>
                        <li>An Official from the <b>relevant department</b> will verify the location.</li>
                        <li>You will receive an <b>Email & SMS</b> if the status changes.</li>
                    </ul>
                </div>

                <div style="text-align: center; border-t: 1px solid #f1f5f9; padding-top: 30px;">
                    <p style="color: #94a3b8; font-size: 12px; font-style: italic; margin-bottom: 0;">"Small reporting, Big impact." Thank you for caring!</p>
                </div>
            </div>
            
            <div style="background: #f8fafc; padding: 20px; text-align: center; border-t: 1px solid #f1f5f9;">
                <p style="color: #cbd5e1; font-size: 10px; margin: 0; text-transform: uppercase; font-weight: 700;">© 2026 CivicConnect Municipality Services</p>
            </div>
        </div>
    `;

    if (emailTransporter) {
        try {
            await emailTransporter.sendMail({ from: `"CivicConnect" <${EMAIL_USER || 'no-reply@civic.gov'}>`, to: email, subject, html });
            return;
        } catch (e) { console.error("Registration email failed:", e.message); }
    }

    if (BREVO_API_KEY) {
        const data = JSON.stringify({
            sender: { name: "CivicConnect", email: EMAIL_USER || "no-reply@civic.gov" },
            to: [{ email }],
            subject,
            htmlContent: html
        });
        const options = {
            hostname: 'api.brevo.com',
            port: 443,
            path: '/v3/smtp/email',
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'api-key': BREVO_API_KEY }
        };
        const req = https.request(options, (res) => {});
        req.write(data); req.end();
        return;
    }

    console.log(`\n📧 [Registration Mock] To: ${email} | ID: ${complaintId}\n`);
};

module.exports = { generateOTP, sendEmailOTP, sendSmsOTP, sendStatusUpdateEmail, sendComplaintRegistrationEmail };
