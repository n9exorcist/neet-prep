import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { OnboardingForm } from "./onboarding-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Set up — NEET Prep" };

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in?next=/onboarding");

  const { data: existing } = await supabase
    .from("students")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (existing) redirect("/practice");

  return (
    <main className="mx-auto w-full max-w-[520px] px-4 py-12 sm:py-16">
      <h1 className="t-h2">A few details</h1>
      <p className="t-body mt-3 text-graphite">
        Your target score is the one that matters most. It decides which chapters are
        worth your hours — and which you can safely leave alone.
      </p>
      <OnboardingForm />
    </main>
  );
}
