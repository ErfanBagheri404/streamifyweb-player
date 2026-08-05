"use client";

import Link from "next/link";

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-10" style={{ color: "var(--foreground)" }}>
      <Link href="/session" className="inline-flex items-center gap-1.5 text-xs font-medium mb-8 transition-colors hover:opacity-70" style={{ color: "var(--muted-foreground)" }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        Back to Sessions
      </Link>

      <h1 className="text-2xl font-bold mb-2">Privacy Policy</h1>
      <p className="text-xs mb-8" style={{ color: "var(--muted-foreground)" }}>Last updated: August 4, 2026</p>

      <div className="flex flex-col gap-6 text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>
        <section>
          <h2 className="text-base font-semibold mb-2">1. Information We Collect</h2>
          <ul className="text-sm list-disc pl-5 flex flex-col gap-1" style={{ color: "var(--muted-foreground)" }}>
            <li><span className="font-medium" style={{ color: "var(--foreground)" }}>Discord User ID and Username:</span> Collected when you connect your Discord account to identify you in sessions.</li>
            <li><span className="font-medium" style={{ color: "var(--foreground)" }}>Discord Avatar:</span> Used to display your profile picture in the session player.</li>
            <li><span className="font-medium" style={{ color: "var(--foreground)" }}>Session Activity:</span> Song queues, playback commands, and session interactions are stored temporarily to power the real-time session.</li>
            <li><span className="font-medium" style={{ color: "var(--foreground)" }}>Guild Information:</span> Server ID and name are used to link sessions to their respective Discord servers.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold mb-2">2. How We Use Your Information</h2>
          <ul className="text-sm list-disc pl-5 flex flex-col gap-1" style={{ color: "var(--muted-foreground)" }}>
            <li>To provide and maintain the session player functionality.</li>
            <li>To display your identity within active sessions.</li>
            <li>To manage playback permissions and roles.</li>
            <li>To enforce inactivity timeouts and session cleanup.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold mb-2">3. Data Storage and Retention</h2>
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            Session data is stored temporarily in Cloudflare Durable Objects and is automatically deleted when a session ends or becomes inactive (after 10 minutes of no user activity). We do not maintain long-term databases of your activity.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold mb-2">4. Third-Party Services</h2>
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            Streamify uses the following third-party services that may collect data according to their own privacy policies:
          </p>
          <ul className="text-sm list-disc pl-5 flex flex-col gap-1 mt-1" style={{ color: "var(--muted-foreground)" }}>
            <li>Discord (authentication and bot hosting)</li>
            <li>Cloudflare (web hosting and session relay)</li>
            <li>Vercel (web player hosting)</li>
            <li>Lavalink (audio streaming infrastructure)</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold mb-2">5. Data Sharing</h2>
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            We do not sell, trade, or share your personal information with third parties. Session data visible to other users within the same session (such as your username and avatar) is limited to that session context only.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold mb-2">6. Cookies and Local Storage</h2>
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            The web player uses browser local storage to remember your Discord authentication and recent sessions. This data stays on your device and is not sent to our servers beyond what is needed for authentication.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold mb-2">7. Security</h2>
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            We use industry-standard security measures including HTTPS encryption for all communications and shared secrets for server-to-server authentication. However, no method of transmission over the internet is 100% secure.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold mb-2">8. Children&apos;s Privacy</h2>
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            Streamify is not intended for users under 13 years of age. We do not knowingly collect information from children under 13.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold mb-2">9. Changes to This Policy</h2>
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            We may update this privacy policy at any time. Changes will be reflected on this page with an updated date.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold mb-2">10. Contact</h2>
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            For privacy-related questions, contact us on Discord: <span className="font-medium" style={{ color: "var(--foreground)" }}>erfanrevenant</span> (ID: 669264985947373596).
          </p>
        </section>
      </div>
    </div>
  );
}
