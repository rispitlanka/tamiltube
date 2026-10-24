import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-24 text-center">
      <h1 className="font-display text-3xl font-semibold">Page not found</h1>
      <Link href="/" className="btn-primary mt-6">
        Analyse a channel
      </Link>
    </div>
  );
}
