import { Card, CardContent, CardHeader, CardTitle } from "@edge/ui/components/card";
import { PageHeader } from "@edge/ui/shell/app-shell";
import type { Metadata } from "next";
import Link from "next/link";
import { requireStudent } from "@/lib/load";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const v = await requireStudent();
  return (
    <>
      <PageHeader help="/docs/profile" title="Profile" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Your details</CardTitle>
          </CardHeader>
          <CardContent>
            <ProfileForm name={v.user.name} jetaFxClientId={v.student.jetaFxClientId ?? ""} marketingConsent={v.student.marketingConsent} />
          </CardContent>
        </Card>
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Sign-in</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <div>
              <p className="text-muted-foreground">Email</p>
              <p className="font-medium">{v.user.email}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Mobile</p>
              <p className="font-medium">{v.user.phoneNumber ?? "Not verified"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Country (for VAT)</p>
              <p className="font-medium">{v.student.country}</p>
            </div>
            <p className="text-muted-foreground text-xs">To change your email, mobile or country, contact the academy.</p>
            <Link href="/change-password" className="text-edge-emerald font-semibold hover:underline">
              Change password
            </Link>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
