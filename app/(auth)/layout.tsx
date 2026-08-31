import { CinematicSplit } from "@/components/marketing/cinematic-split";

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <CinematicSplit>{children}</CinematicSplit>;
}
