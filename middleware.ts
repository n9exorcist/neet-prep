import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Routes that must never be reachable on a deployed instance.
 *
 * /admin is the review tool: it has no authentication, and it can rewrite the
 * answer key of any question. /api/page serves whole pages of the source PDFs,
 * including the coaching companies' worked solutions, which CLAUDE.md says we
 * may not republish. /api/figure serves the raw crops off local disk, four of
 * which still show an answer key. All three are fine on localhost and
 * unacceptable in public; student-facing figures come from Supabase Storage.
 *
 * Blocked by NODE_ENV rather than a flag on purpose. An opt-out is how a thing
 * like this ends up switched on in production by accident.
 */
const LOCAL_ONLY = [/^\/admin(\/|$)/, /^\/api\/page(\/|$)/, /^\/api\/figure(\/|$)/];

/** Student areas, which need a signed-in user to be of any use. */
const PROTECTED = [/^\/practice(\/|$)/, /^\/onboarding(\/|$)/];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (process.env.NODE_ENV === "production" && LOCAL_ONLY.some((re) => re.test(pathname))) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Refresh the auth session so server components see a current user.
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return response;

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Touching auth is what performs the refresh.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Student areas require a session. Row level security already prevents an
  // anonymous client from reading anything, so this is about sending people
  // somewhere useful rather than about access control.
  if (!user && PROTECTED.some((re) => re.test(pathname))) {
    const signIn = request.nextUrl.clone();
    signIn.pathname = "/sign-in";
    signIn.searchParams.set("next", pathname);
    return NextResponse.redirect(signIn);
  }

  if (user && pathname === "/sign-in") {
    const home = request.nextUrl.clone();
    home.pathname = "/practice";
    home.search = "";
    return NextResponse.redirect(home);
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except Next's internals and static files.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
