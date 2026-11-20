import { z } from "zod";

export const USER_ROLES = ["USER", "ADMIN"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const signupSchema = z.object({
  email: z.email("Enter a valid email").trim().toLowerCase(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    // bcrypt only uses the first 72 bytes; reject longer input instead of silently truncating
    .max(72, "Password must be 72 characters or less"),
  name: z.string().trim().min(1, "Name is required").max(50, "Name must be 50 characters or less"),
});

export const loginSchema = z.object({
  email: z.email("Enter a valid email").trim().toLowerCase(),
  password: z.string().min(1, "Password is required"),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

/** The user as the API exposes it. The password hash is NEVER part of this. */
export type User = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
};
