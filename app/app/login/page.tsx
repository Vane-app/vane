"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mark } from "../../components/Falcon";
import { Back } from "../../components/Back";
import { EmailStep } from "../../components/EmailStep";

/**
 * Log in — for people who already have an account.
 *
 * Distinct from /start, which asks which side of the marketplace you want and then
 * runs onboarding. Returning users have already answered that, so this asks one thing
 * and drops them where they left off: earners on the campaign feed, businesses on
 * their dashboard.
 *
 * There is no password. The wallet is the identity, and the account is reached by
 * email — so the honest failure case here is "we don't know this address", not
 * "wrong password".
 */
export default function Login() {
  const router = useRouter();

  return (
    <main className="startpage">
      <div style={{ alignSelf: "flex-start" }}>
        <Back href="/" label="Home" />
      </div>
      <div className="fade-up" style={{ textAlign: "center", marginBottom: 30 }}>
        <Link href="/" className="row" style={{ gap: 10, marginBottom: 30, justifyContent: "center" }}>
          <Mark size={26} color="var(--amber)" />
          <b style={{ fontSize: 25, letterSpacing: "-.04em" }}>vane</b>
        </Link>
        <h1 style={{ fontSize: "clamp(28px, 3.4vw, 38px)", lineHeight: 1.05 }}>Welcome back</h1>
        <p className="sub" style={{ fontSize: 15, marginTop: 12, maxWidth: "32ch", marginInline: "auto" }}>
          Your email is your account. No password to remember.
        </p>
      </div>

      <div className="fade-up d1" style={{ width: "100%", maxWidth: 380 }}>
        <EmailStep
          submitLabel="Email me a code"
          onVerified={(user, isNew) => {
            // A brand-new address arriving at the login door still owes us onboarding;
            // sending them to a half-empty dashboard would be the wrong welcome.
            if (isNew) router.push("/start");
            else router.push(user.role === "business" ? "/business" : "/earnings");
          }}
        />
      </div>

      <p className="tiny fade-up d2" style={{ textAlign: "center", marginTop: 26 }}>
        New here? <Link href="/start" style={{ color: "var(--amber)", fontWeight: 700 }}>Get started</Link>
      </p>
    </main>
  );
}
