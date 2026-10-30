import Link from "next/link";
import { SITE } from "@/features/home/site";

// The 404 page (also exported as 404.html, which the Worker serves for unknown paths). It keeps the
// site's white look instead of the default page, which follows the system's dark mode.
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-white px-4 text-center">
      <p className="text-sm font-medium text-neutral-500">404</p>
      <h1 className="mt-2 text-3xl font-bold text-neutral-950">This page doesn&apos;t exist</h1>
      <p className="mt-3 max-w-md text-neutral-600">The link may be old, or the record it pointed to is not public.</p>
      <Link
        href="/"
        className="mt-8 rounded-full bg-[#0171E3] px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0171E3]"
      >
        Back to {SITE.name}
      </Link>
    </main>
  );
}
