"use client";

import { createAuthClient } from "better-auth/react";

// Relative, same-origin requests go through Next's /api rewrite to the Node API.
export const authClient = createAuthClient({ basePath: "/api/auth" });
