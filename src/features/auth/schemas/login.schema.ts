import { z } from 'zod';

/**
 * The zod messages are message KEYS under the `auth` namespace, not text (FE-08): this module
 * stays free of React and of any locale, and the form maps `fieldState.error.message` through
 * `t(...)` before rendering.
 */
export const LOGIN_MESSAGE_KEYS = {
  email: 'enter_valid_email',
  password: 'enter_password',
} as const;

// Mirrors erp-api's loginRequestSchema (src/v1/auth/dto/auth.dto.ts); moves to @erp/contracts (ADR-0010).
export const loginSchema = z.object({
  email: z.email(LOGIN_MESSAGE_KEYS.email),
  password: z.string().min(1, LOGIN_MESSAGE_KEYS.password),
});

export type LoginInput = z.infer<typeof loginSchema>;
