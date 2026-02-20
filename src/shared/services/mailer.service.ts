import { env } from '../../env';
import { transporter } from '../configs/mailer.config';

export const sendVerificationMail = async (name: string, email: string, token: string) => {
    const verificationUrl = `${env.ORIGIN}/verify-email?token=${token}`;

    transporter.sendMail({
        from: '"Duckflix" <no-reply@duckflix.fun>',
        to: email,
        subject: 'Confirm your duckflix account',
        text: `Hello, please confirm your account on this link: ${verificationUrl}`,
        html: `
            <div style="font-family: 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f9f8ff; padding: 40px 20px;">
                <div style="max-width: 500px; margin: 0 auto; background-color: #fff; border-radius: 16px; padding: 40px;">
                    
                    <div style="margin-bottom: 48px; text-align: center;">
                        <span style="font-size: 32px; font-weight: 800; letter-spacing: -0.5px; color: #7f9ae9;">
                            Duckflix
                        </span>
                    </div>

                    <h2 style="color: #0e101b; font-size: 20px; font-weight: 600; margin-bottom: 20px;">Confirm your email</h2>
                    <p style="font-size: 16px; line-height: 1.5; color: #959ca3; margin-bottom: 36px;">
                        Hello ${name}, we're excited to have you! Click the button below to verify your account and dive into our library.
                    </p>

                    <div style="margin-bottom: 36px; text-align: center;">
                        <a href="${verificationUrl}" 
                           style="background-color: #7f9ae9; color: #fff; padding: 14px 28px; text-decoration: none; font-weight: 700; border-radius: 8px; display: inline-block; font-size: 16px; transition: all 0.2s;">
                           Verify Account
                        </a>
                    </div>

                    <p style="font-size: 13px; color: #959ca3; margin: 0; padding-top: 25px; border-top: 1px solid #eee;">
                        If you didn't create a Duckflix account, you can safely ignore this email.
                    </p>
                </div>

                <div style="margin-top: 25px; font-size: 12px; color: #959ca3; letter-spacing: 0.5px; text-align: center;">&copy; 2026 duckflix.fun</div>
            </div>
            `,
    });
};
