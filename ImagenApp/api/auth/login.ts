
import { createClient } from "@supabase/supabase-js";

interface User {
  username: string;
  password: string;
  isAdmin: boolean;
  expiresAt?: string;
}

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.KEY || "";

const supabase = createClient<User, any>(SUPABASE_URL, SUPABASE_ANON_KEY);

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json({ error: "Username and password are required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("users_imagen")
      .select("*")
      .eq("username", username)
      .eq("password", password);

    if (error) {
      console.error("Error fetching user:", error);
      return NextResponse.json({ error: "Failed to fetch user" }, { status: 500 });
    }

    if (!data || data.length === 0) {
      // No user found with matching credentials
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 401 }
      );
    }

    const user = data[0];

    if (user.isAdmin) {
      // For simplicity, return a dummy token (in real app use JWT or similar)
      const token = "admin-token";
      return NextResponse.json({ token, expiresAt: user.expiresAt });
    } else {
      if (user.expiresAt) {
        const expiresAtDate = new Date(user.expiresAt);
        const now = new Date();

        if (expiresAtDate > now) {
          // User account is valid and not expired
          return NextResponse.json({ token: "user-token", expiresAt: user.expiresAt });
        } else {
          // User account has expired
          return NextResponse.json(
            { error: "Account expired. Please contact support." },
            { status: 401 }
          );
        }
      } else {
        // No expiresAt field, treat as invalid or expired
        return NextResponse.json(
          { error: "Account expiration date not set. Access denied." },
          { status: 401 }
        );
      }
    }
  } catch (error) {
    console.error("Unexpected error during login:", error);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
