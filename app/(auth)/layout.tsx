export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-paper px-6 py-16">
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
