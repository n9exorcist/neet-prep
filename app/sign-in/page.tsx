import { Suspense } from "react";

import { SignInForm } from "./sign-in-form";

export const metadata = { title: "Sign in — NEET Prep" };

export default function SignInPage() {
  return (
    <main className="mx-auto w-full max-w-[420px] px-4 py-12 sm:py-20">
      <h1 className="t-h2">Sign in</h1>
      <p className="t-ui mt-2 text-graphite">
        Your progress and your study plan are tied to this account.
      </p>

      <Suspense fallback={null}>
        <SignInForm />
      </Suspense>

      <p className="t-ui mt-8 text-graphite">
        We ask for an email, your target score and your exam date. Nothing else — no
        phone number, no address, no photograph.
      </p>
    </main>
  );
}
