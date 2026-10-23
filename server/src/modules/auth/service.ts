import { prisma } from "../../db/prisma.js";
import { AppError } from "../../middleware/error.js";
import { DUMMY_HASH, hashPassword, verifyPassword } from "./password.js";
import type { GoogleProfile } from "./google.js";
import type { LoginInput, SignupInput } from "./schemas.js";

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

const publicUserSelect = {
  id: true,
  email: true,
  name: true,
  avatarUrl: true,
} as const;

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    err.code === "P2002"
  );
}

export async function signup({
  email,
  name,
  password,
}: SignupInput): Promise<PublicUser> {
  const passwordHash = await hashPassword(password);
  try {
    return await prisma.user.create({
      data: { email, name, passwordHash },
      select: publicUserSelect,
    });
  } catch (err) {
    if (isUniqueViolation(err))
      throw new AppError(
        409,
        "EMAIL_TAKEN",
        "An account with this email already exists",
      );
    throw err;
  }
}

export async function login({
  email,
  password,
}: LoginInput): Promise<PublicUser> {
  const user = await prisma.user.findUnique({ where: { email } });
  // Google-only accounts have no password hash; treat them like unknown emails.
  const valid = await verifyPassword(
    user?.passwordHash ?? DUMMY_HASH,
    password,
  );
  if (!user || !user.passwordHash || !valid) {
    throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  }
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
  };
}

export function getUserById(id: string): Promise<PublicUser | null> {
  return prisma.user.findUnique({ where: { id }, select: publicUserSelect });
}

// Google sign-in. Never links to an existing password account: email signup is
// unverified, so linking would let someone pre-register a victim's email.
export async function findOrCreateGoogleUser(
  profile: GoogleProfile,
): Promise<PublicUser> {
  if (!profile.emailVerified) {
    throw new AppError(
      403,
      "EMAIL_UNVERIFIED",
      "Your Google email address is not verified",
    );
  }
  const email = profile.email.trim().toLowerCase();

  const find = () =>
    prisma.authAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider: "google",
          providerAccountId: profile.sub,
        },
      },
      select: { user: { select: publicUserSelect } },
    });

  const existing = await find();
  if (existing) return existing.user;

  if (
    await prisma.user.findUnique({ where: { email }, select: { id: true } })
  ) {
    throw new AppError(
      409,
      "ACCOUNT_EXISTS",
      "An account with this email already exists. Log in with your password.",
    );
  }

  try {
    return await prisma.user.create({
      data: {
        email,
        name: profile.name,
        avatarUrl: profile.picture,
        authAccounts: {
          create: { provider: "google", providerAccountId: profile.sub },
        },
      },
      select: publicUserSelect,
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    // Lost a race with a concurrent callback for the same Google account.
    const raced = await find();
    if (raced) return raced.user;
    throw new AppError(
      409,
      "ACCOUNT_EXISTS",
      "An account with this email already exists. Log in with your password.",
    );
  }
}
