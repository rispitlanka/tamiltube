import type { Metadata } from "next";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Privacy policy" };

// Google requires a privacy policy before approving a YouTube API quota increase.
// Review this with someone qualified before launch — it is a starting point, not legal advice.
export default function Privacy() {
  return (
    <article className="mx-auto max-w-2xl space-y-4 pt-10 text-ink-soft">
      <h1 className="font-display text-3xl font-semibold text-ink">Privacy policy</h1>
      <p>
        {SITE.name} uses YouTube API Services to show public information about YouTube channels and videos. By using {SITE.name} you agree to
        the{" "}
        <a className="text-kolam underline" href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">
          YouTube Terms of Service
        </a>
        . Google's handling of data is described in the{" "}
        <a className="text-kolam underline" href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">
          Google Privacy Policy
        </a>
        .
      </p>
      <h2 className="font-display text-xl font-semibold text-ink">What we collect</h2>
      <p>
        Public channel and video data from the YouTube Data API (titles, descriptions, thumbnails and view, like and comment counts). We
        don't ask you to sign in and don't access private YouTube data. Thumbnails you upload for review are sent to our AI provider to
        generate feedback and are not stored.
      </p>
      <h2 className="font-display text-xl font-semibold text-ink">How long we keep it</h2>
      <p>
        We refresh stored YouTube data regularly and delete data for channels and videos that are no longer available. Server logs may
        include your IP address for rate limiting and security.
      </p>
      <h2 className="font-display text-xl font-semibold text-ink">Contact</h2>
      <p>For questions or deletion requests, contact the site owner.</p>
    </article>
  );
}
