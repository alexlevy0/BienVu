import {z} from 'zod';

const email = z.string().trim().toLowerCase().email().max(254);
export const NewPassword = z.string().min(12).max(128);
export const EmailSignUp = z.object({email, password: NewPassword}).strict();
export const EmailSignIn = z.object({email, password: z.string().min(1).max(128)}).strict();
export const EmailRequest = z.object({email}).strict();
export const PasswordReset = z.object({newPassword: NewPassword, token: z.string().min(1).max(256)}).strict();
