"use client";

import Link from "next/link";

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-10" style={{ color: "var(--foreground)" }}>
      <Link href="/session" className="inline-flex items-center gap-1.5 text-xs font-medium mb-8 transition-colors hover:opacity-70" style={{ color: "var(--muted-foreground)" }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        Back to Sessions
      </Link>

      <h1 className="text-2xl font-bold mb-2">Terms of Service</h1>
      <p className="text-xs mb-8" style={{ color: "var(--muted-foreground)" }}>Last updated: August 4, 2026</p>

      <div className="flex flex-col gap-6 text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>
        <section>
          <h2 className="text-base font-semibold mb-2">1. Acceptance of Terms</h2>
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            By accessing or using Streamify, including the Discord bot, web player, and session features, you agree to be bound by these Terms of Service. If you do not agree, do not use the service.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold mb-2">2. Description of Service</h2>
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            Streamify provides a Discord music bot that plays audio from YouTube, SoundCloud, and Spotify in voice channels, along with a web-based session player that allows remote control of playback. The service is provided free of charge.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold mb-2">3. User Responsibilities</h2>
          <ul className="text-sm list-disc pl-5 flex flex-col gap-1" style={{ color: "var(--muted-foreground)" }}>
            <li>You must comply with Discord&apos;s Terms of Service and Community Guidelines.</li>
            <li>You are responsible for your use of the bot within your Discord server.</li>
            <li>You must have the necessary permissions to invite the bot to your server.</li>
            <li>You must not use the service for any illegal or unauthorized purpose.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold mb-2">4. Intellectual Property</h2>
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            All content played through Streamify remains the intellectual property of its respective owners. Streamify does not claim ownership over any music or media content. The bot and web player software are developed and maintained independently.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold mb-2">5. Availability and Uptime</h2>
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            Streamify is provided on an &quot;as-is&quot; and &quot;as-available&quot; basis. We do not guarantee uninterrupted service. Maintenance, outages, and third-party API changes may affect availability at any time.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold mb-2">6. Limitation of Liability</h2>
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            To the fullest extent permitted by law, Streamify and its developers shall not be held liable for any damages, data loss, or service disruptions arising from your use of the service.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold mb-2">7. Termination</h2>
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            We reserve the right to restrict or terminate your access to the service at any time, without prior notice, for conduct that we believe violates these terms or is harmful to other users or the service.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold mb-2">8. Changes to Terms</h2>
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            We may update these terms at any time. Continued use of the service after changes constitutes acceptance of the new terms.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold mb-2">9. Contact</h2>
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            For questions about these terms, contact us on Discord: <span className="font-medium" style={{ color: "var(--foreground)" }}>erfanrevenant</span> (ID: 669264985947373596).
          </p>
        </section>
      </div>
    </div>
  );
}
