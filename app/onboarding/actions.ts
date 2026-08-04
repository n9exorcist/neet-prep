"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type OnboardingResult = { ok: false; error: string } | undefined;

/**
 * Creates the student profile. Deliberately narrow: name, target, exam date,
 * quota and school type. Students are minors, so no phone number, no address,
 * no photograph - and no field here should be added without a hard reason.
 */
export async function saveProfile(
  _prev: OnboardingResult,
  formData: FormData,
): Promise<OnboardingResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Your session expired. Sign in again." };

  const name = String(formData.get("name") ?? "").trim();
  const target = Number(formData.get("target_score"));
  const examDate = String(formData.get("exam_date") ?? "").trim();
  const quota = String(formData.get("quota_category") ?? "").trim();
  const schoolType = String(formData.get("school_type") ?? "").trim();

  if (!name) return { ok: false, error: "Please enter your name." };
  if (!Number.isFinite(target) || target < 0 || target > 720) {
    return { ok: false, error: "Target score must be between 0 and 720." };
  }
  if (!examDate) return { ok: false, error: "Please enter your exam date." };
  if (schoolType && !["government", "private"].includes(schoolType)) {
    return { ok: false, error: "Unknown school type." };
  }

  const { error } = await supabase.from("students").upsert(
    {
      id: user.id,
      name,
      target_score: Math.round(target),
      exam_date: examDate,
      quota_category: quota || null,
      school_type: schoolType || null,
    },
    { onConflict: "id" },
  );

  if (error) return { ok: false, error: error.message };

  redirect("/practice");
}
